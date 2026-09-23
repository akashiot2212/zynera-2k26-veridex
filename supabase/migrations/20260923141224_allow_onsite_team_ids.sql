alter table public.teams
  drop constraint if exists teams_team_id_check;

alter table public.teams
  add constraint teams_team_id_check
  check (team_id ~ '^VER(?:[0-9]{3,}|OS[0-9]{3,})$');
