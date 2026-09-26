# Modèle KREOVYA pour salles événementielles — documentation interne

Document interne (non lié depuis le site public). Rédigé pendant l'intégration
de **Salle Le Potier**, la deuxième implantation de KREOVYA après **Salle 906
Galt Est**. Objectif : rendre l'ajout d'une troisième salle rapide et sûr.

## 1. Fichiers génériques (moteur KREOVYA — jamais de donnée métier)

Ces fichiers sont **copiés à l'identique** d'un projet à l'autre. Aucun ne
contient de nom de salle, de prix, ni de règle métier codée en dur — tout est
lu depuis `kreovya/config/tenants.js` au moment de l'exécution.

```
kreovya/lib/supabaseRest.js         Client REST Supabase minimal (fetch natif)
kreovya/lib/timezone.js             Conversion heure locale <-> UTC (DST-safe)
kreovya/lib/postgresRange.js        Parsing des plages tstzrange Postgres
kreovya/tools/leadValidation.js     Regex/validateurs (UUID, email, dates...)
kreovya/tools/checkAvailability.js  Vérifie une disponibilité réelle (lecture seule)
kreovya/tools/createLead.js         Enregistre un prospect
kreovya/tools/updateLead.js         Met à jour un prospect existant
kreovya/tools/getLeadContext.js     Vérifie qu'un leadId correspond à un prospect réel
kreovya/tools/createHold.js         Crée un HOLD transactionnel de 15 minutes
kreovya/tools/prepareReservationLink.js  Génère le lien /reservation?session=...
kreovya-widget.js                   Widget conversationnel (Shadow DOM, 100% générique)
netlify/functions/kreovya-config.js Sert la config PUBLIQUE d'un tenant au widget
netlify/functions/kreovya-agent.js  Pont Anthropic + boucle tool-use (voir §2 ci-dessous)
netlify/functions/resolve-reservation-prefill.js  Relit l'état réel d'un HOLD pour /reservation
```

**Presque intégralement générique**, à UNE exception près : `kreovya-agent.js`
contient `describeRoomPricing()`, qui doit reconnaître le(s) `pricingType` du
tenant (`flatDay`, `tiered` chez Salle 906 ; `packageTiers` ajouté ici pour
Salle Le Potier). C'est la seule fonction qu'il faut parfois étendre — jamais
réécrire — quand un nouveau tenant a une grille tarifaire d'une forme inédite.
Voir §3 pour le détail des adaptations faites pour ce tenant.

## 2. Fichiers propres au tenant (jamais réutilisés tels quels)

```
kreovya/config/tenants.js           Toutes les données métier de CE tenant uniquement
netlify/functions/verify-payment.js Capture PayPal + montants attendus (ROOM_PRICING)
                                     propres à ce tenant — jamais partagé entre projets
```

Chaque salle a **son propre dépôt Git, son propre site Netlify, sa propre copie**
de ces deux fichiers. `verify-payment.js` en particulier ne doit **jamais**
être factorisé entre tenants tant que le calcul du montant dû dépend d'une
grille tarifaire propre à chacun — le dupliquer explicitement (plutôt que le
paramétrer à outrance) garde chaque tenant isolé et évite qu'une erreur sur
l'un affecte l'autre.

## 3. Informations nécessaires pour ajouter une nouvelle salle

Avant de commencer, rassembler (jamais inventer un champ manquant — le laisser
`null` + une entrée dans `unknownOrUnconfirmed`) :

- Nom légal, adresse complète, téléphone, courriel, capacité réelle.
- Domaine prévu (même provisoire — mais le marquer comme tel).
- Fuseau horaire IANA (`America/Toronto` pour tout le Québec).
- La ou les salles/ressources : nom, capacité, et LA FORME RÉELLE de la
  grille tarifaire (journée complète ? formule continue avec heures
  incluses ? forfaits fixes par palier ? autre ?). Ne jamais forcer une
  grille réelle dans un `pricingType` existant si la formule ne correspond
  pas exactement (voir `packageTiers`, ajouté pour ce tenant).
