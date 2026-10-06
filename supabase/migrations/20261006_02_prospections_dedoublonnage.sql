-- À exécuter APRÈS la mise en ligne de la nouvelle version : l'ancienne crée
-- parfois une ligne au lieu de mettre à jour, ce qui échouerait avec l'index unique.
--
-- Fusionne les doublons (une seule ligne par bâtiment) puis les interdit.
-- Ligne gardée : la plus récente ; ses BAL / code / infos vides sont complétés
-- par la valeur la plus récente trouvée dans les doublons.
-- Vérifié à blanc le 2026-10-06 : 804 → 711 lignes, aucune valeur perdue.

begin;

update public.prospections k set
  bal = coalesce(k.bal, (
    select p.bal from public.prospections p
    where p.id_batiment = k.id_batiment and p.bal is not null
    order by p.date desc limit 1)),
  code_entree = coalesce(k.code_entree, (
    select p.code_entree from public.prospections p
    where p.id_batiment = k.id_batiment and p.code_entree is not null
    order by p.date desc limit 1)),
  infos = coalesce(k.infos, (
    select p.infos from public.prospections p
    where p.id_batiment = k.id_batiment and p.infos is not null
    order by p.date desc limit 1))
where k.id in (
    select distinct on (id_batiment) id from public.prospections
    order by id_batiment, date desc, id)
  and k.id_batiment in (
    select id_batiment from public.prospections
    group by id_batiment having count(*) > 1);

delete from public.prospections
where id not in (
  select distinct on (id_batiment) id from public.prospections
  order by id_batiment, date desc, id);

alter table public.prospections alter column id_batiment set not null;
create unique index prospections_id_batiment_key on public.prospections (id_batiment);

commit;
