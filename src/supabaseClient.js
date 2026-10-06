import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.REACT_APP_SUPABASE_URL;
const supabaseKey = import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

// Sur le terrain, le réseau est souvent « présent » sans passer (halls,
// sous-sols) : une requête bloquée est abandonnée au bout de 12 s, sans
// nouvel essai immédiat. La file d'envoi de l'appli retente elle-même plus tard.
const options = { db: { retry: false, timeout: 12000 } };

// null si la configuration manque : l'appli affiche alors un message clair
// au lieu d'une page blanche.
export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, options) : null;