- Services additionnels et leur prix réel (ou "sur demande" si aucun prix
  n'est communiqué — ne jamais en inventer un).
- Politique de dépôt/acompte, politique d'annulation, politique alcool —
  si absente, `depositPercentage:null` et geler l'étape de paiement (§7).
- Identifiants de paiement (PayPal ou autre) propres à CE tenant — jamais
  réutiliser ceux d'un autre tenant, même temporairement.

## 4. Étapes d'intégration (résumé de ce qui a été fait pour Salle Le Potier)

1. Copier les fichiers génériques (§1) dans le nouveau dépôt, sans aucune
   modification sauf les commentaires d'exemple (`tenantId=...`).
2. Écrire `kreovya/config/tenants.js` avec une seule clé (le nouveau tenant),
   en suivant exactement la forme documentée dans le fichier lui-même.
3. Étendre `describeRoomPricing()` (dans LA COPIE LOCALE de kreovya-agent.js)
   si la grille tarifaire ne correspond à aucun `pricingType` existant.
4. Écrire `verify-payment.js` propre au tenant : `ROOM_PRICING` reflète
   exactement `tenants.js`, `paymentConfigured()` vérifie que les variables
   d'environnement PayPal DE CE SITE existent avant tout appel réel — jamais
   de repli vers un autre tenant.
5. Créer `netlify.toml` (`publish = "."`, `functions.directory =
   "netlify/functions"`).
6. Ajouter `<script src="/kreovya-widget.js" data-tenant="XXX" defer></script>`
   sur chaque page HTML du site, avec le VRAI `tenantId` du nouveau tenant.
7. Créer une page `/reservation.html` (prefill + paiement) — adapter les
   champs affichés à la réalité du tenant (ex. Salle Le Potier n'a qu'une
   salle et pas de notion de dépôt : la page est plus simple que celle de
   Salle 906, qui a 3 salles et un dépôt de 50 %).
8. Exécuter le SQL d'ajout de ressource (§6) dans Supabase.
9. Configurer les variables d'environnement Netlify (§5) du NOUVEAU site.
10. Déployer, tester (§8), puis seulement activer le paiement réel (§7).

## 5. Variables d'environnement nécessaires (par site Netlify)

| Variable | Obligatoire | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Oui | Peut être partagée entre tenants (même compte Anthropic) ou dédiée. |
| `SUPABASE_URL` | Oui | Peut être le MÊME projet Supabase que les autres tenants (isolation par `tenant_id`, déjà vérifiée). |
| `SUPABASE_SECRET_KEY` | Oui | Idem — jamais exposée au navigateur. |
| `PAYPAL_CLIENT_ID` | Non (tant que le paiement n'est pas activé) | Valeur PUBLIQUE — jamais copiée d'un autre tenant. |
| `PAYPAL_CLIENT_SECRET` | Non (tant que le paiement n'est pas activé) | SECRÈTE — jamais copiée d'un autre tenant, jamais committée. |
| `PAYPAL_ENV` | Non | `"sandbox"` ou `"live"` exactement — jamais de défaut implicite (voir `paymentConfigured()`). |
| `SITE_NAME` | Automatique | Fournie nativement par Netlify — aucune action requise. |

## 6. Configuration Supabase nécessaire

**Aucune nouvelle table.** Le schéma existant (`bookings`, `reservation_requests`,
`prefill_tokens`, `resources`, et les RPC `create_hold` /
`begin_prefill_payment` / `confirm_booking_from_prefill_token`) est déjà
multi-tenant via la colonne `tenant_id`, vérifié et utilisé par Salle 906.

**Une seule action** : insérer une ligne dans `resources` pour le nouveau
tenant (voir `SUPABASE-SETUP.sql` à la racine de ce dépôt). Rien d'autre.

## 7. Configuration paiement nécessaire

1. Obtenir un compte marchand PayPal propre au NOUVEAU tenant (jamais un
   sous-compte ou une redirection vers le compte d'un autre tenant).
2. Confirmer la politique de dépôt/acompte avec le propriétaire AVANT
   d'activer le paiement — ne jamais supposer "50 %" par défaut.
3. Renseigner `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_ENV`
   dans les variables d'environnement du site Netlify DE CE TENANT.
4. Tester d'abord en `PAYPAL_ENV=sandbox` avant tout passage en `live`.
5. Tant que ces variables sont absentes, `verify-payment.js` refuse tout
   appel PayPal réel (503, message clair) — le reste du parcours
   (disponibilité, lead, HOLD, préremplissage) reste testable normalement.

## 8. Checklist avant mise en Production (nouveau tenant)

- [ ] `kreovya/config/tenants.js` : toutes les infos vérifiées contre une
      source réelle, rien d'inventé, `unknownOrUnconfirmed` à jour.
- [ ] Ligne `resources` insérée dans Supabase pour ce tenant (§6).
- [ ] `ANTHROPIC_API_KEY` / `SUPABASE_URL` / `SUPABASE_SECRET_KEY` configurées
      sur le site Netlify de CE tenant.
- [ ] Domaine confirmé, `business.website` mis à jour dans `tenants.js`
      (CORS + lien de réservation en dépendent).
- [ ] Test complet du parcours conversationnel → HOLD → lien → préremplissage
      SANS paiement réel (paiement laissé désactivé).
- [ ] Si le paiement doit être activé : identifiants PayPal propres obtenus,
      politique de dépôt confirmée, testé d'abord en sandbox.
- [ ] Vérification qu'aucune requête de ce tenant ne peut lire/modifier une
      donnée d'un autre tenant (filtrage `tenant_id` déjà systématique dans
      le moteur — à revérifier si un fichier générique est un jour modifié).
- [ ] Test desktop + mobile (navigation, HOLD, KREOVYA, réservation).

## Notes pour une généralisation future du moteur (non appliquées ici)

Trouvées pendant cette intégration, **volontairement non corrigées sur
Salle 906** (hors périmètre de cette mission) :

- `kreovya-widget.js` (branche `kreovya-ui-preview` de salle906-site-deploy,
  pas encore fusionnée vers `main`) codait en dur "Salle 906" dans le texte
  de la mini-bulle d'accueil (`buildGreetingTeaserText`) au lieu d'utiliser
  `state.businessName`. Corrigé dans CE dépôt ; à corriger côté Salle 906
  avant de fusionner cette branche vers `main`, pour que le widget reste
  réellement générique.
- `describeRoomPricing()` ne connaît que `flatDay`/`tiered`/`packageTiers`
  pour l'instant — une future salle avec une 4e forme de grille tarifaire
  devra ajouter un nouveau cas, jamais forcer une forme existante.
