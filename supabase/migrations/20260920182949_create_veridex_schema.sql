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

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coordinators (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id text not null check (team_id ~ '^VER[0-9]{3,}$'),
  team_name text,
  college_name text not null check (length(trim(college_name)) > 0),
  ppt_status text not null default 'Pending' check (ppt_status in ('Pending','Received')),
  presentation_status text not null default 'Waiting' check (presentation_status in ('Waiting','Presenting','Presented','Delayed','Absent')),
  presentation_order integer not null check (presentation_order > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (event_id, team_id)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_name text not null check (length(trim(participant_name)) > 0),
  department text not null check (length(trim(department)) > 0),
  year text not null check (year in ('1st Year','2nd Year','3rd Year','4th Year')),
  participant_number smallint not null check (participant_number between 1 and 4),
  unique (team_id, participant_number)
);

create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  original_filename text not null,
  stored_filename text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  coordinator_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index teams_event_order_idx on public.teams(event_id, presentation_order);
create index teams_event_ppt_idx on public.teams(event_id, ppt_status);
create index teams_event_status_idx on public.teams(event_id, presentation_status);
create index participants_team_idx on public.participants(team_id);
create index activity_event_created_idx on public.activity_logs(event_id, created_at desc);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)))
  on conflict(id) do update set email=excluded.email, updated_at=now();
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_user();

create function public.touch_team() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end; $$;
revoke all on function public.touch_team() from public, anon, authenticated;
create trigger teams_touch before update on public.teams for each row execute function public.touch_team();

alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.coordinators enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;
alter table public.presentations enable row level security;
alter table public.activity_logs enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy coordinators_self_select on public.coordinators for select to authenticated using ((select auth.uid())=user_id and active);
create policy events_coordinator_all on public.events for all to authenticated
  using (exists(select 1 from public.coordinators c where c.event_id=events.id and c.user_id=(select auth.uid()) and c.active))
  with check (exists(select 1 from public.coordinators c where c.event_id=events.id and c.user_id=(select auth.uid()) and c.active));
create policy teams_coordinator_all on public.teams for all to authenticated
  using (exists(select 1 from public.coordinators c where c.event_id=teams.event_id and c.user_id=(select auth.uid()) and c.active))
  with check (exists(select 1 from public.coordinators c where c.event_id=teams.event_id and c.user_id=(select auth.uid()) and c.active));
create policy participants_coordinator_all on public.participants for all to authenticated
  using (exists(select 1 from public.teams t join public.coordinators c on c.event_id=t.event_id where t.id=participants.team_id and c.user_id=(select auth.uid()) and c.active))
  with check (exists(select 1 from public.teams t join public.coordinators c on c.event_id=t.event_id where t.id=participants.team_id and c.user_id=(select auth.uid()) and c.active));
create policy presentations_coordinator_all on public.presentations for all to authenticated
  using (exists(select 1 from public.teams t join public.coordinators c on c.event_id=t.event_id where t.id=presentations.team_id and c.user_id=(select auth.uid()) and c.active))
  with check (exists(select 1 from public.teams t join public.coordinators c on c.event_id=t.event_id where t.id=presentations.team_id and c.user_id=(select auth.uid()) and c.active));
create policy activity_coordinator_all on public.activity_logs for all to authenticated
  using (exists(select 1 from public.coordinators c where c.event_id=activity_logs.event_id and c.user_id=(select auth.uid()) and c.active))
  with check (exists(select 1 from public.coordinators c where c.event_id=activity_logs.event_id and c.user_id=(select auth.uid()) and c.active));

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.events,public.profiles,public.coordinators,public.teams,public.participants,public.presentations,public.activity_logs to authenticated;

insert into public.events(event_name,event_code,event_type,expected_teams)
values('ZYNERA 2K26 – VERIDEX','VERIDEX','Paper Presentation',50)
on conflict(event_code) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('veridex-presentations','veridex-presentations',false,52428800,array['application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy veridex_storage_select on storage.objects for select to authenticated using (
  bucket_id='veridex-presentations' and exists(select 1 from public.coordinators c where c.event_id=(storage.foldername(name))[1]::uuid and c.user_id=(select auth.uid()) and c.active)
);
create policy veridex_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='veridex-presentations' and exists(select 1 from public.coordinators c where c.event_id=(storage.foldername(name))[1]::uuid and c.user_id=(select auth.uid()) and c.active)
);
create policy veridex_storage_update on storage.objects for update to authenticated using (
  bucket_id='veridex-presentations' and exists(select 1 from public.coordinators c where c.event_id=(storage.foldername(name))[1]::uuid and c.user_id=(select auth.uid()) and c.active)
) with check (
  bucket_id='veridex-presentations' and exists(select 1 from public.coordinators c where c.event_id=(storage.foldername(name))[1]::uuid and c.user_id=(select auth.uid()) and c.active)
);
create policy veridex_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='veridex-presentations' and exists(select 1 from public.coordinators c where c.event_id=(storage.foldername(name))[1]::uuid and c.user_id=(select auth.uid()) and c.active)
);

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='teams') then alter publication supabase_realtime add table public.teams; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='participants') then alter publication supabase_realtime add table public.participants; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='presentations') then alter publication supabase_realtime add table public.presentations; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='activity_logs') then alter publication supabase_realtime add table public.activity_logs; end if;
end $$;

-- After the first coordinator creates an Auth account, run once in the SQL editor:
-- insert into public.coordinators(event_id,user_id)
-- select e.id,u.id from public.events e cross join auth.users u where e.event_code='VERIDEX' and u.email='coordinator@example.com';
