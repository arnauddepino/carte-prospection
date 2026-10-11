import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { readJson, writeJson } from "../lib/storage";

const ADMIN_EMAIL = import.meta.env.REACT_APP_ADMIN_EMAIL;
const ADMIN_CACHE = "prospection.admin";
const MEMBRE_CACHE = "prospection.membre";

// Identité du téléphone :
//   • sans compte : connexion anonyme Supabase, automatique et invisible
//     (le prénom reste le seul renseignement demandé) ; accès limité (les
//     coordonnées des gardiens et commerçants sont masquées) ;
//   • membre de l'équipe : compte e-mail + mot de passe, validé par
//     l'administrateur (membre = { prenom, statut } ; statut « en_attente »,
//     « actif » ou « refuse ») ;
//   • administrateur : compte Supabase protégé par un mot de passe.
// La session est gardée sur le téléphone : l'appli fonctionne hors ligne une
// fois connectée.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => readJson(ADMIN_CACHE, false));
  const [membre, setMembre] = useState(() => readJson(MEMBRE_CACHE, null));

  // Demande d'accès du compte connecté (null sans compte, ou pour l'admin).
  const loadMembre = useCallback(async (s) => {
    if (!s || s.user?.is_anonymous) {
      setMembre(null);
      writeJson(MEMBRE_CACHE, null);
      return null;
    }
    const { data, error: e } = await supabase.from("membres").select("prenom, statut").eq("user_id", s.user.id).maybeSingle();
    if (e) return readJson(MEMBRE_CACHE, null); // hors ligne : dernier état connu
    setMembre(data);
    writeJson(MEMBRE_CACHE, data);
    return data;
  }, []);

  const checkAdmin = useCallback(async (s) => {
    if (!s || s.user?.is_anonymous) {
      setIsAdmin(false);
      writeJson(ADMIN_CACHE, false);
      return false;
    }
    const { data, error: e } = await supabase.rpc("is_admin");
    if (e) return readJson(ADMIN_CACHE, false); // hors ligne : on garde le dernier état connu
    setIsAdmin(Boolean(data));
    writeJson(ADMIN_CACHE, Boolean(data));
    return Boolean(data);
  }, []);

  const signInAnonymously = useCallback(async () => {
    const { data, error: e } = await supabase.auth.signInAnonymously();
    if (e) {
      console.error("Connexion anonyme :", e);
      setError(e);
      return null;
    }
    setError(null);
    return data.session;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data, error: e } = await supabase.auth.getSession();
      let s = data.session;
      // Aucune session (première ouverture) : identité anonyme. Si la session
      // n'a pas pu être relue (hors ligne), on ne la remplace pas : elle sera
      // rafraîchie au retour du réseau, sans perdre le lien avec ses passages.
      if (!s && !e) s = await signInAnonymously();
      if (cancelled) return;
      setSession(s);
      setReady(true);
      if (s) {
        checkAdmin(s);
        loadMembre(s);
      }
    };
    init();
    const onOnline = () => !cancelled && init();
    window.addEventListener("online", onOnline);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) setSession(s);
    });
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      sub.subscription.unsubscribe();
    };
  }, [signInAnonymously, checkAdmin, loadMembre]);

  // Connexion administrateur. Renvoie un message d'erreur, ou null.
  const signInAdmin = useCallback(
    async (password) => {
      if (!ADMIN_EMAIL) return "Compte administrateur non configuré (REACT_APP_ADMIN_EMAIL).";
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
      if (e) return /invalid/i.test(e.message) ? "Mot de passe incorrect." : `Connexion impossible : ${e.message}`;
      setSession(data.session);
      if (!(await checkAdmin(data.session))) {
        await supabase.auth.signOut();
        setSession(await signInAnonymously());
        return "Ce compte n’a pas les droits d’administration.";
      }
      return null;
    },
    [checkAdmin, signInAnonymously]
  );

  // Repasser en simple utilisateur (nouvelle identité anonyme).
  const becomeUser = useCallback(async () => {
    if (session?.user?.is_anonymous) return;
    await supabase.auth.signOut();
    const s = await signInAnonymously();
    setSession(s);
    checkAdmin(s);
    loadMembre(s);
  }, [session, signInAnonymously, checkAdmin, loadMembre]);

  // Création d'un compte de l'équipe. Les passages déjà faits sur ce
  // téléphone lui seront rattachés à la validation (jeton de l'identité
  // anonyme). Renvoie un message d'erreur, ou null.
  const signUp = useCallback(
    async ({ prenom, email, password }) => {
      let jeton = null;
      if (session?.user?.is_anonymous) {
        const { data } = await supabase.rpc("preparer_compte");
        jeton = data ?? null;
      }
      const { data, error: e } = await supabase.auth.signUp({ email, password, options: { data: { prenom } } });
      if (e) {
        if (/already|registered|exists/i.test(e.message)) return "Un compte existe déjà avec cet e-mail : connectez-vous.";
        if (/password/i.test(e.message)) return "Mot de passe trop court (6 caractères au moins).";
        return `Création impossible : ${e.message}`;
      }
      if (!data.session) return "Compte créé, mais la confirmation par e-mail est activée dans Supabase : à désactiver par l’administrateur.";
      setSession(data.session);
      const { error: e2 } = await supabase.rpc("demander_acces", { p_prenom: prenom, p_jeton: jeton });
      if (e2) return `Demande d’accès impossible : ${e2.message}`;
      await loadMembre(data.session);
      checkAdmin(data.session);
      return null;
    },
    [session, loadMembre, checkAdmin]
  );

  // Connexion d'un membre de l'équipe. Renvoie { error, membre }.
  const signIn = useCallback(
    async ({ email, password }) => {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) return { error: /invalid/i.test(e.message) ? "E-mail ou mot de passe incorrect." : `Connexion impossible : ${e.message}` };
      setSession(data.session);
      checkAdmin(data.session);
      return { error: null, membre: await loadMembre(data.session) };
    },
    [checkAdmin, loadMembre]
  );

  return {
    ready,
    error,
    uid: session?.user?.id ?? null,
    email: session?.user?.is_anonymous ? null : (session?.user?.email ?? null),
    isAdmin: Boolean(session && !session.user?.is_anonymous && isAdmin),
    membre,
    // Membre validé (ou administrateur) : voit et gère les coordonnées des contacts.
    estMembre: Boolean(session && !session.user?.is_anonymous && (isAdmin || membre?.statut === "actif")),
    refreshMembre: () => loadMembre(session),
    retry: () => window.location.reload(),
    signInAdmin,
    becomeUser,
    signUp,
    signIn,
  };
}

// « Arnaud », « arnaud », « Arnaud » avec espaces… → demande du rôle.
export const isAdminName = (prenom) =>
  (prenom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase() === "arnaud";
