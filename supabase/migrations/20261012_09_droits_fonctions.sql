-- Propreté (alertes de Supabase) : les fonctions internes ne sont pas
-- appelables depuis l'API.
--   • les trois fonctions de déclencheur ne servent qu'aux déclencheurs (qui
--     n'ont pas besoin de ce droit pour s'exécuter) ;
--   • is_admin() reste appelable par les utilisateurs connectés uniquement.

begin;

revoke execute on function public.sync_dernier_passage() from public, anon, authenticated;
revoke execute on function public.passage_depuis_fiche() from public, anon, authenticated;
revoke execute on function public.supprimer_passages_fiche() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

commit;
