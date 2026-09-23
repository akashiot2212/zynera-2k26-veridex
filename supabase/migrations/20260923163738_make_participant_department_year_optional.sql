alter table public.participants
  alter column department drop not null,
  alter column year drop not null;

alter table public.participants
  drop constraint if exists participants_department_check,
  drop constraint if exists participants_year_check;
