-- Secteurs : une suite de tronçons de rue (traits ouverts, pas forcément
-- reliés) au lieu d'un contour fermé.
--   troncons : [{ "coords": [[lat, lng], …], "cote": "deux" | "gauche" | "droite" }, …]
--              cote = côté(s) de la rue couverts, par rapport au sens de tracé.
-- Les secteurs existants sont convertis : chaque tronçon couvre les deux côtés.
-- À exécuter juste avant de publier la nouvelle version (l'ancienne ne sait
-- plus créer de secteur une fois les anciennes colonnes supprimées).

begin;

alter table public.secteurs
  add column troncons jsonb not null default '[]'::jsonb;

update public.secteurs
set troncons = (
  select coalesce(jsonb_agg(jsonb_build_object('coords', leg, 'cote', 'deux')), '[]'::jsonb)
  from jsonb_array_elements(legs) as leg
);

alter table public.secteurs
  drop column points,
  drop column legs,
  drop column inverses;

commit;
