import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { readJson, writeJson } from "../lib/storage";

const ADMIN_EMAIL = import.meta.env.REACT_APP_ADMIN_EMAIL;
const ADMIN_CACHE = "prospection.admin";

// Identité du téléphone :
//   • utilisateur : connexion anonyme Supabase, automatique et invisible
//     (le prénom reste le seul renseignement demandé) ;
//   • administrateur : compte Supabase protégé par un mot de passe.
// La session est gardée sur le téléphone : l'appli fonctionne hors ligne une
// fois connectée.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => readJson(ADMIN_CACHE, false));

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
      if (s) checkAdmin(s);
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
  }, [signInAnonymously, checkAdmin]);

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
  }, [session, signInAnonymously, checkAdmin]);

  return {
    ready,
    error,
    uid: session?.user?.id ?? null,
    isAdmin: Boolean(session && !session.user?.is_anonymous && isAdmin),
    retry: () => window.location.reload(),
    signInAdmin,
    becomeUser,
  };
}

// « Arnaud », « arnaud », « Arnaud » avec espaces… → demande du rôle.
export const isAdminName = (prenom) =>
  (prenom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase() === "arnaud";
