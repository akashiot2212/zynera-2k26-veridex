create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_code text not null unique,
  event_type text not null,
  expected_teams integer not null default 50 check (expected_teams > 0),
  allow_new_teams boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id text not null check (team_id ~ '^VER(?:[0-9]{3,}|OS[0-9]{3,})$'),
  team_name text,
  college_name text not null check (length(trim(college_name)) > 0),
  ppt_status text not null default 'Pending' check (ppt_status in ('Pending','Received')),
  presentation_status text not null default 'Waiting' check (presentation_status in ('Waiting','Presenting','Presented','Delayed','Absent')),
  presentation_order integer not null check (presentation_order > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (event_id, team_id)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_name text not null check (length(trim(participant_name)) > 0),
  department text,
  year text,
  participant_number smallint not null check (participant_number between 1 and 6),
  unique (team_id, participant_number)
);

create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  original_filename text not null,
  stored_filename text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  coordinator_id uuid,
  action_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index teams_event_order_idx on public.teams(event_id, presentation_order);
create index teams_event_ppt_idx on public.teams(event_id, ppt_status);
create index teams_event_status_idx on public.teams(event_id, presentation_status);
create index participants_team_idx on public.participants(team_id);
create index activity_event_created_idx on public.activity_logs(event_id, created_at desc);

create function public.touch_veridex_team() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;
revoke all on function public.touch_veridex_team() from public, anon, authenticated;
create trigger teams_touch before update on public.teams for each row execute function public.touch_veridex_team();

alter table public.events enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;
alter table public.presentations enable row level security;
alter table public.activity_logs enable row level security;

create policy events_shared_access on public.events for all to anon, authenticated using (true) with check (true);
create policy teams_shared_access on public.teams for all to anon, authenticated using (true) with check (true);
create policy participants_shared_access on public.participants for all to anon, authenticated using (true) with check (true);
create policy presentations_shared_access on public.presentations for all to anon, authenticated using (true) with check (true);
create policy activity_shared_access on public.activity_logs for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.events, public.teams, public.participants, public.presentations, public.activity_logs to anon, authenticated;

insert into public.events(event_name, event_code, event_type, expected_teams)
values('ZYNERA 2K26 – VERIDEX', 'VERIDEX', 'Paper Presentation', 50);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('veridex-presentations', 'veridex-presentations', true, 52428800, array['application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']);

create policy veridex_storage_shared_select on storage.objects for select to anon, authenticated using (bucket_id = 'veridex-presentations');
create policy veridex_storage_shared_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'veridex-presentations');
create policy veridex_storage_shared_update on storage.objects for update to anon, authenticated using (bucket_id = 'veridex-presentations') with check (bucket_id = 'veridex-presentations');
create policy veridex_storage_shared_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'veridex-presentations');

alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.presentations;
alter publication supabase_realtime add table public.activity_logs;
