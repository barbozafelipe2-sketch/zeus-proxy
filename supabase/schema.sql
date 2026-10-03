create extension if not exists pgcrypto;
create table if not exists projects (id text primary key, name text not null default 'Personal', created_at timestamptz not null default now());
create table if not exists conversations (id uuid primary key, project_id text not null references projects(id), title text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations(id) on delete cascade, role text not null check (role in ('user','assistant','system')), content text not null, created_at timestamptz not null default now());
create table if not exists execution_traces (id uuid primary key, request_id uuid unique, conversation_id uuid, project_id text not null, status text not null, provider text, model text, mode text, latency_ms integer not null default 0, error_code text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists execution_traces_project_created_idx on execution_traces(project_id,created_at desc);
create index if not exists messages_conversation_created_idx on messages(conversation_id,created_at);
create table if not exists zeus_core (id text primary key default 'primary', version integer not null default 1, identity jsonb not null, updated_at timestamptz not null default now());
create table if not exists memory_items (id uuid primary key default gen_random_uuid(), project_id text, type text not null, content text not null, status text not null default 'active', authority integer not null default 50, confidence real not null default 1, source_type text, source_id text, provenance jsonb not null default '{}'::jsonb, supersedes_id uuid references memory_items(id), expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
insert into projects(id,name) values ('default','Personal') on conflict do nothing;

-- Atomic persistence: conversation, both messages and trace commit together or not at all.
create or replace function persist_completed_turn(p_conversation_id uuid,p_project_id text,p_user_text text,p_assistant_text text,p_trace jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into conversations(id,project_id,updated_at) values(p_conversation_id,p_project_id,now())
  on conflict(id) do update set updated_at=excluded.updated_at;
  insert into messages(conversation_id,role,content) values(p_conversation_id,'user',p_user_text),(p_conversation_id,'assistant',p_assistant_text);
  insert into execution_traces(id,request_id,conversation_id,project_id,status,provider,model,mode,latency_ms,error_code,metadata)
  values((p_trace->>'traceId')::uuid,nullif(p_trace->>'requestId','')::uuid,p_conversation_id,p_project_id,p_trace->>'status',p_trace->>'provider',p_trace->>'model',p_trace->>'mode',coalesce((p_trace->>'latencyMs')::int,0),p_trace->>'errorCode',p_trace);
end; $$;
revoke all on function persist_completed_turn(uuid,text,text,text,jsonb) from public,anon,authenticated;
-- This function is intended for the server-side service role only in OH-001.
-- Do not claim end-user RLS isolation yet: authentication/ownership lands in a later milestone.

-- OH-001.1: fail closed for browser/client roles until authentication ownership policies exist.
alter table projects enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table execution_traces enable row level security;
alter table zeus_core enable row level security;
alter table memory_items enable row level security;

-- Reserve request_id before spending provider tokens. Concurrent duplicates cannot both win.
create or replace function reserve_request(p_request_id uuid,p_trace_id uuid,p_conversation_id uuid,p_project_id text,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing execution_traces%rowtype; assistant_text text;
begin
  select * into existing from execution_traces where request_id=p_request_id;
  if found then
    if existing.status='COMPLETED' then
      select m.content into assistant_text from messages m where m.conversation_id=existing.conversation_id and m.role='assistant' order by m.created_at desc limit 1;
      return jsonb_build_object('state','completed','message',assistant_text,'conversationId',existing.conversation_id,'trace',existing.metadata);
    end if;
    return jsonb_build_object('state','in_progress');
  end if;
  insert into execution_traces(id,request_id,conversation_id,project_id,status,mode,metadata)
  values(p_trace_id,p_request_id,p_conversation_id,p_project_id,'RECEIVED',p_mode,jsonb_build_object('traceId',p_trace_id,'requestId',p_request_id,'status','RECEIVED'));
  return jsonb_build_object('state','reserved','traceId',p_trace_id);
exception when unique_violation then
  return jsonb_build_object('state','in_progress');
end; $$;
revoke all on function reserve_request(uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function get_conversation_history(p_conversation_id uuid,p_project_id text,p_limit integer default 20)
returns table(role text,content text,created_at timestamptz) language sql security definer set search_path=public stable as $$
  select x.role,x.content,x.created_at from (
    select m.role,m.content,m.created_at from messages m join conversations c on c.id=m.conversation_id
    where m.conversation_id=p_conversation_id and c.project_id=p_project_id and m.role in ('user','assistant')
    order by m.created_at desc limit greatest(1,least(p_limit,50))
  ) x order by x.created_at asc;
$$;
revoke all on function get_conversation_history(uuid,text,integer) from public,anon,authenticated;

-- Replace the reservation row instead of inserting a second trace.
create or replace function persist_completed_turn(p_conversation_id uuid,p_project_id text,p_user_text text,p_assistant_text text,p_trace jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into conversations(id,project_id,updated_at) values(p_conversation_id,p_project_id,now()) on conflict(id) do update set updated_at=excluded.updated_at;
  insert into messages(conversation_id,role,content) values(p_conversation_id,'user',p_user_text),(p_conversation_id,'assistant',p_assistant_text);
  update execution_traces set conversation_id=p_conversation_id,project_id=p_project_id,status=p_trace->>'status',provider=p_trace->>'provider',model=p_trace->>'model',mode=p_trace->>'mode',latency_ms=coalesce((p_trace->>'latencyMs')::int,0),error_code=p_trace->>'errorCode',metadata=p_trace where id=(p_trace->>'traceId')::uuid;
  if not found then raise exception 'TRACE_RESERVATION_MISSING'; end if;
end; $$;
revoke all on function persist_completed_turn(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function persist_completed_turn(uuid,text,text,text,jsonb) to service_role;
grant execute on function reserve_request(uuid,uuid,uuid,text,text) to service_role;
grant execute on function get_conversation_history(uuid,text,integer) to service_role;
