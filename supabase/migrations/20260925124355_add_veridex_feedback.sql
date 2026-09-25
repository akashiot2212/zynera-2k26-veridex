create table public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_rating smallint not null check (venue_rating between 1 and 5),
  judge_rating smallint not null check (judge_rating between 1 and 5),
  hospitality_rating smallint not null check (hospitality_rating between 1 and 5),
  suggestion text check (suggestion is null or char_length(suggestion) <= 1000),
  created_at timestamptz not null default now()
);
create index event_feedback_event_created_idx on public.event_feedback(event_id, created_at desc);
alter table public.event_feedback enable row level security;
create policy feedback_shared_access on public.event_feedback for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.event_feedback to anon, authenticated;
alter publication supabase_realtime add table public.event_feedback;
