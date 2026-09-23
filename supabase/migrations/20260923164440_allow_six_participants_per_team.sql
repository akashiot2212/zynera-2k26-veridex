alter table public.participants
  drop constraint if exists participants_participant_number_check;

alter table public.participants
  add constraint participants_participant_number_check
  check (participant_number between 1 and 6);
