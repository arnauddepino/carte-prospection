-- Sécurité : chaque téléphone a une identité (connexion anonyme Supabase,
-- invisible pour l'utilisateur) ; l'administrateur se connecte avec un mot de passe.
--
-- Règles (appliquées par la base, quel que soit l'outil utilisé) :
--   • tout le monde (connecté) lit les données, enregistre des passages et
--     crée des types de prospection ;
--   • un passage ne peut être supprimé (annulé) que par son auteur, ou l'admin ;
--   • la fiche d'un bâtiment (BAL, code, accès, infos) ne peut être modifiée
--     que par l'auteur du dernier passage (ou si personne n'est identifié),
--     ou par l'admin ; supprimer une fiche est réservé à l'admin ;
--   • les secteurs ne peuvent être créés, modifiés ou supprimés que par l'admin ;
--   • la date, le type et l'auteur du dernier passage d'une fiche ne sont
--     écrits que par la base (déclencheurs), jamais directement.
--
-- Compatible avec la version en ligne (les droits « anon » actuels restent
-- jusqu'à la migration 08, à exécuter après la mise en ligne).

begin;

-- ─── Administrateurs ──────────────────────────────────────────────────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security; -- aucune règle : lu seulement par is_admin()

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- ─── Auteur des passages et des fiches ───────────────────────────────────
alter table public.passages
  add column auteur_id uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.prospections
  add column dernier_auteur_id uuid references auth.users (id) on delete set null;

-- ─── Déclencheurs : exécutés avec les droits du propriétaire ─────────────
-- (ils écrivent la date et l'auteur du dernier passage, que les utilisateurs
--  ne peuvent pas écrire eux-mêmes)
create or replace function public.sync_dernier_passage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b text := coalesce(new.id_batiment, old.id_batiment);
  dernier passages%rowtype;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select * into dernier from passages
  where id_batiment = b
  order by date desc, id desc
  limit 1;

  if found then
    insert into prospections (id_batiment, date, prospection_type_id, dernier_auteur, dernier_auteur_id)
    values (b, dernier.date, dernier.prospection_type_id, dernier.auteur, dernier.auteur_id)
    on conflict (id_batiment) do update
      set date = excluded.date,
          prospection_type_id = excluded.prospection_type_id,
          dernier_auteur = excluded.dernier_auteur,
          dernier_auteur_id = excluded.dernier_auteur_id;
  else
    update prospections
      set date = null, prospection_type_id = null, dernier_auteur = null, dernier_auteur_id = null
      where id_batiment = b;
    delete from prospections
      where id_batiment = b
        and bal is null and code_entree is null and infos is null
        and acces is null and not logement_social;
  end if;
  return null;
end $$;

create or replace function public.passage_depuis_fiche() returns trigger
language plpgsql security definer set search_path = public as $$
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

create or replace function public.supprimer_passages_fiche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  delete from passages where id_batiment = old.id_batiment;
  return null;
end $$;

-- ─── Colonnes modifiables par les utilisateurs ───────────────────────────
revoke insert, update on public.prospections from authenticated;
grant insert (id_batiment, bal, code_entree, infos, acces, logement_social) on public.prospections to authenticated;
grant update (id_batiment, bal, code_entree, infos, acces, logement_social) on public.prospections to authenticated;

revoke insert, update on public.passages from authenticated;
grant insert (client_id, id_batiment, date, prospection_type_id, auteur) on public.passages to authenticated;

-- ─── Règles d'accès des utilisateurs connectés ───────────────────────────
-- Ancienne règle trop large (rôle « public », donc aussi les connectés).
drop policy if exists "public update prospection_type_id" on public.prospections;

create policy "Connectés : lecture" on public.prospections for select to authenticated using (true);
create policy "Connectés : nouvelle fiche" on public.prospections for insert to authenticated with check (true);
create policy "Connectés : fiche du dernier passage" on public.prospections for update to authenticated
  using (dernier_auteur_id is null or dernier_auteur_id = auth.uid() or public.is_admin())
  with check (true);
create policy "Admin : suppression de fiche" on public.prospections for delete to authenticated
  using (public.is_admin());

create policy "Connectés : lecture" on public.passages for select to authenticated using (true);
create policy "Connectés : passage à son nom" on public.passages for insert to authenticated
  with check (auteur_id = auth.uid());
create policy "Connectés : annuler ses passages" on public.passages for delete to authenticated
  using (auteur_id = auth.uid() or public.is_admin());

create policy "Connectés : lecture" on public.secteurs for select to authenticated using (true);
create policy "Admin : création de secteur" on public.secteurs for insert to authenticated with check (public.is_admin());
create policy "Admin : modification de secteur" on public.secteurs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin : suppression de secteur" on public.secteurs for delete to authenticated using (public.is_admin());

create policy "Connectés : lecture" on public.prospection_types for select to authenticated using (true);
create policy "Connectés : nouveau type" on public.prospection_types for insert to authenticated with check (true);

commit;
