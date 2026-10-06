-- Les dates étaient envoyées en UTC (toISOString) mais stockées sans fuseau :
-- l'appli les relisait avec 2 h de décalage. On les convertit en timestamptz
-- en les interprétant comme UTC. Compatible avec l'ancienne et la nouvelle version.
alter table public.prospections
  alter column date type timestamptz using date at time zone 'UTC';
