-- Fin de la sécurisation : plus aucun accès sans connexion (rôle « anon »).
-- À exécuter APRÈS la mise en ligne de la version avec connexion (migration
-- 07) : les onglets restés ouverts sur l'ancienne version devront être rechargés.

begin;

drop policy if exists "Update" on public.prospections;
drop policy if exists "Lecture" on public.prospections;

drop policy if exists "Lecture passages" on public.passages;
drop policy if exists "Ajout passages" on public.passages;
drop policy if exists "Modification passages" on public.passages;
drop policy if exists "Suppression passages" on public.passages;

drop policy if exists "Lecture secteurs" on public.secteurs;
drop policy if exists "Ajout secteurs" on public.secteurs;
drop policy if exists "Modification secteurs" on public.secteurs;
drop policy if exists "Suppression secteurs" on public.secteurs;

-- Anciennes règles des types (rôle « public ») remplacées par celles des connectés.
drop policy if exists "public insert prospection_types" on public.prospection_types;
drop policy if exists "public select prospection_types" on public.prospection_types;

revoke all on public.prospections, public.passages, public.secteurs, public.prospection_types, public.admins from anon;

commit;
