-- Modes de prospection, comptes de l'équipe et contacts (gardiens, commerçants).
--
-- 1. Modes : chaque passage a un mode — boîtage (flyers, comme avant),
--    porte-à-porte, gardien, commerçant. Les colonnes de la fiche date,
--    prospection_type_id, date_complet et adresses décrivent désormais le
--    dernier BOÎTAGE ; modes = { mode: { date, auteur } } le dernier passage des
--    autres modes ; dernier_auteur(_id) = auteur du dernier passage, tous modes
--    (c'est lui qui peut compléter la fiche).
-- 2. Comptes : un collègue crée son compte (prénom, e-mail, mot de passe) dans
--    l'appli ; il reste « en attente » jusqu'à la validation par
--    l'administrateur. Les passages faits auparavant sur son téléphone
--    (identité anonyme) passent à son nom à la validation.
-- 3. Contacts : gardiens et commerçants d'un bâtiment. Catégorie et enseigne
--    sont visibles de tous ; nom, téléphone et notes seulement des membres de
--    l'équipe (comptes validés) et de l'administrateur.
--
-- Compatible avec la version en ligne (ses passages sont des boîtages) : à
-- exécuter AVANT de pousser la nouvelle version.

begin;

-- ─── 1. Modes de prospection ─────────────────────────────────────────────
alter table public.passages
  add column mode text not null default 'boitage'
  check (mode in ('boitage', 'porte_a_porte', 'gardien', 'commercant'));
grant insert (mode) on public.passages to authenticated;

alter table public.prospections add column modes jsonb;

create or replace function public.sync_dernier_passage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b text := coalesce(new.id_batiment, old.id_batiment);
  boitage passages%rowtype;
  dernier passages%rowtype;
  complet timestamptz;
  partiels jsonb;
  autres jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- Dernier passage, tous modes (auteur de la fiche).
  select * into dernier from passages
  where id_batiment = b
  order by date desc, id desc
  limit 1;

  if not found then
    update prospections
      set date = null, prospection_type_id = null, dernier_auteur = null, dernier_auteur_id = null,
          date_complet = null, adresses = null, modes = null
      where id_batiment = b;
    delete from prospections
      where id_batiment = b
        and bal is null and code_entree is null and infos is null
        and acces is null and not logement_social and not pas_social;
    return null;
  end if;

  -- Dernier boîtage, et suivi par adresse des boîtages.
  select * into boitage from passages
  where id_batiment = b and mode = 'boitage'
  order by date desc, id desc
  limit 1;

  select max(date) into complet from passages
  where id_batiment = b and mode = 'boitage' and adresses is null;

  select jsonb_object_agg(a, d) into partiels from (
    select a, max(p.date) as d
    from passages p, unnest(p.adresses) as a
    where p.id_batiment = b and p.mode = 'boitage' and (complet is null or p.date > complet)
    group by a
  ) x;

  -- Dernier passage de chacun des autres modes.
  select jsonb_object_agg(mode, jsonb_build_object('date', date, 'auteur', auteur)) into autres from (
    select distinct on (mode) mode, date, auteur
    from passages
    where id_batiment = b and mode <> 'boitage'
    order by mode, date desc, id desc
  ) x;

  insert into prospections (id_batiment, date, prospection_type_id, dernier_auteur, dernier_auteur_id, date_complet, adresses, modes)
  values (b, boitage.date, boitage.prospection_type_id, dernier.auteur, dernier.auteur_id, complet, partiels, autres)
  on conflict (id_batiment) do update
    set date = excluded.date,
        prospection_type_id = excluded.prospection_type_id,
        dernier_auteur = excluded.dernier_auteur,
        dernier_auteur_id = excluded.dernier_auteur_id,
        date_complet = excluded.date_complet,
        adresses = excluded.adresses,
        modes = excluded.modes;
  return null;
end $$;
revoke execute on function public.sync_dernier_passage() from public, anon, authenticated;

-- ─── 2. Comptes de l'équipe ──────────────────────────────────────────────
create table public.membres (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prenom text not null check (length(trim(prenom)) between 1 and 40),
  email text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'actif', 'refuse')),
  ancien_uid uuid, -- identité anonyme du téléphone, reprise à la validation
  demande_le timestamptz not null default now(),
  valide_le timestamptz
);
alter table public.membres enable row level security;
revoke all on public.membres from anon, authenticated;
grant select on public.membres to authenticated;
create policy "Membres : sa propre demande, tout pour l'admin" on public.membres for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Jeton remis à une identité anonyme avant la création du compte, pour
-- prouver que les passages de ce téléphone lui appartiennent.
create table public.transferts (
  jeton uuid primary key default gen_random_uuid(),
  anon_uid uuid not null references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table public.transferts enable row level security; -- aucune règle : fonctions seulement
revoke all on public.transferts from anon, authenticated;

create function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from membres where user_id = auth.uid() and statut = 'actif');
$$;

