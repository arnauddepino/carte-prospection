-- Mode hors ligne : chaque passage reçoit un identifiant créé sur le téléphone.
--   • un passage saisi hors ligne garde le même identifiant jusqu'à son envoi ;
--   • si le réseau coupe après l'enregistrement mais avant la réponse, le renvoi
--     est reconnu (même identifiant) et ne crée pas de doublon.
-- Les passages existants et ceux créés par l'ancienne version de l'appli
-- reçoivent un identifiant automatiquement.
-- Compatible avec la version en ligne : à exécuter AVANT de publier.

alter table public.passages
  add column client_id uuid not null default gen_random_uuid();

alter table public.passages
  add constraint passages_client_id_key unique (client_id);
