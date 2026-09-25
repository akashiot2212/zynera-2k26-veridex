alter table public.event_feedback
  add column team_id uuid references public.teams(id) on delete cascade;

create index event_feedback_team_idx on public.event_feedback(team_id);