create function public.preparer_compte() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  j uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false then
    raise exception 'Réservé à une identité anonyme';
  end if;
  delete from transferts where cree_le < now() - interval '1 day';
  insert into transferts (anon_uid) values (auth.uid()) returning jeton into j;
  return j;
end $$;

create function public.demander_acces(p_prenom text, p_jeton uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  a uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Réservé à un compte avec e-mail';
  end if;
  if p_jeton is not null then
    delete from transferts where jeton = p_jeton and cree_le > now() - interval '1 day' returning anon_uid into a;
  end if;
  insert into membres (user_id, prenom, email, ancien_uid)
  values (auth.uid(), trim(p_prenom), auth.jwt() ->> 'email', a)
  on conflict (user_id) do update
    set prenom = excluded.prenom,
        ancien_uid = coalesce(excluded.ancien_uid, membres.ancien_uid);
end $$;

-- Validation (actif), refus ou retrait (refuse) par l'administrateur. À la
-- première validation, les passages du téléphone passent au nom du compte.
create function public.valider_membre(p_user uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a uuid;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administrateur';
  end if;
  if p_statut not in ('actif', 'refuse') then
    raise exception 'Statut inconnu : %', p_statut;
  end if;
  update membres
    set statut = p_statut, valide_le = case when p_statut = 'actif' then now() end
    where user_id = p_user
    returning ancien_uid into a;
  if p_statut = 'actif' and a is not null then
    update passages set auteur_id = p_user where auteur_id = a;
    update prospections set dernier_auteur_id = p_user where dernier_auteur_id = a;
    update membres set ancien_uid = null where user_id = p_user;
  end if;
end $$;

revoke execute on function public.est_membre() from public, anon;
revoke execute on function public.preparer_compte() from public, anon;
revoke execute on function public.demander_acces(text, uuid) from public, anon;
revoke execute on function public.valider_membre(uuid, text) from public, anon;
grant execute on function public.est_membre() to authenticated;
grant execute on function public.preparer_compte() to authenticated;
grant execute on function public.demander_acces(text, uuid) to authenticated;
grant execute on function public.valider_membre(uuid, text) to authenticated;

-- ─── 3. Contacts : gardiens et commerçants ───────────────────────────────
create table public.contacts (
  id bigint generated always as identity primary key,
  id_batiment text not null,
  categorie text not null check (categorie in ('gardien', 'commercant')),
  enseigne text check (enseigne is null or length(enseigne) <= 80),
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index contacts_id_batiment on public.contacts (id_batiment);

create table public.contacts_prives (
  contact_id bigint primary key references public.contacts (id) on delete cascade,
  id_batiment text not null,
  nom text check (nom is null or length(nom) <= 80),
  telephone text check (telephone is null or length(telephone) <= 30),
  notes text check (notes is null or length(notes) <= 2000),
  modifie_le timestamptz not null default now()
);
create index contacts_prives_id_batiment on public.contacts_prives (id_batiment);

alter table public.contacts enable row level security;
alter table public.contacts_prives enable row level security;
revoke all on public.contacts, public.contacts_prives from anon, authenticated;
grant select on public.contacts to authenticated;
grant insert (id_batiment, categorie, enseigne), update (categorie, enseigne), delete on public.contacts to authenticated;
grant select, insert, update, delete on public.contacts_prives to authenticated;

create policy "Connectés : lecture" on public.contacts for select to authenticated using (true);
create policy "Membres : nouveau contact" on public.contacts for insert to authenticated with check (public.est_membre());
create policy "Membres : modification" on public.contacts for update to authenticated
  using (public.est_membre()) with check (public.est_membre());
create policy "Membres : suppression de ses contacts" on public.contacts for delete to authenticated
  using (public.est_membre() and (cree_par = auth.uid() or public.is_admin()));

create policy "Membres : coordonnées" on public.contacts_prives for all to authenticated
  using (public.est_membre()) with check (public.est_membre());

commit;
