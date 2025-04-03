import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://amzhcsnxdcuvwhlhmitn.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtemhjc254ZGN1dndobGhtaXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2MTE0ODQsImV4cCI6MjA1OTE4NzQ4NH0._AhbTiuWLgagzJ0hgYA9sOFvGYVZD9_pKZV3wMYICI4";

export const supabase = createClient(supabaseUrl, supabaseKey);
