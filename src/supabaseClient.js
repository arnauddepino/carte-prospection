import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.REACT_APP_SUPABASE_URL;
const supabaseKey = import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

// null si la configuration manque : l'appli affiche alors un message clair
// au lieu d'une page blanche.
export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
