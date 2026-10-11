import { supabase } from "../supabaseClient";

// Gardiens et commerçants d'un bâtiment. Catégorie et enseigne sont visibles
// de tous ; nom, téléphone et notes (table contacts_prives) seulement des
// membres de l'équipe — la base refuse de les lire aux autres.
// Les modifications nécessitent le réseau.

export const CATEGORIES = [
  { value: "gardien", label: "Gardien", ajout: "Ajouter le gardien" },
  { value: "commercant", label: "Commerçant", ajout: "Ajouter un commerçant" },
];
export const categorieLabel = (c) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

const texte = (v) => String(v ?? "").trim() || null;

export async function fetchContacts(id_batiment, avecCoordonnees) {
  const { data, error } = await supabase.from("contacts").select("*").eq("id_batiment", id_batiment).order("id");
  if (error) return { data: null, error };
  if (!avecCoordonnees || data.length === 0) return { data, error: null };
  const prives = await supabase.from("contacts_prives").select("*").eq("id_batiment", id_batiment);
  if (prives.error) return { data, error: null }; // coordonnées indisponibles : on montre le reste
  const parId = new Map(prives.data.map((p) => [p.contact_id, p]));
  return { data: data.map((c) => ({ ...c, ...parId.get(c.id), id: c.id })), error: null };
}

export async function saveContact({ id, id_batiment, categorie, enseigne, nom, telephone, notes }) {
  const publicFields = { categorie, enseigne: categorie === "commercant" ? texte(enseigne) : null };
  const res = id
    ? await supabase.from("contacts").update(publicFields).eq("id", id).select().single()
    : await supabase.from("contacts").insert({ id_batiment, ...publicFields }).select().single();
  if (res.error) return { error: res.error };
  const prive = await supabase.from("contacts_prives").upsert(
    {
      contact_id: res.data.id,
      id_batiment,
      nom: texte(nom),
      telephone: texte(telephone),
      notes: texte(notes),
      modifie_le: new Date().toISOString(),
    },
    { onConflict: "contact_id" }
  );
  return { error: prive.error ?? null };
}

export async function deleteContact(id) {
  const { data, error } = await supabase.from("contacts").delete().eq("id", id).select("id");
  if (error) return { error };
  if (!data?.length) return { error: { message: "Seul l’auteur du contact ou l’administrateur peut le supprimer." } };
  return { error: null };
}

// Lien d'appel : chiffres et « + » seulement.
export const telHref = (tel) => `tel:${String(tel).replace(/[^\d+]/g, "")}`;
