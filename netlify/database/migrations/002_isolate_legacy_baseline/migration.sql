-- The applied 001_olyhub_baseline migration created an earlier schema whose
-- table names (projects, conversations, messages, artifacts, ...) collide with
-- the current application schema created by later migrations.
-- Move every baseline table into a dedicated schema instead of dropping it, so
-- any existing data is preserved and can be inspected or migrated later.
-- Indexes, constraints and owned sequences move together with their tables.
create schema if not exists legacy_olyhub;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'artifacts', 'conversations', 'execution_traces',
    'google_oauth_connections', 'memory_items', 'messages', 'project_references',
    'projects', 'project_summaries', 'project_summary_jobs',
    'request_reservations', 'tool_actions', 'zeus_core'
  ] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I set schema legacy_olyhub', t);
    end if;
  end loop;
end
$$;
