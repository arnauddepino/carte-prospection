-- Secteurs dessinés sur la carte en suivant les rues.
--   points   : points posés par l'utilisateur (carrefours), [[lat, lng], …]
--   legs     : tronçons entre deux points consécutifs, qui suivent les rues,
--              [[[lat, lng], …], …] (le dernier revient au premier point)
--   inverses : indices des tronçons dessinés de l'autre côté de la rue (la
--              rangée d'immeubles d'en face appartient alors au secteur)
-- Sans effet sur la version en ligne : peut être exécutée avant la publication.

begin;

create table public.secteurs (
  id bigint generated always as identity primary key,
  nom text not null,
  couleur text not null,
  responsable text,
  points jsonb not null,
  legs jsonb not null,
  inverses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Mêmes droits que les autres tables (sécurisation prévue plus tard).
alter table public.secteurs enable row level security;
create policy "Lecture secteurs" on public.secteurs for select to anon using (true);
create policy "Ajout secteurs" on public.secteurs for insert to anon with check (true);
create policy "Modification secteurs" on public.secteurs for update to anon using (true) with check (true);
create policy "Suppression secteurs" on public.secteurs for delete to anon using (true);

-- Les secteurs dessinés par un collègue apparaissent chez les autres en direct.
alter table public.secteurs replica identity full;
alter publication supabase_realtime add table public.secteurs;

commit;
