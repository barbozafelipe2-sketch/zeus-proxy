-- Olympus Hub database schema (OH-002.6): fresh install OR in-place upgrade, idempotent.
-- This file is migrations/20260928000000_oh001_2.sql, migrations/20260929000000_oh001_3.sql,
-- migrations/20260930000000_oh001_4.sql, migrations/20261001000000_oh001_5.sql and
-- migrations/20261002000000_oh002_6.sql, verbatim and in that order (tests/sql.test.ts enforces
-- it). Migration file names are ordering keys, not release dates.

-- Olympus Hub OH-001.2 database schema.
--
-- Idempotent: run it on an empty Supabase project (fresh install) OR on an OH-001 / OH-001.1
-- database (in-place upgrade). Re-running it is safe. Requires Postgres 13+ (gen_random_uuid is
-- core) and the Supabase roles anon, authenticated and service_role.
--
-- Security model (no end-user auth yet): RLS is enabled on every table with NO policies and
-- table privileges are revoked from anon/authenticated, so browser keys can read/write nothing.
-- All access goes through SECURITY DEFINER functions (fixed search_path) that only
-- service_role may execute, and service_role is only used server-side.

begin;

-- ---------------------------------------------------------------------------------------------
-- Tables (created in their OH-001.2 shape; ALTERs below upgrade older databases).
-- ---------------------------------------------------------------------------------------------
create table if not exists projects (
  id text primary key,
  name text not null default 'Personal',
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key,
  project_id text not null references projects(id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists execution_traces (
  id uuid primary key,
  request_id uuid,
  conversation_id uuid,
  project_id text not null,
  status text not null,
  provider text,
  model text,
  mode text,
  latency_ms integer not null default 0,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists request_reservations (
  request_id uuid primary key,
  project_id text not null,
  conversation_id uuid not null,
  message_hash text not null,
  current_trace_id uuid not null,
  status text not null check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  attempts integer not null default 1,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zeus_core (
  id text primary key default 'primary',
  version integer not null default 1,
  identity jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists memory_items (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  type text not null,
  content text not null,
  status text not null default 'active',
  authority integer not null default 50,
  confidence real not null default 1,
  source_type text,
  source_id text,
  provenance jsonb not null default '{}'::jsonb,
  supersedes_id uuid references memory_items(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into projects (id, name) values ('default', 'Personal') on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- messages: monotonic seq (deterministic ordering) + request/trace linkage (exact replay).
-- ---------------------------------------------------------------------------------------------
alter table messages add column if not exists seq bigint;
alter table messages add column if not exists request_id uuid;
alter table messages add column if not exists trace_id uuid;
create sequence if not exists messages_seq_seq as bigint;

-- Backfill legacy rows. OH-001.1 inserted a user/assistant pair in one statement with identical
-- created_at, so ties are broken user-before-assistant, then by id.
with ordered as (
  select id,
         row_number() over (
           order by created_at,
                    case role when 'system' then 0 when 'user' then 1 else 2 end,
                    id
         ) as rn
  from messages
  where seq is null
)
update messages m
set seq = o.rn + coalesce((select max(seq) from messages where seq is not null), 0)
from ordered o
where m.id = o.id;

-- Move the sequence past existing rows (never backwards, safe to re-run).
select setval('messages_seq_seq', s.max_seq, true)
from (select coalesce(max(seq), 0) as max_seq from messages) s
where s.max_seq > 0 and s.max_seq >= (select last_value from messages_seq_seq);

alter table messages alter column seq set default nextval('messages_seq_seq');
alter table messages alter column seq set not null;
alter sequence messages_seq_seq owned by messages.seq;

create unique index if not exists messages_seq_key on messages (seq);
create index if not exists messages_conversation_seq_idx on messages (conversation_id, seq);
create unique index if not exists messages_request_role_key on messages (request_id, role)
  where request_id is not null;
drop index if exists messages_conversation_created_idx;

-- ---------------------------------------------------------------------------------------------
-- execution_traces: one row per attempt (request_id no longer unique; reservations own that).
-- ---------------------------------------------------------------------------------------------
alter table execution_traces drop constraint if exists execution_traces_request_id_key;
alter table execution_traces add column if not exists attempt integer not null default 1;
alter table execution_traces add column if not exists finish_reason text;
alter table execution_traces add column if not exists truncated boolean not null default false;
alter table execution_traces add column if not exists retry_count integer not null default 0;
alter table execution_traces add column if not exists updated_at timestamptz not null default now();
create index if not exists execution_traces_request_idx on execution_traces (request_id);
create index if not exists execution_traces_project_created_idx on execution_traces (project_id, created_at desc);

-- OH-001.1 reservation rows that never finished can no longer be reclaimed: close them.
update execution_traces
set status = 'INFRA_FAILED',
    error_code = 'LEGACY_ABANDONED',
    metadata = metadata || jsonb_build_object('status', 'INFRA_FAILED', 'errorCode', 'LEGACY_ABANDONED')
where status in ('RECEIVED', 'ROUTING', 'MODEL_RUNNING', 'PERSISTING')
  and request_id is not null
  and not exists (select 1 from request_reservations r where r.current_trace_id = execution_traces.id);

-- ---------------------------------------------------------------------------------------------
-- Functions. Old OH-001.1 signatures are dropped first.
-- ---------------------------------------------------------------------------------------------
drop function if exists reserve_request(uuid, uuid, uuid, text, text);
drop function if exists persist_completed_turn(uuid, text, text, text, jsonb);
drop function if exists get_conversation_history(uuid, text, integer);

-- Reserve (or reclaim) a request id before any provider spend.
--   reserved    -> caller owns the attempt (fresh, or reclaimed after FAILED / expired lease)
--   completed   -> replay: the assistant message stored for THIS request id
--   in_progress -> another attempt holds a live lease
--   conflict    -> request id reused for a different message/project, or conversation mismatch
-- Race safety: INSERT .. ON CONFLICT DO NOTHING + SELECT .. FOR UPDATE serialize competitors.
create or replace function reserve_request(
  p_request_id uuid,
  p_trace_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_mode text,
  p_message_hash text,
  p_lease_seconds integer default 180
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r request_reservations%rowtype;
  v_conv_project text;
  v_message text;
  v_trace jsonb;
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 180), 900));
begin
  if p_request_id is null or p_trace_id is null or p_conversation_id is null
     or p_project_id is null or p_message_hash is null then
    raise exception 'INVALID_RESERVATION_ARGS' using errcode = '22023';
  end if;

  insert into projects (id, name) values (p_project_id, p_project_id) on conflict (id) do nothing;

  select project_id into v_conv_project from conversations where id = p_conversation_id;
  if found and v_conv_project <> p_project_id then
    return jsonb_build_object('state', 'conflict', 'reason', 'CONVERSATION_PROJECT_MISMATCH');
  end if;

  insert into request_reservations (
    request_id, project_id, conversation_id, message_hash, current_trace_id, status, attempts, lease_expires_at
  ) values (
    p_request_id, p_project_id, p_conversation_id, p_message_hash, p_trace_id, 'IN_PROGRESS', 1,
    now() + make_interval(secs => v_lease)
  )
  on conflict (request_id) do nothing;

  if found then
    insert into execution_traces (id, request_id, attempt, conversation_id, project_id, status, mode, metadata)
    values (
      p_trace_id, p_request_id, 1, p_conversation_id, p_project_id, 'RECEIVED', p_mode,
      jsonb_build_object('traceId', p_trace_id, 'requestId', p_request_id, 'attempt', 1, 'status', 'RECEIVED')
    );
    return jsonb_build_object('state', 'reserved', 'conversationId', p_conversation_id, 'attempt', 1, 'reclaimed', false);
  end if;

  select * into r from request_reservations where request_id = p_request_id for update;

  if r.message_hash <> p_message_hash or r.project_id <> p_project_id then
    return jsonb_build_object('state', 'conflict', 'reason', 'REQUEST_ID_REUSED');
  end if;

  if r.status = 'COMPLETED' then
    select content into v_message from messages where request_id = p_request_id and role = 'assistant';
    select metadata into v_trace from execution_traces where id = r.current_trace_id;
    if v_message is null then
      return jsonb_build_object('state', 'conflict', 'reason', 'REPLAY_UNAVAILABLE');
    end if;
    return jsonb_build_object(
      'state', 'completed', 'conversationId', r.conversation_id, 'message', v_message, 'trace', v_trace
    );
  end if;

  if r.status = 'FAILED' or r.lease_expires_at is null or r.lease_expires_at <= now() then
    if r.status = 'IN_PROGRESS' then
      -- The previous holder crashed or hung past its lease: close its trace.
      update execution_traces
      set status = 'INFRA_FAILED',
          error_code = 'LEASE_EXPIRED',
          updated_at = now(),
          metadata = metadata || jsonb_build_object('status', 'INFRA_FAILED', 'errorCode', 'LEASE_EXPIRED')
      where id = r.current_trace_id
        and status in ('RECEIVED', 'ROUTING', 'MODEL_RUNNING', 'PERSISTING');
    end if;
    update request_reservations
    set current_trace_id = p_trace_id,
        status = 'IN_PROGRESS',
        attempts = r.attempts + 1,
        lease_expires_at = now() + make_interval(secs => v_lease),
        updated_at = now()
    where request_id = p_request_id;
    insert into execution_traces (id, request_id, attempt, conversation_id, project_id, status, mode, metadata)
    values (
      p_trace_id, p_request_id, r.attempts + 1, r.conversation_id, r.project_id, 'RECEIVED', p_mode,
      jsonb_build_object('traceId', p_trace_id, 'requestId', p_request_id, 'attempt', r.attempts + 1, 'status', 'RECEIVED')
    );
    return jsonb_build_object(
      'state', 'reserved', 'conversationId', r.conversation_id, 'attempt', r.attempts + 1, 'reclaimed', true
    );
  end if;

  return jsonb_build_object(
    'state', 'in_progress',
    'conversationId', r.conversation_id,
    'leaseRemainingMs', greatest(0, floor(extract(epoch from (r.lease_expires_at - now())) * 1000))::bigint
  );
end;
$$;

-- Atomically store a completed turn. Only the attempt that currently owns the reservation may
-- persist, so a stale attempt (lease reclaimed by a retry) cannot double-write.
create or replace function persist_completed_turn(
  p_request_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_user_text text,
  p_assistant_text text,
  p_trace jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r request_reservations%rowtype;
  v_trace_id uuid := (p_trace ->> 'traceId')::uuid;
  v_title text := left(regexp_replace(btrim(p_user_text), '\s+', ' ', 'g'), 80);
begin
  if coalesce(p_trace ->> 'status', '') <> 'COMPLETED' then
    raise exception 'INVALID_TRACE_STATUS';
  end if;
  select * into r from request_reservations where request_id = p_request_id for update;
  if not found or r.current_trace_id <> v_trace_id or r.status <> 'IN_PROGRESS' then
    raise exception 'RESERVATION_LOST';
  end if;
  if r.conversation_id <> p_conversation_id or r.project_id <> p_project_id then
    raise exception 'RESERVATION_MISMATCH';
  end if;

  insert into conversations (id, project_id, title, updated_at)
  values (p_conversation_id, p_project_id, v_title, now())
  on conflict (id) do update
    set updated_at = now(), title = coalesce(conversations.title, excluded.title)
    where conversations.project_id = excluded.project_id;
  if not found then
    raise exception 'CONVERSATION_PROJECT_MISMATCH';
  end if;

  -- Two statements so the user message always gets the lower seq.
  insert into messages (conversation_id, role, content, request_id, trace_id)
  values (p_conversation_id, 'user', p_user_text, p_request_id, v_trace_id);
  insert into messages (conversation_id, role, content, request_id, trace_id)
  values (p_conversation_id, 'assistant', p_assistant_text, p_request_id, v_trace_id);

  update execution_traces
  set conversation_id = p_conversation_id,
      project_id = p_project_id,
      status = p_trace ->> 'status',
      provider = p_trace ->> 'provider',
      model = p_trace ->> 'model',
      mode = p_trace ->> 'mode',
      latency_ms = coalesce((p_trace ->> 'latencyMs')::integer, 0),
      error_code = p_trace ->> 'errorCode',
      finish_reason = p_trace ->> 'finishReason',
      truncated = coalesce((p_trace ->> 'truncated')::boolean, false),
      retry_count = coalesce((p_trace ->> 'retryCount')::integer, 0),
      metadata = p_trace,
      updated_at = now()
  where id = v_trace_id;
  if not found then
    raise exception 'TRACE_RESERVATION_MISSING';
  end if;

  update request_reservations
  set status = 'COMPLETED', lease_expires_at = null, updated_at = now()
  where request_id = p_request_id;

  return jsonb_build_object('persisted', true);
end;
$$;

-- Record a failed attempt: update its trace (insert it if missing) and release the reservation
-- so the same request id can be retried. Returns what was written so the caller can audit.
create or replace function record_failed_attempt(p_request_id uuid, p_trace jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trace_id uuid := (p_trace ->> 'traceId')::uuid;
  v_mode text := 'none';
  v_released boolean := false;
begin
  if coalesce(p_trace ->> 'status', '') not in
     ('MODEL_FAILED', 'MODEL_TIMEOUT', 'PERSISTENCE_FAILED', 'INVALID_REQUEST', 'INFRA_FAILED') then
    raise exception 'INVALID_TRACE_STATUS';
  end if;

  update execution_traces
  set status = p_trace ->> 'status',
      provider = p_trace ->> 'provider',
      model = p_trace ->> 'model',
      mode = p_trace ->> 'mode',
      latency_ms = coalesce((p_trace ->> 'latencyMs')::integer, 0),
      error_code = p_trace ->> 'errorCode',
      finish_reason = p_trace ->> 'finishReason',
      truncated = coalesce((p_trace ->> 'truncated')::boolean, false),
      retry_count = coalesce((p_trace ->> 'retryCount')::integer, 0),
      metadata = p_trace,
      updated_at = now()
  where id = v_trace_id;

  if found then
    v_mode := 'updated';
  else
    insert into execution_traces (
      id, request_id, attempt, conversation_id, project_id, status, provider, model, mode,
      latency_ms, error_code, finish_reason, truncated, retry_count, metadata
    ) values (
      v_trace_id, p_request_id, coalesce((p_trace ->> 'attempt')::integer, 1),
      (p_trace ->> 'conversationId')::uuid, coalesce(p_trace ->> 'projectId', 'default'),
      p_trace ->> 'status', p_trace ->> 'provider', p_trace ->> 'model', p_trace ->> 'mode',
      coalesce((p_trace ->> 'latencyMs')::integer, 0), p_trace ->> 'errorCode', p_trace ->> 'finishReason',
      coalesce((p_trace ->> 'truncated')::boolean, false), coalesce((p_trace ->> 'retryCount')::integer, 0), p_trace
    )
    on conflict (id) do nothing;
    if found then
      v_mode := 'inserted';
    end if;
  end if;

  update request_reservations
  set status = 'FAILED', lease_expires_at = null, updated_at = now()
  where request_id = p_request_id and current_trace_id = v_trace_id and status = 'IN_PROGRESS';
  v_released := found;

  return jsonb_build_object('written', v_mode <> 'none', 'mode', v_mode, 'released', v_released);
end;
$$;

-- Most recent p_limit user/assistant messages, oldest first, ordered by seq (never by timestamp).
create or replace function get_conversation_history(
  p_conversation_id uuid,
  p_project_id text,
  p_limit integer default 40
) returns table (role text, content text, seq bigint)
language sql
stable
security definer
set search_path = public
as $$
  select x.role, x.content, x.seq
  from (
    select m.role, m.content, m.seq
    from messages m
    join conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and c.project_id = p_project_id
      and m.role in ('user', 'assistant')
    order by m.seq desc
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) x
  order by x.seq asc;
$$;

create or replace function list_conversations(p_project_id text, p_limit integer default 50)
returns table (id uuid, title text, updated_at timestamptz, message_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.updated_at,
         (select count(*) from messages m where m.conversation_id = c.id) as message_count
  from conversations c
  where c.project_id = p_project_id
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function get_conversation_messages(
  p_conversation_id uuid,
  p_project_id text,
  p_limit integer default 200
) returns table (
  id uuid, seq bigint, role text, content text, request_id uuid, created_at timestamptz, trace jsonb, title text
)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.seq, x.role, x.content, x.request_id, x.created_at, x.trace, x.title
  from (
    select m.id, m.seq, m.role, m.content, m.request_id, m.created_at,
           case when m.role = 'assistant' then t.metadata end as trace,
           c.title
    from messages m
    join conversations c on c.id = m.conversation_id
    left join execution_traces t on t.id = m.trace_id
    where m.conversation_id = p_conversation_id
      and c.project_id = p_project_id
      and m.role in ('user', 'assistant')
    order by m.seq desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) x
  order by x.seq asc;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: fail closed for browser roles, functions executable by service_role only.
-- ---------------------------------------------------------------------------------------------
alter table projects enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table execution_traces enable row level security;
alter table request_reservations enable row level security;
alter table zeus_core enable row level security;
alter table memory_items enable row level security;


-- Netlify DB: Supabase-only role revoke omitted;

-- Netlify DB: Supabase-only role revoke omitted;

revoke all on function reserve_request(uuid, uuid, uuid, text, text, text, integer) from public;
revoke all on function persist_completed_turn(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function record_failed_attempt(uuid, jsonb) from public;
revoke all on function get_conversation_history(uuid, text, integer) from public;
revoke all on function list_conversations(text, integer) from public;
revoke all on function get_conversation_messages(uuid, text, integer) from public;


-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

commit;

-- Olympus Hub OH-001.3 migration: Projects (one continuous chat per project, shared context),
-- pinning, and editable global "OlyHub system instructions".
--
-- Apply AFTER 20260928000000_oh001_2.sql (supabase/schema.sql contains both, in order).
-- Idempotent: re-running is safe. No row is deleted. One data change on upgrade: a legacy
-- (1.2 auto-created) project that holds several conversations keeps its most recently updated
-- one as the project chat; the others move to 'default' (Chats) so the one-chat rule can hold.
--   * projects gains instructions (optional per-project system prompt), updated_at, pinned_at.
--   * Each non-default project owns AT MOST ONE conversation (partial unique index
--     conversations_one_per_project). reserve_request creates it lazily and race-safely
--     (INSERT .. ON CONFLICT on that index) and redirects every request of the project to it.
--   * reserve_request no longer auto-creates unknown projects (only 'default'); it takes a
--     KEY SHARE lock on the project and a SHARE lock on the conversation so delete cannot race
--     an in-flight request.
--   * conversations gain pinned_at (only Chats outside projects are pinned; a project is pinned
--     as a whole); new project_references table (files/folders the model is told about: kind,
--     name, path, note - references only, no file contents).
--   * Weekly rolling project summaries: project_summaries (week, content, covered seq range,
--     model, created_at) + project_summary_jobs (one lease-guarded generation per project).
--   * New app_settings table (key 'system_instructions'): the user's edited global system
--     instructions. No row = use the versioned default file lib/context/system-instructions.md.
--   * New SECURITY DEFINER RPCs (service_role only): list_projects, get_project, create_project,
--     update_project, delete_project, set_project_pinned, set_conversation_pinned, list_pinned,
--     list_project_conversations, add_project_reference, delete_project_reference,
--     get_app_setting, set_app_setting, reset_app_setting, get_summary_state, claim_summary_job,
--     get_summary_messages, complete_summary_job, fail_summary_job.
-- RLS stays enabled with no policies; anon/authenticated keep zero privileges.

begin;

alter table projects add column if not exists instructions text;
alter table projects add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass
                 and conname = 'projects_name_length') then
    -- NOT VALID: legacy auto-created rows are not re-checked; every new write is.
    alter table projects add constraint projects_name_length
      check (char_length(btrim(name)) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass
                 and conname = 'projects_instructions_length') then
    alter table projects add constraint projects_instructions_length
      check (instructions is null or char_length(instructions) <= 8000) not valid;
  end if;
end $$;

alter table projects add column if not exists pinned_at timestamptz;
alter table conversations add column if not exists pinned_at timestamptz;

create table if not exists project_references (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  kind text not null check (kind in ('folder', 'file', 'link')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  path text not null check (char_length(btrim(path)) between 1 and 1024),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists project_references_project_idx on project_references (project_id, created_at);
alter table project_references enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

create index if not exists conversations_project_updated_idx on conversations (project_id, updated_at desc);
create index if not exists request_reservations_conversation_idx on request_reservations (conversation_id)
  where status = 'IN_PROGRESS';
create index if not exists request_reservations_project_idx on request_reservations (project_id)
  where status = 'IN_PROGRESS';

insert into projects (id, name) values ('default', 'Personal') on conflict do nothing;

-- One chat per project. Legacy projects with several conversations keep the most recently
-- updated one; the others (and their reservations, so replay keeps working) move to Chats.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public'
                 and indexname = 'conversations_one_per_project') then
    with ranked as (
      select id, row_number() over (partition by project_id order by updated_at desc, id) as rn
      from conversations
      where project_id <> 'default'
    )
    update conversations c set project_id = 'default'
    from ranked r
    where c.id = r.id and r.rn > 1;
    update request_reservations rr set project_id = 'default', updated_at = now()
    from conversations c
    where c.id = rr.conversation_id and c.project_id = 'default' and rr.project_id <> 'default';
    create unique index conversations_one_per_project on conversations (project_id)
      where project_id <> 'default';
  end if;
end $$;

-- Weekly rolling summary of a project's chat (decisions, open items, key facts). Each row is a
-- new version built from the previous summary + the messages after its covered range.
create table if not exists project_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  week date not null,
  content text not null check (char_length(content) between 1 and 12000),
  covered_from_seq bigint not null,
  covered_to_seq bigint not null,
  model text not null check (char_length(model) between 1 and 120),
  provider text not null check (provider in ('openai', 'claude', 'gemini')),
  created_at timestamptz not null default now(),
  constraint project_summaries_range check (covered_to_seq >= covered_from_seq)
);
create index if not exists project_summaries_project_idx on project_summaries (project_id, created_at desc, id desc);
alter table project_summaries enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

-- At most one summary generation per project: a lease + token, like request reservations.
create table if not exists project_summary_jobs (
  project_id text primary key references projects(id) on delete cascade,
  token uuid,
  status text not null default 'IDLE' check (status in ('IDLE', 'RUNNING', 'FAILED')),
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  last_error_at timestamptz
);
alter table project_summary_jobs enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

create table if not exists app_settings (
  key text primary key check (key in ('system_instructions')),
  value text not null check (char_length(value) between 1 and 20000),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

-- ---------------------------------------------------------------------------------------------
-- reserve_request (same signature as OH-001.2; see that migration for the state contract).
-- Changes: unknown non-default project -> conflict PROJECT_NOT_FOUND; row locks vs delete;
-- a project request always lands in the project's single chat (created lazily here).
-- ---------------------------------------------------------------------------------------------
create or replace function reserve_request(
  p_request_id uuid,
  p_trace_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_mode text,
  p_message_hash text,
  p_lease_seconds integer default 180
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r request_reservations%rowtype;
  v_conv_project text;
  v_conversation_id uuid := p_conversation_id;
  v_message text;
  v_trace jsonb;
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 180), 900));
begin
  if p_request_id is null or p_trace_id is null or p_conversation_id is null
     or p_project_id is null or p_message_hash is null then
    raise exception 'INVALID_RESERVATION_ARGS' using errcode = '22023';
  end if;

  if p_project_id = 'default' then
    insert into projects (id, name) values ('default', 'Personal') on conflict (id) do nothing;
  end if;
  -- KEY SHARE: delete_project (FOR UPDATE) waits for this transaction and then sees the reservation.
  perform 1 from projects where id = p_project_id for key share;
  if not found then
    return jsonb_build_object('state', 'conflict', 'reason', 'PROJECT_NOT_FOUND');
  end if;

  select project_id into v_conv_project from conversations where id = p_conversation_id for share;
  if found and v_conv_project <> p_project_id then
    return jsonb_build_object('state', 'conflict', 'reason', 'CONVERSATION_PROJECT_MISMATCH');
  end if;

  if p_project_id <> 'default'
     and not exists (select 1 from request_reservations where request_id = p_request_id) then
    -- The project's single chat: create it if missing. Concurrent first messages race on the
    -- partial unique index; the loser waits for the winner's commit, inserts nothing, and then
    -- reads the winner's row. Any conversation id sent by the client is redirected to it.
    insert into conversations (id, project_id, title, updated_at)
    values (p_conversation_id, p_project_id, null, now())
    on conflict (project_id) where project_id <> 'default' do nothing;
    select id into v_conversation_id from conversations where project_id = p_project_id for share;
  end if;

  insert into request_reservations (
    request_id, project_id, conversation_id, message_hash, current_trace_id, status, attempts, lease_expires_at
  ) values (
    p_request_id, p_project_id, v_conversation_id, p_message_hash, p_trace_id, 'IN_PROGRESS', 1,
    now() + make_interval(secs => v_lease)
  )
  on conflict (request_id) do nothing;

  if found then
    insert into execution_traces (id, request_id, attempt, conversation_id, project_id, status, mode, metadata)
    values (
      p_trace_id, p_request_id, 1, v_conversation_id, p_project_id, 'RECEIVED', p_mode,
      jsonb_build_object('traceId', p_trace_id, 'requestId', p_request_id, 'attempt', 1, 'status', 'RECEIVED')
    );
    return jsonb_build_object('state', 'reserved', 'conversationId', v_conversation_id, 'attempt', 1, 'reclaimed', false);
  end if;

  select * into r from request_reservations where request_id = p_request_id for update;

  if r.message_hash <> p_message_hash or r.project_id <> p_project_id then
    return jsonb_build_object('state', 'conflict', 'reason', 'REQUEST_ID_REUSED');
  end if;

  if r.status = 'COMPLETED' then
    select content into v_message from messages where request_id = p_request_id and role = 'assistant';
    select metadata into v_trace from execution_traces where id = r.current_trace_id;
    if v_message is null then
      return jsonb_build_object('state', 'conflict', 'reason', 'REPLAY_UNAVAILABLE');
    end if;
    return jsonb_build_object(
      'state', 'completed', 'conversationId', r.conversation_id, 'message', v_message, 'trace', v_trace
    );
  end if;

  if r.status = 'FAILED' or r.lease_expires_at is null or r.lease_expires_at <= now() then
    if r.status = 'IN_PROGRESS' then
      update execution_traces
      set status = 'INFRA_FAILED',
          error_code = 'LEASE_EXPIRED',
          updated_at = now(),
          metadata = metadata || jsonb_build_object('status', 'INFRA_FAILED', 'errorCode', 'LEASE_EXPIRED')
      where id = r.current_trace_id
        and status in ('RECEIVED', 'ROUTING', 'MODEL_RUNNING', 'PERSISTING');
    end if;
    update request_reservations
    set current_trace_id = p_trace_id,
        status = 'IN_PROGRESS',
        attempts = r.attempts + 1,
        lease_expires_at = now() + make_interval(secs => v_lease),
        updated_at = now()
    where request_id = p_request_id;
    insert into execution_traces (id, request_id, attempt, conversation_id, project_id, status, mode, metadata)
    values (
      p_trace_id, p_request_id, r.attempts + 1, r.conversation_id, r.project_id, 'RECEIVED', p_mode,
      jsonb_build_object('traceId', p_trace_id, 'requestId', p_request_id, 'attempt', r.attempts + 1, 'status', 'RECEIVED')
    );
    return jsonb_build_object(
      'state', 'reserved', 'conversationId', r.conversation_id, 'attempt', r.attempts + 1, 'reclaimed', true
    );
  end if;

  return jsonb_build_object(
    'state', 'in_progress',
    'conversationId', r.conversation_id,
    'leaseRemainingMs', greatest(0, floor(extract(epoch from (r.lease_expires_at - now())) * 1000))::bigint
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Projects API. Expected domain outcomes are returned as {"ok": false, "error": CODE}; only
-- programming errors raise. 'default' is the implicit "Chats" bucket and cannot be changed.
-- ---------------------------------------------------------------------------------------------
-- JSON shape of one summary row (used by get_project and the summary RPCs).
create or replace function summary_json(s project_summaries)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'week', s.week, 'content', s.content, 'coveredFromSeq', s.covered_from_seq,
    'coveredToSeq', s.covered_to_seq, 'model', s.model, 'provider', s.provider, 'createdAt', s.created_at
  ) end;
$$;

drop function if exists list_projects(integer);
create function list_projects(p_limit integer default 100)
returns table (
  id text, name text, instructions text, pinned_at timestamptz, created_at timestamptz,
  updated_at timestamptz, conversation_id uuid, message_count bigint, last_activity_at timestamptz,
  reference_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.instructions, p.pinned_at, p.created_at, p.updated_at,
         c.id as conversation_id,
         (select count(*) from messages m where m.conversation_id = c.id) as message_count,
         c.updated_at as last_activity_at,
         (select count(*) from project_references r where r.project_id = p.id) as reference_count
  from projects p
  left join conversations c on c.project_id = p.id
  where p.id <> 'default'
  order by lower(p.name), p.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

-- Project + its references (the shared context of the project chat) + its chat id; null if missing.
create or replace function get_project(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'instructions', p.instructions, 'pinnedAt', p.pinned_at,
    'conversationId', (select c.id from conversations c where c.project_id = p.id),
    'messageCount', (select count(*) from messages m join conversations c on c.id = m.conversation_id
                     where c.project_id = p.id),
    'summary', (select summary_json(s) from project_summaries s where s.project_id = p.id
                order by s.created_at desc, s.id desc limit 1),
    'summaryJob', (select jsonb_build_object(
                     'status', j.status, 'running', j.status = 'RUNNING' and j.lease_expires_at > now(),
                     'lastError', j.last_error, 'lastErrorAt', j.last_error_at, 'finishedAt', j.finished_at)
                   from project_summary_jobs j where j.project_id = p.id),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'name', r.name, 'path', r.path, 'note', r.note, 'createdAt', r.created_at
      ) order by r.created_at, r.id)
      from project_references r where r.project_id = p.id
    ), '[]'::jsonb)
  )
  from projects p
  where p.id = p_id and p.id <> 'default';
$$;

create or replace function create_project(p_id text, p_name text, p_instructions text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
begin
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or p_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PROJECT_ID');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PROJECT_NAME');
  end if;
  if v_instructions is not null and char_length(v_instructions) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'INSTRUCTIONS_TOO_LONG');
  end if;
  if (select count(*) from projects where id <> 'default') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_LIMIT');
  end if;
  insert into projects (id, name, instructions, updated_at)
  values (p_id, v_name, v_instructions, now())
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_EXISTS');
  end if;
  return jsonb_build_object('ok', true, 'project', jsonb_build_object(
    'id', p_id, 'name', v_name, 'instructions', v_instructions, 'pinnedAt', null,
    'conversationId', null, 'messageCount', 0, 'references', '[]'::jsonb
  ));
end;
$$;

-- p_name null = keep; p_set_instructions = false keeps instructions, true replaces (''/null clears).
create or replace function update_project(
  p_id text, p_name text, p_instructions text, p_set_instructions boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := case when p_name is null then null else btrim(p_name) end;
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_row projects%rowtype;
begin
  if p_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_PROTECTED');
  end if;
  if v_name is not null and char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PROJECT_NAME');
  end if;
  if p_set_instructions and v_instructions is not null and char_length(v_instructions) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'INSTRUCTIONS_TOO_LONG');
  end if;
  update projects
  set name = coalesce(v_name, name),
      instructions = case when p_set_instructions then v_instructions else instructions end,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'project', jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'instructions', v_row.instructions, 'pinnedAt', v_row.pinned_at,
    'conversationId', (select c.id from conversations c where c.project_id = v_row.id)
  ));
end;
$$;

-- Deletes a project. Its chat is NOT deleted: it moves to 'default' (Chats) with its history.
-- Refused while a request in the project holds a live lease (PROJECT_BUSY).
create or replace function delete_project(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
begin
  if p_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_PROTECTED');
  end if;
  perform 1 from projects where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  if exists (
    select 1 from request_reservations
    where project_id = p_id and status = 'IN_PROGRESS' and lease_expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_BUSY');
  end if;
  insert into projects (id, name) values ('default', 'Personal') on conflict (id) do nothing;
  update conversations set project_id = 'default' where project_id = p_id;
  get diagnostics v_moved = row_count;
  -- Keep replay/retry of finished requests working for the moved conversations.
  update request_reservations set project_id = 'default', updated_at = now() where project_id = p_id;
  delete from projects where id = p_id;
  return jsonb_build_object('ok', true, 'movedConversations', v_moved);
end;
$$;

-- OH-001.3 drafts had move_conversation; with one chat per project it no longer exists.
drop function if exists move_conversation(uuid, text, text);

create or replace function set_project_pinned(p_id text, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_PROTECTED');
  end if;
  if p_pinned and (select count(*) from projects where pinned_at is not null and id <> p_id)
                  + (select count(*) from conversations where pinned_at is not null
                     and project_id = 'default') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'PIN_LIMIT');
  end if;
  update projects
  set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'pinned', p_pinned);
end;
$$;

create or replace function set_conversation_pinned(p_conversation_id uuid, p_project_id text, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A project chat is pinned by pinning its project.
  if p_project_id <> 'default' then
    return jsonb_build_object('ok', false, 'error', 'PIN_PROJECT_INSTEAD');
  end if;
  if p_pinned and (select count(*) from projects where pinned_at is not null and id <> 'default')
                  + (select count(*) from conversations where pinned_at is not null
                     and project_id = 'default' and id <> p_conversation_id) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'PIN_LIMIT');
  end if;
  update conversations
  set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end
  where id = p_conversation_id and project_id = p_project_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'CONVERSATION_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'pinned', p_pinned);
end;
$$;

-- Pinned projects and pinned Chats (outside projects), most recently pinned first.
create or replace function list_pinned()
returns table (kind text, id text, name text, project_id text, pinned_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'project'::text as kind, p.id, p.name, p.id as project_id, p.pinned_at, p.updated_at
    from projects p
    where p.pinned_at is not null and p.id <> 'default'
    union all
    select 'conversation'::text, c.id::text, coalesce(c.title, 'Untitled'), c.project_id, c.pinned_at, c.updated_at
    from conversations c
    where c.pinned_at is not null and c.project_id = 'default'
  ) x
  order by x.pinned_at desc, x.id
  limit 50;
$$;

-- Conversations of one project with pin state (OH-001.2 list_conversations is kept unchanged).
create or replace function list_project_conversations(p_project_id text, p_limit integer default 50)
returns table (id uuid, title text, updated_at timestamptz, message_count bigint, pinned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.updated_at,
         (select count(*) from messages m where m.conversation_id = c.id) as message_count,
         c.pinned_at
  from conversations c
  where c.project_id = p_project_id
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function add_project_reference(
  p_project_id text, p_kind text, p_name text, p_path text, p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_path text := btrim(coalesce(p_path, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('folder', 'file', 'link') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REFERENCE');
  end if;
  if char_length(v_name) not between 1 and 120 or char_length(v_path) not between 1 and 1024
     or (v_note is not null and char_length(v_note) > 1000) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REFERENCE');
  end if;
  if p_project_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_PROTECTED');
  end if;
  perform 1 from projects where id = p_project_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  if (select count(*) from project_references where project_id = p_project_id) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'REFERENCE_LIMIT');
  end if;
  insert into project_references (project_id, kind, name, path, note)
  values (p_project_id, p_kind, v_name, v_path, v_note)
  returning id into v_id;
  update projects set updated_at = now() where id = p_project_id;
  return jsonb_build_object('ok', true, 'reference', jsonb_build_object(
    'id', v_id, 'kind', p_kind, 'name', v_name, 'path', v_path, 'note', v_note
  ));
end;
$$;

create or replace function delete_project_reference(p_project_id text, p_reference_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from project_references where id = p_reference_id and project_id = p_project_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'REFERENCE_NOT_FOUND');
  end if;
  update projects set updated_at = now() where id = p_project_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Weekly project summaries.
-- ---------------------------------------------------------------------------------------------
-- Latest summary, the chat's message range and the generation job; null if the project is missing.
create or replace function get_summary_state(p_project_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversationId', c.id,
    'maxSeq', (select max(m.seq) from messages m where m.conversation_id = c.id and m.role in ('user', 'assistant')),
    'latest', (select summary_json(s) from project_summaries s where s.project_id = p.id
               order by s.created_at desc, s.id desc limit 1),
    'job', (select jsonb_build_object(
              'status', j.status, 'running', j.status = 'RUNNING' and j.lease_expires_at > now(),
              'leaseExpiresAt', j.lease_expires_at, 'finishedAt', j.finished_at, 'attempts', j.attempts,
              'lastError', j.last_error, 'lastErrorAt', j.last_error_at)
            from project_summary_jobs j where j.project_id = p.id)
  )
  from projects p
  left join conversations c on c.project_id = p.id
  where p.id = p_project_id and p.id <> 'default';
$$;

-- Claims the project's summary generation if it is stale (or forced) and nobody holds a live
-- lease. States: no_messages | fresh | busy | claimed. Stale = no summary, older than
-- p_max_age_seconds, or messages after its covered range.
create or replace function claim_summary_job(
  p_project_id text, p_token uuid, p_force boolean, p_max_age_seconds integer, p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_max bigint;
  v_latest project_summaries%rowtype;
  v_job project_summary_jobs%rowtype;
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  if p_token is null then
    raise exception 'INVALID_SUMMARY_ARGS' using errcode = '22023';
  end if;
  perform 1 from projects where id = p_project_id and id <> 'default' for key share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  select id into v_conv from conversations where project_id = p_project_id;
  select max(seq) into v_max from messages where conversation_id = v_conv and role in ('user', 'assistant');
  if v_conv is null or v_max is null then
    return jsonb_build_object('ok', true, 'state', 'no_messages');
  end if;
  select * into v_latest from project_summaries where project_id = p_project_id
  order by created_at desc, id desc limit 1;
  if not coalesce(p_force, false) and v_latest.id is not null and v_latest.covered_to_seq >= v_max
     and v_latest.created_at > now() - make_interval(secs => greatest(60, coalesce(p_max_age_seconds, 604800))) then
    return jsonb_build_object('ok', true, 'state', 'fresh', 'latest', summary_json(v_latest));
  end if;
  insert into project_summary_jobs (project_id) values (p_project_id) on conflict (project_id) do nothing;
  select * into v_job from project_summary_jobs where project_id = p_project_id for update;
  if v_job.status = 'RUNNING' and v_job.lease_expires_at > now() then
    return jsonb_build_object('ok', true, 'state', 'busy');
  end if;
  update project_summary_jobs
  set token = p_token, status = 'RUNNING', lease_expires_at = now() + make_interval(secs => v_lease),
      started_at = now(), attempts = attempts + 1
  where project_id = p_project_id;
  return jsonb_build_object(
    'ok', true, 'state', 'claimed', 'conversationId', v_conv, 'maxSeq', v_max,
    'previous', summary_json(v_latest)
  );
end;
$$;

-- Messages of the project chat after a seq, oldest first (incremental catch-up).
create or replace function get_summary_messages(p_project_id text, p_after_seq bigint, p_limit integer default 200)
returns table (role text, content text, seq bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.role, m.content, m.seq
  from messages m
  join conversations c on c.id = m.conversation_id
  where c.project_id = p_project_id and p_project_id <> 'default'
    and m.role in ('user', 'assistant') and m.seq > coalesce(p_after_seq, 0)
  order by m.seq asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

-- Stores the new summary only if the caller still owns the job (token match), then releases it.
create or replace function complete_summary_job(
  p_project_id text, p_token uuid, p_week date, p_content text, p_from_seq bigint, p_to_seq bigint,
  p_model text, p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job project_summary_jobs%rowtype;
  v_row project_summaries%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  select * into v_job from project_summary_jobs where project_id = p_project_id for update;
  if not found or v_job.status <> 'RUNNING' or v_job.token is distinct from p_token then
    return jsonb_build_object('ok', false, 'error', 'SUMMARY_JOB_LOST');
  end if;
  if char_length(v_content) not between 1 and 12000 or p_week is null or p_from_seq is null
     or p_to_seq is null or p_to_seq < p_from_seq or p_provider not in ('openai', 'claude', 'gemini')
     or char_length(coalesce(p_model, '')) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SUMMARY');
  end if;
  insert into project_summaries (project_id, conversation_id, week, content, covered_from_seq, covered_to_seq, model, provider)
  values (p_project_id, (select id from conversations where project_id = p_project_id), p_week, v_content,
          p_from_seq, p_to_seq, p_model, p_provider)
  returning * into v_row;
  update project_summary_jobs
  set status = 'IDLE', token = null, lease_expires_at = null, finished_at = now()
  where project_id = p_project_id;
  return jsonb_build_object('ok', true, 'summary', summary_json(v_row));
end;
$$;

-- Records a failed generation (the previous summary stays the latest). Token-guarded.
create or replace function fail_summary_job(p_project_id text, p_token uuid, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update project_summary_jobs
  set status = 'FAILED', token = null, lease_expires_at = null, finished_at = now(),
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'UNKNOWN'), 200), last_error_at = now()
  where project_id = p_project_id and status = 'RUNNING' and token = p_token;
  return jsonb_build_object('ok', true, 'recorded', found);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- App settings. Only 'system_instructions' exists: the user's edited global system prompt.
-- ---------------------------------------------------------------------------------------------
create or replace function get_app_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('value', s.value, 'updatedAt', s.updated_at)
  from app_settings s
  where s.key = p_key;
$$;

create or replace function set_app_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated timestamptz;
begin
  if p_key is null or p_key not in ('system_instructions') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if p_value is null or char_length(btrim(p_value)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if char_length(p_value) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'SETTING_TOO_LONG');
  end if;
  insert into app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning updated_at into v_updated;
  return jsonb_build_object('ok', true, 'updatedAt', v_updated);
end;
$$;

-- Deleting the row restores the default (the versioned file shipped with the app).
create or replace function reset_app_setting(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or p_key not in ('system_instructions') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  delete from app_settings where key = p_key;
  return jsonb_build_object('ok', true, 'reset', found);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges (RLS already enabled on projects with no policies by OH-001.2).
-- ---------------------------------------------------------------------------------------------
alter table projects enable row level security;
alter table project_references enable row level security;
alter table app_settings enable row level security;
alter table project_summaries enable row level security;
alter table project_summary_jobs enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

revoke all on function list_projects(integer) from public;
revoke all on function get_project(text) from public;
revoke all on function create_project(text, text, text) from public;
revoke all on function update_project(text, text, text, boolean) from public;
revoke all on function delete_project(text) from public;
revoke all on function reserve_request(uuid, uuid, uuid, text, text, text, integer) from public;
revoke all on function set_project_pinned(text, boolean) from public;
revoke all on function set_conversation_pinned(uuid, text, boolean) from public;
revoke all on function list_pinned() from public;
revoke all on function list_project_conversations(text, integer) from public;
revoke all on function add_project_reference(text, text, text, text, text) from public;
revoke all on function delete_project_reference(text, uuid) from public;
revoke all on function summary_json(project_summaries) from public;
revoke all on function get_summary_state(text) from public;
revoke all on function claim_summary_job(text, uuid, boolean, integer, integer) from public;
revoke all on function get_summary_messages(text, bigint, integer) from public;
revoke all on function complete_summary_job(text, uuid, date, text, bigint, bigint, text, text) from public;
revoke all on function fail_summary_job(text, uuid, text) from public;
revoke all on function get_app_setting(text) from public;
revoke all on function set_app_setting(text, text) from public;
revoke all on function reset_app_setting(text) from public;


-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

commit;

-- OH-001.4: summary schedule (interval setting + cron candidates), Google Drive sync bookkeeping,
-- and "Clear chat history" (soft archive of summarized messages).
-- Idempotent; apply after 20260929000000_oh001_3.sql. Non-destructive: only adds columns, one
-- index, one check, and replaces functions (same signatures) so archived messages are hidden.
-- New RPCs: archive_project_history, set_project_drive_sync, get_drive_sync_status,
--   list_summary_candidates, list_drive_sync_pending, get_app_settings, claim_drive_sync.
-- Replaced RPC: delete_project (same signature) also un-archives the moved chat's messages.
-- RLS stays enabled with no policies; anon/authenticated keep zero privileges.

begin;

-- Soft archive: archived messages stay in the table but are excluded from history, the UI,
-- message counts and summary input. Only messages covered by a summary are ever archived.
alter table messages add column if not exists archived_at timestamptz;
create index if not exists messages_conversation_live_seq
  on messages (conversation_id, seq) where archived_at is null;

-- Google Drive: one Google Doc per project, updated in place.
alter table projects add column if not exists drive_file_id text;
alter table projects add column if not exists drive_synced_at timestamptz;
alter table projects add column if not exists drive_synced_summary_id uuid;
alter table projects add column if not exists drive_sync_error text;
alter table projects add column if not exists drive_sync_error_at timestamptz;
-- Short lease so two writers (cron catch-up and a chat-open generation, or two cron runs) never
-- sync the same project at once: that is the only way a second doc could be created.
alter table projects add column if not exists drive_sync_lease_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass
                 and conname = 'projects_drive_file_id_format') then
    alter table projects add constraint projects_drive_file_id_format
      check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$') not valid;
  end if;
end $$;

-- New settings keys: summary interval (days) and the Drive folder id.
alter table app_settings drop constraint if exists app_settings_key_check;
-- NOT VALID (OH-001.5): re-running this file on a newer database must not fail on rows with keys
-- added later (the later migration re-adds the full, validated check right after).
alter table app_settings add constraint app_settings_key_check
  check (key in ('system_instructions', 'summary_interval_days', 'drive_folder_id')) not valid;

-- ---------------------------------------------------------------------------------------------
-- Readers: same signatures as 1.2/1.3, archived messages excluded.
-- ---------------------------------------------------------------------------------------------
create or replace function get_conversation_history(
  p_conversation_id uuid,
  p_project_id text,
  p_limit integer default 40
) returns table (role text, content text, seq bigint)
language sql
stable
security definer
set search_path = public
as $$
  select x.role, x.content, x.seq
  from (
    select m.role, m.content, m.seq
    from messages m
    join conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and c.project_id = p_project_id
      and m.role in ('user', 'assistant')
      and m.archived_at is null
    order by m.seq desc
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) x
  order by x.seq asc;
$$;

create or replace function list_conversations(p_project_id text, p_limit integer default 50)
returns table (id uuid, title text, updated_at timestamptz, message_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.updated_at,
         (select count(*) from messages m where m.conversation_id = c.id and m.archived_at is null) as message_count
  from conversations c
  where c.project_id = p_project_id
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function get_conversation_messages(
  p_conversation_id uuid,
  p_project_id text,
  p_limit integer default 200
) returns table (
  id uuid, seq bigint, role text, content text, request_id uuid, created_at timestamptz, trace jsonb, title text
)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.seq, x.role, x.content, x.request_id, x.created_at, x.trace, x.title
  from (
    select m.id, m.seq, m.role, m.content, m.request_id, m.created_at,
           case when m.role = 'assistant' then t.metadata end as trace,
           c.title
    from messages m
    join conversations c on c.id = m.conversation_id
    left join execution_traces t on t.id = m.trace_id
    where m.conversation_id = p_conversation_id
      and c.project_id = p_project_id
      and m.role in ('user', 'assistant')
      and m.archived_at is null
    order by m.seq desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) x
  order by x.seq asc;
$$;

create or replace function list_projects(p_limit integer default 100)
returns table (
  id text, name text, instructions text, pinned_at timestamptz, created_at timestamptz,
  updated_at timestamptz, conversation_id uuid, message_count bigint, last_activity_at timestamptz,
  reference_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.instructions, p.pinned_at, p.created_at, p.updated_at,
         c.id as conversation_id,
         (select count(*) from messages m where m.conversation_id = c.id and m.archived_at is null) as message_count,
         c.updated_at as last_activity_at,
         (select count(*) from project_references r where r.project_id = p.id) as reference_count
  from projects p
  left join conversations c on c.project_id = p.id
  where p.id <> 'default'
  order by lower(p.name), p.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

create or replace function get_project(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'instructions', p.instructions, 'pinnedAt', p.pinned_at,
    'conversationId', (select c.id from conversations c where c.project_id = p.id),
    'messageCount', (select count(*) from messages m join conversations c on c.id = m.conversation_id
                     where c.project_id = p.id and m.archived_at is null),
    'archivedCount', (select count(*) from messages m join conversations c on c.id = m.conversation_id
                      where c.project_id = p.id and m.archived_at is not null),
    'summary', (select summary_json(s) from project_summaries s where s.project_id = p.id
                order by s.created_at desc, s.id desc limit 1),
    'summaryJob', (select jsonb_build_object(
                     'status', j.status, 'running', j.status = 'RUNNING' and j.lease_expires_at > now(),
                     'lastError', j.last_error, 'lastErrorAt', j.last_error_at, 'finishedAt', j.finished_at)
                   from project_summary_jobs j where j.project_id = p.id),
    'drive', jsonb_build_object(
      'fileId', p.drive_file_id, 'syncedAt', p.drive_synced_at,
      'syncedSummaryId', p.drive_synced_summary_id,
      'error', p.drive_sync_error, 'errorAt', p.drive_sync_error_at),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'name', r.name, 'path', r.path, 'note', r.note, 'createdAt', r.created_at
      ) order by r.created_at, r.id)
      from project_references r where r.project_id = p.id
    ), '[]'::jsonb)
  )
  from projects p
  where p.id = p_id and p.id <> 'default';
$$;

create or replace function list_project_conversations(p_project_id text, p_limit integer default 50)
returns table (id uuid, title text, updated_at timestamptz, message_count bigint, pinned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.updated_at,
         (select count(*) from messages m where m.conversation_id = c.id and m.archived_at is null) as message_count,
         c.pinned_at
  from conversations c
  where c.project_id = p_project_id
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function get_summary_state(p_project_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversationId', c.id,
    'maxSeq', (select max(m.seq) from messages m where m.conversation_id = c.id
               and m.role in ('user', 'assistant') and m.archived_at is null),
    'latest', (select summary_json(s) from project_summaries s where s.project_id = p.id
               order by s.created_at desc, s.id desc limit 1),
    'job', (select jsonb_build_object(
              'status', j.status, 'running', j.status = 'RUNNING' and j.lease_expires_at > now(),
              'leaseExpiresAt', j.lease_expires_at, 'finishedAt', j.finished_at, 'attempts', j.attempts,
              'lastError', j.last_error, 'lastErrorAt', j.last_error_at)
            from project_summary_jobs j where j.project_id = p.id)
  )
  from projects p
  left join conversations c on c.project_id = p.id
  where p.id = p_project_id and p.id <> 'default';
$$;

-- Same contract as 1.3 (no_messages | fresh | busy | claimed); counts live messages only, so a
-- fully cleared chat with nothing new is not re-summarized.
create or replace function claim_summary_job(
  p_project_id text, p_token uuid, p_force boolean, p_max_age_seconds integer, p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_max bigint;
  v_latest project_summaries%rowtype;
  v_job project_summary_jobs%rowtype;
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  if p_token is null then
    raise exception 'INVALID_SUMMARY_ARGS' using errcode = '22023';
  end if;
  perform 1 from projects where id = p_project_id and id <> 'default' for key share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  select id into v_conv from conversations where project_id = p_project_id;
  select max(seq) into v_max from messages
  where conversation_id = v_conv and role in ('user', 'assistant') and archived_at is null;
  if v_conv is null or v_max is null then
    return jsonb_build_object('ok', true, 'state', 'no_messages');
  end if;
  select * into v_latest from project_summaries where project_id = p_project_id
  order by created_at desc, id desc limit 1;
  if not coalesce(p_force, false) and v_latest.id is not null and v_latest.covered_to_seq >= v_max
     and v_latest.created_at > now() - make_interval(secs => greatest(60, coalesce(p_max_age_seconds, 259200))) then
    return jsonb_build_object('ok', true, 'state', 'fresh', 'latest', summary_json(v_latest));
  end if;
  insert into project_summary_jobs (project_id) values (p_project_id) on conflict (project_id) do nothing;
  select * into v_job from project_summary_jobs where project_id = p_project_id for update;
  if v_job.status = 'RUNNING' and v_job.lease_expires_at > now() then
    return jsonb_build_object('ok', true, 'state', 'busy');
  end if;
  update project_summary_jobs
  set token = p_token, status = 'RUNNING', lease_expires_at = now() + make_interval(secs => v_lease),
      started_at = now(), attempts = attempts + 1
  where project_id = p_project_id;
  return jsonb_build_object(
    'ok', true, 'state', 'claimed', 'conversationId', v_conv, 'maxSeq', v_max,
    'previous', summary_json(v_latest)
  );
end;
$$;

create or replace function get_summary_messages(p_project_id text, p_after_seq bigint, p_limit integer default 200)
returns table (role text, content text, seq bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.role, m.content, m.seq
  from messages m
  join conversations c on c.id = m.conversation_id
  where c.project_id = p_project_id and p_project_id <> 'default'
    and m.role in ('user', 'assistant') and m.seq > coalesce(p_after_seq, 0)
    and m.archived_at is null
  order by m.seq asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

-- ---------------------------------------------------------------------------------------------
-- Clear chat history: archives the project chat's messages up to the latest summary's covered
-- range, cut at the last assistant message inside it (whole turns only). Nothing that is not
-- summarized is ever archived. Returns {archived, upToSeq, remaining, reason?}.
-- ---------------------------------------------------------------------------------------------
create or replace function archive_project_history(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_covered bigint;
  v_upto bigint;
  v_count integer;
begin
  perform 1 from projects where id = p_project_id and id <> 'default' for key share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  select id into v_conv from conversations where project_id = p_project_id for update;
  if v_conv is null then
    return jsonb_build_object('ok', true, 'archived', 0, 'upToSeq', null, 'remaining', 0, 'reason', 'no_messages');
  end if;
  select covered_to_seq into v_covered from project_summaries where project_id = p_project_id
  order by created_at desc, id desc limit 1;
  if v_covered is null then
    return jsonb_build_object('ok', true, 'archived', 0, 'upToSeq', null,
      'remaining', (select count(*) from messages where conversation_id = v_conv and archived_at is null),
      'reason', 'no_summary');
  end if;
  select max(seq) into v_upto from messages
  where conversation_id = v_conv and role = 'assistant' and seq <= v_covered;
  if v_upto is not null then
    update messages set archived_at = now()
    where conversation_id = v_conv and seq <= v_upto and archived_at is null;
    get diagnostics v_count = row_count;
  end if;
  return jsonb_build_object('ok', true, 'archived', coalesce(v_count, 0), 'upToSeq', v_upto,
    'remaining', (select count(*) from messages where conversation_id = v_conv and archived_at is null));
end;
$$;

-- Deleting a project deletes its summaries (cascade) and moves its chat to Chats. Messages that
-- "Clear chat history" archived were only represented by that summary, so they are restored
-- (archived_at = null) in the moved chat instead of becoming unreachable. Same signature as 1.3.
create or replace function delete_project(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
begin
  if p_id = 'default' then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_PROTECTED');
  end if;
  perform 1 from projects where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  if exists (
    select 1 from request_reservations
    where project_id = p_id and status = 'IN_PROGRESS' and lease_expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_BUSY');
  end if;
  insert into projects (id, name) values ('default', 'Personal') on conflict (id) do nothing;
  update messages set archived_at = null
  where archived_at is not null
    and conversation_id in (select id from conversations where project_id = p_id);
  update conversations set project_id = 'default' where project_id = p_id;
  get diagnostics v_moved = row_count;
  -- Keep replay/retry of finished requests working for the moved conversations.
  update request_reservations set project_id = 'default', updated_at = now() where project_id = p_id;
  delete from projects where id = p_id;
  return jsonb_build_object('ok', true, 'movedConversations', v_moved);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Google Drive sync bookkeeping.
-- ---------------------------------------------------------------------------------------------
-- Success (p_error null): stores the doc id and which summary it holds. Failure: records the
-- error and keeps the last good state. The file id is validated (Drive ids are [A-Za-z0-9_-]).
create or replace function set_project_drive_sync(
  p_project_id text, p_file_id text, p_summary_id uuid, p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_file_id is not null and p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DRIVE_FILE_ID');
  end if;
  if p_error is null then
    update projects
    set drive_file_id = coalesce(p_file_id, drive_file_id), drive_synced_at = now(),
        drive_synced_summary_id = coalesce(p_summary_id, drive_synced_summary_id),
        drive_sync_error = null, drive_sync_error_at = null, drive_sync_lease_until = null
    where id = p_project_id and id <> 'default';
  else
    update projects
    set drive_file_id = coalesce(p_file_id, drive_file_id),
        drive_sync_error = left(btrim(p_error), 300), drive_sync_error_at = now(),
        drive_sync_lease_until = null
    where id = p_project_id and id <> 'default';
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROJECT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Takes the per-project Drive sync lease; false when another writer holds it.
create or replace function claim_drive_sync(p_project_id text, p_lease_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update projects
  set drive_sync_lease_until = now() + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 120), 600)))
  where id = p_project_id and id <> 'default'
    and (drive_sync_lease_until is null or drive_sync_lease_until <= now());
  return found;
end;
$$;

create or replace function get_drive_sync_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (s.project_id) s.project_id, s.id
    from project_summaries s order by s.project_id, s.created_at desc, s.id desc
  )
  select jsonb_build_object(
    'projects', (select count(*) from projects where id <> 'default'),
    'synced', (select count(*) from projects where id <> 'default' and drive_synced_at is not null),
    'pending', (select count(*) from latest l join projects p on p.id = l.project_id
                where p.drive_synced_summary_id is distinct from l.id),
    'lastSyncAt', (select max(drive_synced_at) from projects where id <> 'default'),
    'lastError', (select jsonb_build_object('projectId', p.id, 'projectName', p.name,
                           'error', p.drive_sync_error, 'at', p.drive_sync_error_at)
                  from projects p where p.drive_sync_error is not null
                  order by p.drive_sync_error_at desc nulls last limit 1),
    'errors', (select count(*) from projects where drive_sync_error is not null)
  );
$$;

-- Projects whose summary is due (missing, older than the interval, or new live messages) and
-- that nobody is generating right now. Oldest summaries first.
create or replace function list_summary_candidates(p_max_age_seconds integer, p_limit integer default 10)
returns table (project_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from projects p
  join conversations c on c.project_id = p.id
  cross join lateral (
    select max(m.seq) as max_seq from messages m
    where m.conversation_id = c.id and m.role in ('user', 'assistant') and m.archived_at is null
  ) mx
  left join lateral (
    select s.covered_to_seq, s.created_at from project_summaries s where s.project_id = p.id
    order by s.created_at desc, s.id desc limit 1
  ) ls on true
  left join project_summary_jobs j on j.project_id = p.id
  where p.id <> 'default'
    and mx.max_seq is not null
    and (ls.created_at is null
         or ls.covered_to_seq < mx.max_seq
         or ls.created_at <= now() - make_interval(secs => greatest(60, coalesce(p_max_age_seconds, 259200))))
    and not (coalesce(j.status, 'IDLE') = 'RUNNING' and j.lease_expires_at > now())
  order by ls.created_at asc nulls first, p.id
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

-- Projects whose latest summary is not in Drive yet (never synced, failed, or newer summary).
create or replace function list_drive_sync_pending(p_limit integer default 10)
returns table (project_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from projects p
  join lateral (
    select s.id, s.created_at from project_summaries s where s.project_id = p.id
    order by s.created_at desc, s.id desc limit 1
  ) ls on true
  where p.id <> 'default' and p.drive_synced_summary_id is distinct from ls.id
    and (p.drive_sync_lease_until is null or p.drive_sync_lease_until <= now())
  -- Never-attempted first, then the oldest failures, so a permanently failing project cannot
  -- starve the others out of the per-run limit.
  order by (p.drive_sync_error is not null), p.drive_sync_error_at asc nulls first, ls.created_at asc, p.id
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

-- ---------------------------------------------------------------------------------------------
-- App settings: system_instructions (text), summary_interval_days (1..30), drive_folder_id.
-- ---------------------------------------------------------------------------------------------
create or replace function get_app_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(s.key, jsonb_build_object('value', s.value, 'updatedAt', s.updated_at)),
                  '{}'::jsonb)
  from app_settings s;
$$;

create or replace function set_app_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated timestamptz;
  v_value text := p_value;
begin
  if p_key is null or p_key not in ('system_instructions', 'summary_interval_days', 'drive_folder_id') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if v_value is null or char_length(btrim(v_value)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if char_length(v_value) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'SETTING_TOO_LONG');
  end if;
  if p_key = 'summary_interval_days' then
    v_value := btrim(v_value);
    if v_value !~ '^[0-9]{1,2}$' or v_value::integer not between 1 and 30 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
    end if;
    v_value := (v_value::integer)::text;
  elsif p_key = 'drive_folder_id' then
    v_value := btrim(v_value);
    if v_value !~ '^[A-Za-z0-9_-]{10,200}$' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
    end if;
  end if;
  insert into app_settings (key, value, updated_at) values (p_key, v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning updated_at into v_updated;
  return jsonb_build_object('ok', true, 'updatedAt', v_updated);
end;
$$;

create or replace function reset_app_setting(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or p_key not in ('system_instructions', 'summary_interval_days', 'drive_folder_id') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  delete from app_settings where key = p_key;
  return jsonb_build_object('ok', true, 'reset', found);
end;
$$;


-- Netlify DB: Supabase-only role revoke omitted;

revoke all on function archive_project_history(text) from public;
revoke all on function set_project_drive_sync(text, text, uuid, text) from public;
revoke all on function get_drive_sync_status() from public;
revoke all on function list_summary_candidates(integer, integer) from public;
revoke all on function list_drive_sync_pending(integer) from public;
revoke all on function claim_drive_sync(text, integer) from public;
revoke all on function delete_project(text) from public;
revoke all on function get_app_settings() from public;
revoke all on function get_conversation_history(uuid, text, integer) from public;
revoke all on function list_conversations(text, integer) from public;
revoke all on function get_conversation_messages(uuid, text, integer) from public;
revoke all on function list_projects(integer) from public;
revoke all on function get_project(text) from public;
revoke all on function list_project_conversations(text, integer) from public;
revoke all on function get_summary_state(text) from public;
revoke all on function claim_summary_job(text, uuid, boolean, integer, integer) from public;
revoke all on function get_summary_messages(text, bigint, integer) from public;
revoke all on function set_app_setting(text, text) from public;
revoke all on function reset_app_setting(text) from public;


-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

commit;

-- OH-001.5: Capability Broker — app artifacts (files and zips created by tools) and Drive write
-- actions that wait for the user's confirmation. Idempotent; apply after 20260930000000_oh001_4.sql.
-- Non-destructive: adds two tables, widens the app_settings key check by one key, replaces
-- get_app_settings/set_app_setting/reset_app_setting (same signatures).
-- New RPCs: create_artifact, get_artifact, get_artifacts_for_zip, list_conversation_artifacts,
--   create_tool_action, get_tool_action, claim_tool_action, complete_tool_action, fail_tool_action.
-- RLS enabled with no policies on the new tables; anon/authenticated have zero privileges.

begin;

-- ---------------------------------------------------------------------------------------------
-- Artifacts: text/markdown/code files and zips created by the create_artifact / create_zip tools.
-- The content lives in the DB (text as UTF-8, zips as base64); downloads go through the app.
-- idempotency_key = sha256(request id | tool | canonical arguments): a reclaimed or replayed
-- request that repeats the same tool call gets the existing artifact instead of a second one.
-- ---------------------------------------------------------------------------------------------
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  conversation_id uuid not null,
  project_id text not null,
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('text', 'markdown', 'code', 'zip')),
  filename text not null check (
    char_length(filename) between 1 and 120
    and filename ~ '^[A-Za-z0-9][A-Za-z0-9._ ()+-]*$'
    and position('..' in filename) = 0
  ),
  mime_type text not null check (mime_type in ('text/plain', 'text/markdown', 'application/zip')),
  language text check (language is null or language ~ '^[a-z0-9+#-]{1,20}$'),
  encoding text not null check (encoding in ('utf8', 'base64')),
  content text not null,
  size_bytes integer not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint artifacts_zip_encoding check ((kind = 'zip') = (encoding = 'base64')),
  -- Size caps: 512 KiB for text files, 4 MiB for zips (base64 is 4/3 of that).
  constraint artifacts_size_cap check (
    (kind <> 'zip' and size_bytes <= 524288 and octet_length(content) = size_bytes)
    or (kind = 'zip' and size_bytes <= 4194304 and char_length(content) <= 5592408)
  )
);
create index if not exists artifacts_conversation on artifacts (conversation_id, created_at);
alter table artifacts enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

-- ---------------------------------------------------------------------------------------------
-- Tool actions: a Drive write proposed by the model, paused until the user approves or denies.
-- `state` is the paused tool loop (provider, system prompt, transcript) needed to resume.
-- Status: PENDING -> RUNNING (decision taken, lease held) -> COMPLETED | FAILED (retryable with the
-- same decision); PENDING past expires_at -> EXPIRED. A decision is final once taken.
-- ---------------------------------------------------------------------------------------------
create table if not exists tool_actions (
  id uuid primary key,
  request_id uuid not null,
  conversation_id uuid not null,
  project_id text not null,
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9a-f]{64}$'),
  tool text not null check (tool in ('drive_create_folder', 'drive_create_doc')),
  args jsonb not null check (octet_length(args::text) <= 400000),
  preview jsonb not null default '{}'::jsonb check (octet_length(preview::text) <= 20000),
  state jsonb not null check (octet_length(state::text) <= 2000000),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'EXPIRED', 'FAILED')),
  decision text check (decision in ('approve', 'deny')),
  result jsonb check (result is null or octet_length(result::text) <= 20000),
  last_error text check (last_error is null or last_error ~ '^[A-Z0-9_]{1,64}$'),
  message_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_actions_decision check (status in ('PENDING', 'EXPIRED') or decision is not null)
);
create index if not exists tool_actions_conversation on tool_actions (conversation_id, created_at);
alter table tool_actions enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

-- New settings key: "Allow Drive writes without asking" ('true' / 'false'; absent = false).
alter table app_settings drop constraint if exists app_settings_key_check;
alter table app_settings add constraint app_settings_key_check
  check (key in ('system_instructions', 'summary_interval_days', 'drive_folder_id',
                 'drive_writes_without_confirmation'));

-- ---------------------------------------------------------------------------------------------
create or replace function artifact_meta(a artifacts)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id, 'filename', a.filename, 'kind', a.kind, 'mimeType', a.mime_type,
    'language', a.language, 'sizeBytes', a.size_bytes, 'sha256', a.sha256,
    'conversationId', a.conversation_id, 'projectId', a.project_id, 'requestId', a.request_id,
    'createdAt', a.created_at);
$$;

create or replace function create_artifact(
  p_request_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_key text,
  p_kind text,
  p_filename text,
  p_mime_type text,
  p_language text,
  p_encoding text,
  p_content text,
  p_size_bytes integer,
  p_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a artifacts%rowtype;
  v_existing boolean := false;
begin
  insert into artifacts (request_id, conversation_id, project_id, idempotency_key, kind, filename,
                         mime_type, language, encoding, content, size_bytes, sha256)
  values (p_request_id, p_conversation_id, p_project_id, p_key, p_kind, p_filename,
          p_mime_type, nullif(p_language, ''), p_encoding, p_content, p_size_bytes, p_sha256)
  on conflict (idempotency_key) do nothing
  returning * into a;
  if not found then
    select * into a from artifacts where idempotency_key = p_key;
    v_existing := true;
  end if;
  return jsonb_build_object('ok', true, 'existing', v_existing, 'artifact', artifact_meta(a));
end;
$$;

create or replace function get_artifact(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select artifact_meta(a) || jsonb_build_object('encoding', a.encoding, 'content', a.content)
  from artifacts a where a.id = p_id;
$$;

-- Artifacts to bundle into a zip: only ones from the same chat (at most 50 ids).
create or replace function get_artifacts_for_zip(p_ids jsonb, p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(artifact_meta(a) || jsonb_build_object('encoding', a.encoding, 'content', a.content)
                            order by a.created_at), '[]'::jsonb)
  from artifacts a
  where a.conversation_id = p_conversation_id
    and a.id in (
      select x::uuid from jsonb_array_elements_text(
        case when jsonb_typeof(p_ids) = 'array' and jsonb_array_length(p_ids) <= 50 then p_ids else '[]'::jsonb end
      ) as t(x)
      where x ~ '^[0-9a-fA-F-]{36}$'
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- Metadata of the newest artifacts of a chat (no content), for the model's "files in this chat" list.
create or replace function list_conversation_artifacts(p_conversation_id uuid, p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(artifact_meta(a) order by a.created_at desc, a.id), '[]'::jsonb)
  from artifacts a
  where a.id in (
    select b.id from artifacts b
    where b.conversation_id = p_conversation_id
    order by b.created_at desc, b.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  );
$$;

create or replace function tool_action_public(t tool_actions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id, 'requestId', t.request_id, 'conversationId', t.conversation_id,
    'projectId', t.project_id, 'tool', t.tool, 'args', t.args, 'preview', t.preview,
    'status', case when t.status = 'PENDING' and t.expires_at <= now() then 'EXPIRED' else t.status end,
    'decision', t.decision, 'result', t.result, 'lastError', t.last_error, 'messageId', t.message_id,
    'expiresAt', t.expires_at, 'decidedAt', t.decided_at, 'createdAt', t.created_at);
$$;

create or replace function create_tool_action(
  p_id uuid,
  p_request_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_key text,
  p_tool text,
  p_args jsonb,
  p_preview jsonb,
  p_state jsonb,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tool_actions%rowtype;
  v_existing boolean := false;
begin
  insert into tool_actions (id, request_id, conversation_id, project_id, idempotency_key, tool, args,
                            preview, state, expires_at)
  values (p_id, p_request_id, p_conversation_id, p_project_id, p_key, p_tool, p_args,
          coalesce(p_preview, '{}'::jsonb), p_state,
          now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 3600), 86400))))
  on conflict (idempotency_key) do nothing
  returning * into t;
  if not found then
    select * into t from tool_actions where idempotency_key = p_key;
    v_existing := true;
  end if;
  return jsonb_build_object('ok', true, 'existing', v_existing, 'action', tool_action_public(t));
end;
$$;

create or replace function get_tool_action(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select tool_action_public(t) from tool_actions t where t.id = p_id;
$$;

-- Takes the user's decision. Exactly one caller gets 'claimed' (with a lease token and the paused
-- loop state); concurrent callers get 'busy'; later callers get the stored outcome. A RUNNING
-- action whose lease expired, or a FAILED one, can be claimed again with the SAME decision.
create or replace function claim_tool_action(p_id uuid, p_decision text, p_lease_seconds integer default 180)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tool_actions%rowtype;
  v_token uuid := gen_random_uuid();
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 600)));
  v_reclaimed boolean := false;
begin
  if p_decision is null or p_decision not in ('approve', 'deny') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DECISION');
  end if;
  select * into t from tool_actions where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ACTION_NOT_FOUND');
  end if;
  if t.status = 'PENDING' and t.expires_at <= now() then
    update tool_actions set status = 'EXPIRED', updated_at = now() where id = p_id;
    return jsonb_build_object('ok', false, 'error', 'ACTION_EXPIRED');
  end if;
  if t.status = 'EXPIRED' then
    return jsonb_build_object('ok', false, 'error', 'ACTION_EXPIRED');
  end if;
  if t.status = 'COMPLETED' then
    return jsonb_build_object('ok', true, 'state', 'completed', 'action', tool_action_public(t));
  end if;
  if t.status in ('RUNNING', 'FAILED') then
    if t.decision <> p_decision then
      return jsonb_build_object('ok', false, 'error', 'ACTION_ALREADY_DECIDED', 'decision', t.decision);
    end if;
    if t.status = 'RUNNING' and t.lease_until > now() then
      return jsonb_build_object('ok', true, 'state', 'busy', 'action', tool_action_public(t));
    end if;
    v_reclaimed := true;
  end if;
  update tool_actions
  set status = 'RUNNING',
      decision = p_decision,
      decided_at = coalesce(decided_at, now()),
      lease_token = v_token,
      lease_until = now() + v_lease,
      updated_at = now()
  where id = p_id
  returning * into t;
  return jsonb_build_object('ok', true, 'state', 'claimed', 'token', v_token, 'reclaimed', v_reclaimed,
                            'action', tool_action_public(t), 'loopState', t.state);
end;
$$;

-- Records the outcome of a claimed action and appends the resumed reply to the chat (one
-- transaction, guarded by the lease token). Returns the new message id.
create or replace function complete_tool_action(
  p_id uuid,
  p_token uuid,
  p_result jsonb,
  p_assistant_text text,
  p_trace jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tool_actions%rowtype;
  v_trace_id uuid := (p_trace ->> 'traceId')::uuid;
  v_project text;
  v_message uuid;
begin
  if coalesce(p_trace ->> 'status', '') <> 'COMPLETED' or v_trace_id is null then
    raise exception 'INVALID_TRACE_STATUS';
  end if;
  if p_assistant_text is null or char_length(btrim(p_assistant_text)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;
  select * into t from tool_actions where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ACTION_NOT_FOUND');
  end if;
  if t.status <> 'RUNNING' or t.lease_token is distinct from p_token then
    return jsonb_build_object('ok', false, 'error', 'ACTION_LEASE_LOST');
  end if;
  -- The chat may have moved to Chats (project deleted): write where it lives now.
  select project_id into v_project from conversations where id = t.conversation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'CONVERSATION_NOT_FOUND');
  end if;

  insert into execution_traces (id, request_id, conversation_id, project_id, status, provider, model, mode,
                                latency_ms, error_code, finish_reason, truncated, retry_count, attempt,
                                metadata, updated_at)
  values (v_trace_id, t.request_id, t.conversation_id, v_project, 'COMPLETED', p_trace ->> 'provider',
          p_trace ->> 'model', p_trace ->> 'mode', coalesce((p_trace ->> 'latencyMs')::integer, 0),
          null, p_trace ->> 'finishReason', coalesce((p_trace ->> 'truncated')::boolean, false),
          coalesce((p_trace ->> 'retryCount')::integer, 0), 1,
          p_trace || jsonb_build_object('projectId', v_project), now());
  insert into messages (conversation_id, role, content, request_id, trace_id)
  values (t.conversation_id, 'assistant', p_assistant_text, null, v_trace_id)
  returning id into v_message;
  update conversations set updated_at = now() where id = t.conversation_id;

  update tool_actions
  set status = 'COMPLETED', result = p_result, message_id = v_message, last_error = null,
      lease_token = null, lease_until = null, updated_at = now()
  where id = p_id
  returning * into t;
  return jsonb_build_object('ok', true, 'messageId', v_message, 'action', tool_action_public(t));
end;
$$;

-- A claimed action failed (Drive or model error). `p_result` keeps what already happened (e.g. the
-- created Drive file) so a retry does not repeat the write.
create or replace function fail_tool_action(p_id uuid, p_token uuid, p_error text, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update tool_actions
  set status = 'FAILED',
      last_error = case when p_error ~ '^[A-Z0-9_]{1,64}$' then p_error else 'UNKNOWN' end,
      result = coalesce(p_result, result),
      lease_token = null, lease_until = null, updated_at = now()
  where id = p_id and status = 'RUNNING' and lease_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ACTION_LEASE_LOST');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings: one more key.
-- ---------------------------------------------------------------------------------------------
create or replace function set_app_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated timestamptz;
  v_value text := p_value;
begin
  if p_key is null or p_key not in ('system_instructions', 'summary_interval_days', 'drive_folder_id',
                                    'drive_writes_without_confirmation') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if v_value is null or char_length(btrim(v_value)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  if char_length(v_value) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'SETTING_TOO_LONG');
  end if;
  if p_key = 'summary_interval_days' then
    v_value := btrim(v_value);
    if v_value !~ '^[0-9]{1,2}$' or v_value::integer not between 1 and 30 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
    end if;
    v_value := (v_value::integer)::text;
  elsif p_key = 'drive_folder_id' then
    v_value := btrim(v_value);
    if v_value !~ '^[A-Za-z0-9_-]{10,200}$' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
    end if;
  elsif p_key = 'drive_writes_without_confirmation' then
    v_value := lower(btrim(v_value));
    if v_value not in ('true', 'false') then
      return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
    end if;
  end if;
  insert into app_settings (key, value, updated_at) values (p_key, v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning updated_at into v_updated;
  return jsonb_build_object('ok', true, 'updatedAt', v_updated);
end;
$$;

create or replace function reset_app_setting(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or p_key not in ('system_instructions', 'summary_interval_days', 'drive_folder_id',
                                    'drive_writes_without_confirmation') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SETTING');
  end if;
  delete from app_settings where key = p_key;
  return jsonb_build_object('ok', true, 'reset', found);
end;
$$;


-- Netlify DB: Supabase-only role revoke omitted;

revoke all on function artifact_meta(artifacts) from public;
revoke all on function tool_action_public(tool_actions) from public;
revoke all on function create_artifact(uuid, uuid, text, text, text, text, text, text, text, text, integer, text)
  from public;
revoke all on function get_artifact(uuid) from public;
revoke all on function get_artifacts_for_zip(jsonb, uuid) from public;
revoke all on function list_conversation_artifacts(uuid, integer) from public;
revoke all on function create_tool_action(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer)
  from public;
revoke all on function get_tool_action(uuid) from public;
revoke all on function claim_tool_action(uuid, text, integer) from public;
revoke all on function complete_tool_action(uuid, uuid, jsonb, text, jsonb) from public;
revoke all on function fail_tool_action(uuid, uuid, text, jsonb) from public;
revoke all on function set_app_setting(text, text) from public;
revoke all on function reset_app_setting(text) from public;


-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

commit;

-- OH-002.6: Google Drive through Felipe's own Google account (OAuth, drive.file scope), orphaned
-- artifact cleanup, and a clear error for oversized paused tool state.
-- Idempotent; apply after 20261001000000_oh001_5.sql. (Migration file names are ordering keys,
-- not release dates.)
-- Non-destructive: adds one table (google_oauth_connections) and one index, replaces
-- create_tool_action (same signature). New RPCs: get_google_connection, save_google_connection,
-- set_google_refresh_token, clear_google_connection, delete_orphan_artifacts.
-- RLS enabled with no policies on the new table; anon/authenticated have zero privileges.

begin;

-- ---------------------------------------------------------------------------------------------
-- Google OAuth connection (single row, id = 'default').
-- refresh_token_enc is the refresh token encrypted by the app with AES-256-GCM
-- (OLYHUB_TOKEN_ENCRYPTION_KEY; format v1.<key id>.<iv>.<tag>.<ciphertext>, base64url). The
-- database never sees the plaintext token or the key. Access tokens are never stored.
-- root_folder_id / summaries_folder_id: the "OlyHub" and "Projects Summaries" folders the app
-- created in Felipe's My Drive (drive.file only sees files the app created). They are kept after a
-- disconnect so a reconnect reuses them.
-- ---------------------------------------------------------------------------------------------
create table if not exists google_oauth_connections (
  id text primary key default 'default' check (id = 'default'),
  email text check (email is null or (char_length(email) between 3 and 320 and email ~ '^[^@\s]+@[^@\s]+$')),
  scope text check (scope is null or char_length(scope) <= 500),
  refresh_token_enc text check (
    refresh_token_enc is null
    or (char_length(refresh_token_enc) <= 4096
        and refresh_token_enc ~ '^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
  ),
  key_id text check (key_id is null or key_id ~ '^[0-9a-f]{8}$'),
  root_folder_id text check (root_folder_id is null or root_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  summaries_folder_id text check (
    summaries_folder_id is null or summaries_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'
  ),
  status text not null default 'DISCONNECTED' check (status in ('ACTIVE', 'REVOKED', 'DISCONNECTED')),
  last_error text check (last_error is null or last_error ~ '^[A-Z0-9_]{1,64}$'),
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint google_oauth_token_status check (
    (status = 'ACTIVE') = (refresh_token_enc is not null)
    and (status <> 'ACTIVE' or (root_folder_id is not null and summaries_folder_id is not null
                                and key_id is not null))
  )
);
alter table google_oauth_connections enable row level security;

-- Netlify DB: Supabase-only role revoke omitted;

create or replace function google_connection_row(c google_oauth_connections)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'email', c.email, 'scope', c.scope, 'refreshTokenEnc', c.refresh_token_enc, 'keyId', c.key_id,
    'rootFolderId', c.root_folder_id, 'summariesFolderId', c.summaries_folder_id,
    'status', c.status, 'lastError', c.last_error, 'connectedAt', c.connected_at,
    'updatedAt', c.updated_at);
$$;

-- Null when Google was never connected.
create or replace function get_google_connection()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select google_connection_row(c) from google_oauth_connections c where c.id = 'default';
$$;

create or replace function save_google_connection(
  p_email text,
  p_scope text,
  p_refresh_token_enc text,
  p_key_id text,
  p_root_folder_id text,
  p_summaries_folder_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c google_oauth_connections%rowtype;
begin
  insert into google_oauth_connections as g (id, email, scope, refresh_token_enc, key_id, root_folder_id,
                                             summaries_folder_id, status, last_error, connected_at, updated_at)
  values ('default', nullif(p_email, ''), p_scope, p_refresh_token_enc, p_key_id, p_root_folder_id,
          p_summaries_folder_id, 'ACTIVE', null, now(), now())
  on conflict (id) do update set
    email = excluded.email, scope = excluded.scope, refresh_token_enc = excluded.refresh_token_enc,
    key_id = excluded.key_id, root_folder_id = excluded.root_folder_id,
    summaries_folder_id = excluded.summaries_folder_id, status = 'ACTIVE', last_error = null,
    connected_at = now(), updated_at = now()
  returning * into c;
  return jsonb_build_object('ok', true, 'connection', google_connection_row(c));
end;
$$;

-- Google rotated the refresh token: store the new one, but only if the connection still holds the
-- token that was used (a concurrent disconnect/reconnect wins).
create or replace function set_google_refresh_token(p_expected_enc text, p_refresh_token_enc text, p_key_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update google_oauth_connections
     set refresh_token_enc = p_refresh_token_enc, key_id = p_key_id, updated_at = now()
   where id = 'default' and status = 'ACTIVE' and refresh_token_enc = p_expected_enc;
  return jsonb_build_object('ok', true, 'updated', found);
end;
$$;

-- Disconnect (DISCONNECTED) or revoked/unusable token (REVOKED): the token is deleted; email and
-- folder ids are kept for the reconnect. With p_expected_enc, only clears if that token is still
-- the stored one (a stale failure never clears a newer connection).
create or replace function clear_google_connection(p_status text, p_error text, p_expected_enc text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('REVOKED', 'DISCONNECTED') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_STATUS');
  end if;
  update google_oauth_connections
     set refresh_token_enc = null, status = p_status, last_error = nullif(p_error, ''), updated_at = now()
   where id = 'default'
     and (p_expected_enc is null or refresh_token_enc = p_expected_enc);
  return jsonb_build_object('ok', true, 'cleared', found);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Orphaned artifacts: files created by tools during a turn that never completed (provider error,
-- timeout, persistence failure). An artifact is kept while its request has a COMPLETED reservation
-- (the saved message links to it, including paused turns) or a live tool action. Everything else
-- older than p_older_than_seconds (min 1 hour, default 24 hours) is deleted, at most p_limit rows.
-- Called by the daily cron.
-- ---------------------------------------------------------------------------------------------
create index if not exists artifacts_created_at on artifacts (created_at);

create or replace function delete_orphan_artifacts(p_older_than_seconds integer default 86400, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with doomed as (
    select a.id from artifacts a
     where a.created_at < now() - make_interval(secs => greatest(3600, coalesce(p_older_than_seconds, 86400)))
       and not exists (select 1 from request_reservations r
                        where r.request_id = a.request_id and r.status = 'COMPLETED')
       and not exists (select 1 from tool_actions t
                        where t.request_id = a.request_id and t.status in ('PENDING', 'RUNNING'))
     order by a.created_at
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  )
  delete from artifacts a using doomed d where a.id = d.id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- create_tool_action: an oversized paused state returns TOOL_STATE_TOO_LARGE instead of failing the
-- table check with a generic DB error (the app checks first; this is the backstop).
-- ---------------------------------------------------------------------------------------------
create or replace function create_tool_action(
  p_id uuid,
  p_request_id uuid,
  p_conversation_id uuid,
  p_project_id text,
  p_key text,
  p_tool text,
  p_args jsonb,
  p_preview jsonb,
  p_state jsonb,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tool_actions%rowtype;
  v_existing boolean := false;
begin
  if octet_length(p_state::text) > 2000000 then
    return jsonb_build_object('ok', false, 'error', 'TOOL_STATE_TOO_LARGE');
  end if;
  insert into tool_actions (id, request_id, conversation_id, project_id, idempotency_key, tool, args,
                            preview, state, expires_at)
  values (p_id, p_request_id, p_conversation_id, p_project_id, p_key, p_tool, p_args,
          coalesce(p_preview, '{}'::jsonb), p_state,
          now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 3600), 86400))))
  on conflict (idempotency_key) do nothing
  returning * into t;
  if not found then
    select * into t from tool_actions where idempotency_key = p_key;
    v_existing := true;
  end if;
  return jsonb_build_object('ok', true, 'existing', v_existing, 'action', tool_action_public(t));
end;
$$;


-- Netlify DB: Supabase-only role revoke omitted;

revoke all on function google_connection_row(google_oauth_connections) from public;
revoke all on function get_google_connection() from public;
revoke all on function save_google_connection(text, text, text, text, text, text) from public;
revoke all on function set_google_refresh_token(text, text, text) from public;
revoke all on function clear_google_connection(text, text, text) from public;
revoke all on function delete_orphan_artifacts(integer, integer) from public;
revoke all on function create_tool_action(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer)
  from public;


-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

-- Netlify DB: service_role grant omitted;

commit;
