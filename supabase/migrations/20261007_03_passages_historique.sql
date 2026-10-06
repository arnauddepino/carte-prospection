-- Étape 4 : historique des passages, accès du bâtiment, prénom de l'auteur.
--
-- Principe :
--   • passages     = l'historique (une ligne par passage : date, type, auteur)
--   • prospections = la fiche du bâtiment (BAL, code, accès, logement social,
--                    infos) + un résumé du DERNIER passage (date, type, auteur),
--                    tenu à jour automatiquement par les déclencheurs ci-dessous.
--
-- Compatible avec la version précédente de l'appli (qui écrit directement la
-- date dans prospections) : ces écritures sont converties en passages.
-- À exécuter AVANT de publier la nouvelle version.

begin;

-- ─── 1. Fiche du bâtiment ─────────────────────────────────────────────────
alter table public.prospections
  add column acces text
    check (acces in ('libre', 'code', 'badge', 'interphone', 'inaccessible')),
  add column logement_social boolean not null default false,
  add column dernier_auteur text;

-- Une fiche peut exister sans aucun passage (ex. code noté avant de passer).
alter table public.prospections
  alter column date drop not null,
  alter column date drop default;

-- ─── 2. Historique ────────────────────────────────────────────────────────
create table public.passages (
  id bigint generated always as identity primary key,
  id_batiment text not null,
  date timestamptz not null default now(),
  prospection_type_id integer references public.prospection_types (id) on delete set null,
  auteur text,
  created_at timestamptz not null default now()
);
create index passages_batiment_date_idx on public.passages (id_batiment, date desc);
create index passages_type_idx on public.passages (prospection_type_id);
create index prospections_type_idx on public.prospections (prospection_type_id);

-- Reprise de l'existant : le dernier passage connu de chaque bâtiment.
insert into public.passages (id_batiment, date, prospection_type_id)
select id_batiment, date, prospection_type_id
from public.prospections
where date is not null;

-- Mêmes droits que la table prospections (sécurisation prévue plus tard).
alter table public.passages enable row level security;
create policy "Lecture passages" on public.passages for select to anon using (true);
create policy "Ajout passages" on public.passages for insert to anon with check (true);
create policy "Modification passages" on public.passages for update to anon using (true) with check (true);
create policy "Suppression passages" on public.passages for delete to anon using (true);

-- ─── 3. Passages → fiche : recopie le dernier passage dans prospections ───
create function public.sync_dernier_passage() returns trigger
language plpgsql set search_path = public as $$
declare
  b text := coalesce(new.id_batiment, old.id_batiment);
  dernier passages%rowtype;
begin
  -- Écriture provoquée par un autre déclencheur : déjà traitée.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select * into dernier from passages
  where id_batiment = b
  order by date desc, id desc
  limit 1;

  if found then
    insert into prospections (id_batiment, date, prospection_type_id, dernier_auteur)
    values (b, dernier.date, dernier.prospection_type_id, dernier.auteur)
    on conflict (id_batiment) do update
      set date = excluded.date,
          prospection_type_id = excluded.prospection_type_id,
          dernier_auteur = excluded.dernier_auteur;
  else
    -- Plus aucun passage : la fiche reste si elle contient des informations.
    update prospections
      set date = null, prospection_type_id = null, dernier_auteur = null
      where id_batiment = b;
    delete from prospections
      where id_batiment = b
        and bal is null and code_entree is null and infos is null
        and acces is null and not logement_social;
  end if;
  return null;
end $$;

create trigger passages_sync_fiche
after insert or update or delete on public.passages
for each row execute function public.sync_dernier_passage();

-- ─── 4. Compatibilité : écriture directe de la date dans prospections ────
-- (ancienne version de l'appli) → enregistrée comme un passage.
create function public.passage_depuis_fiche() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.date is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.date is not distinct from old.date
     and new.prospection_type_id is not distinct from old.prospection_type_id then
    return null;
  end if;
  insert into passages (id_batiment, date, prospection_type_id, auteur)
  values (new.id_batiment, new.date, new.prospection_type_id, new.dernier_auteur);
  return null;
end $$;

create trigger prospections_vers_passages
after insert or update of date, prospection_type_id on public.prospections
for each row execute function public.passage_depuis_fiche();

-- Suppression d'une fiche → suppression de son historique.
create function public.supprimer_passages_fiche() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  delete from passages where id_batiment = old.id_batiment;
  return null;
end $$;

create trigger prospections_suppression_passages
after delete on public.prospections
for each row execute function public.supprimer_passages_fiche();

-- ─── 5. Temps réel : les changements de fiche sont diffusés aux collègues ─
alter table public.prospections replica identity full;
alter publication supabase_realtime add table public.prospections;

commit;
