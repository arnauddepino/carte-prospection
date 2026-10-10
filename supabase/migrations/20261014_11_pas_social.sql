-- Logements sociaux : la carte les repère d'après le répertoire national
-- (public/social-15e.json). La fiche permet de corriger cette donnée :
--   • logement_social = true : social, coché à la main (comme avant) ;
--   • pas_social = true      : marqué social par les données, mais ne l'est pas.
--
-- Compatible avec la version en ligne (elle n'envoie pas pas_social) : à
-- exécuter AVANT de pousser la nouvelle version.

begin;

alter table public.prospections
  add column pas_social boolean not null default false;

grant insert (pas_social), update (pas_social) on public.prospections to authenticated;

-- Une fiche sans passage n'est supprimée que si elle ne porte plus aucune
-- information (pas_social en est une).
create or replace function public.sync_dernier_passage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b text := coalesce(new.id_batiment, old.id_batiment);
  dernier passages%rowtype;
  complet timestamptz;
  partiels jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select * into dernier from passages
  where id_batiment = b
  order by date desc, id desc
  limit 1;

  if found then
    select max(date) into complet from passages
    where id_batiment = b and adresses is null;

    select jsonb_object_agg(a, d) into partiels from (
      select a, max(p.date) as d
      from passages p, unnest(p.adresses) as a
      where p.id_batiment = b and (complet is null or p.date > complet)
      group by a
    ) x;

    insert into prospections (id_batiment, date, prospection_type_id, dernier_auteur, dernier_auteur_id, date_complet, adresses)
    values (b, dernier.date, dernier.prospection_type_id, dernier.auteur, dernier.auteur_id, complet, partiels)
    on conflict (id_batiment) do update
      set date = excluded.date,
          prospection_type_id = excluded.prospection_type_id,
          dernier_auteur = excluded.dernier_auteur,
          dernier_auteur_id = excluded.dernier_auteur_id,
          date_complet = excluded.date_complet,
          adresses = excluded.adresses;
  else
    update prospections
      set date = null, prospection_type_id = null, dernier_auteur = null, dernier_auteur_id = null,
          date_complet = null, adresses = null
      where id_batiment = b;
    delete from prospections
      where id_batiment = b
        and bal is null and code_entree is null and infos is null
        and acces is null and not logement_social and not pas_social;
  end if;
  return null;
end $$;

-- Toujours réservée aux déclencheurs (comme après la migration 09).
revoke execute on function public.sync_dernier_passage() from public, anon, authenticated;

commit;
