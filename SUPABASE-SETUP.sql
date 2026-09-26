-- ============================================================
-- Salle Le Potier — SQL à exécuter dans Supabase (Production, même projet
-- que Salle 906) pour activer ce nouveau tenant.
-- ============================================================
-- NE TOUCHE À AUCUNE LIGNE EXISTANTE : cette instruction est une insertion
-- pure, scopée à tenant_id='salle-le-potier' — une valeur qui n'existe nulle
-- part ailleurs dans la base. Aucune donnée Salle 906 n'est lue, modifiée ou
-- supprimée par ce script.
--
-- Prérequis déjà vérifiés dans ce projet (aucune nouvelle table nécessaire) :
--   - Les tables bookings / reservation_requests / prefill_tokens
--     possèdent déjà une colonne tenant_id et les RPC (create_hold,
--     begin_prefill_payment, confirm_booking_from_prefill_token) sont déjà
--     génériques multi-tenant — validé et utilisé par Salle 906.
--   - Seule une nouvelle ligne dans `resources` est nécessaire pour qu'un
--     nouveau tenant existe : checkAvailability.js / createHold.js ne
--     lisent que resources.id / slug / name / active, filtrés par tenant_id.
--
-- ⚠️ Avant d'exécuter : vérifiez que la table `resources` de votre projet
-- Supabase n'a pas d'autre colonne NOT NULL sans valeur par défaut au-delà
-- de celles listées ici — je n'ai pas d'accès direct à votre schéma exact
-- depuis cet environnement et n'ai donc pas pu le vérifier moi-même.

insert into public.resources (tenant_id, slug, name, active)
values ('salle-le-potier', 'principale', 'Salle Le Potier', true);

-- Vérification (lecture seule) après exécution :
-- select * from public.resources where tenant_id = 'salle-le-potier';
