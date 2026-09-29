# KREOVYA CORE — documentation interne

Document interne (non lié depuis le site public). Rédigé pendant l'intégration
de **Salle Le Potier**, la deuxième implantation de KREOVYA après **Salle 906
Galt Est**, puis mis à jour le **29 septembre 2026** lors du chantier
"KREOVYA Core centralisé" qui a extrait le moteur générique en modules
partagés explicites. Objectif : qu'ajouter une troisième salle ne nécessite
**aucune modification de logique métier**, seulement de la configuration.

## 1. KREOVYA CORE — fichiers génériques (jamais de donnée métier)

Ces fichiers sont **copiés à l'identique** d'un projet à l'autre (voir §5,
"stratégie de distribution", pour comment cette copie est maintenue en
pratique). Aucun ne contient de nom de salle, de prix, ni de règle métier
codée en dur — tout est lu depuis `kreovya/config/tenants.js` au moment de
l'exécution.

```
kreovya/lib/supabaseRest.js          Client REST Supabase minimal (fetch natif)
kreovya/lib/timezone.js              Conversion heure locale <-> UTC (DST-safe)
kreovya/lib/postgresRange.js         Parsing des plages tstzrange Postgres
kreovya/lib/pricingEngine.js         calculatePrice()/describePricing() — SEULE
                                      source du prix affiché ET vérifié (§3)
kreovya/lib/tenantContext.js         Source d'autorité serveur "quel(s) tenant(s)
                                      ce site sert" (getServerTenantContext,
                                      resolveTenantConfig, assertTenantOwnership)
kreovya/lib/resolvePrefillToken.js   Résolution sécurisée d'un token de session
                                      (frontière multi-tenant, voir §4)
kreovya/lib/log.js                   Logging structuré minimal (jamais de PII/secret)
kreovya/tools/leadValidation.js      Regex/validateurs (UUID, email, dates...)
kreovya/tools/checkAvailability.js   Vérifie une disponibilité réelle (lecture seule)
kreovya/tools/createLead.js          Enregistre un prospect
kreovya/tools/updateLead.js          Met à jour un prospect existant
kreovya/tools/getLeadContext.js      Vérifie qu'un leadId correspond à un prospect réel
kreovya/tools/createHold.js          Crée un HOLD transactionnel de 15 minutes
kreovya/tools/prepareReservationLink.js  Génère le lien /reservation?session=...
kreovya-widget.js                    Widget conversationnel (Shadow DOM, 100% générique)
netlify/functions/kreovya-config.js  Sert la config PUBLIQUE d'un tenant au widget
netlify/functions/kreovya-agent.js   Pont Anthropic + boucle tool-use (généricité voir §3)
netlify/functions/resolve-reservation-prefill.js  Relit l'état réel d'un HOLD (délègue à resolvePrefillToken.js)
netlify.toml                         Config Netlify — identique pour tout tenant
```

**Vérifié réellement générique** (test `tests/check-core-drift.sh`, voir §6) :
seules des différences de COMMENTAIRES subsistent entre les deux
implémentations réelles (Salle 906 / Salle Le Potier) sur ces fichiers —
aucune différence de comportement.

## 2. Fichiers propres au tenant (jamais partagés)

```
kreovya/config/tenants.js            Toutes les données métier de CE tenant uniquement
netlify/functions/verify-payment.js  Pont paiement — dérive désormais le montant
                                      via pricingEngine.calculatePrice() (plus de
                                      ROOM_PRICING dupliqué), mais reste un fichier
                                      propre au tenant car il porte des identifiants
                                      PayPal et un flux (deposit/full, etc.) qui
                                      peuvent différer légitimement.
```

Chaque salle a **son propre dépôt Git, son propre site Netlify, sa propre copie**
de ces deux fichiers. Les CREDENTIALS restent toujours isolés par site/tenant
(variables d'environnement Netlify propres à chaque déploiement) — jamais
centralisés, jamais dans du JavaScript client.

## 3. Pricing Engine (kreovya/lib/pricingEngine.js)

Deux fonctions exportées, utilisées PAR TOUS les points d'entrée qui ont
besoin d'un prix — jamais recalculées séparément ailleurs :

- **`describePricing(room)`** → texte pour le prompt système de l'agent
  conversationnel (kreovya-agent.js). Pure mise en forme, aucun calcul de
  montant pour une période précise.
- **`calculatePrice({ tenantId, resourceSlug, startIso, endIso, hours,
  paymentOption, cleaningSelected })`** → montant AUTORITAIRE, utilisé par
  `verify-payment.js` pour vérifier ce que PayPal a réellement capturé.
  Accepte `hours` directement OU `startIso`/`endIso` (le premier permet à un
  parcours qui ne connaît qu'une durée — ex. l'ancien /reservation direct de
  Salle 906 — de rester fonctionnel sans changement).

Types de grille tarifaire reconnus aujourd'hui (`rooms[].pricingType`) :
`flatDay`, `tiered`, `packageTiers`. **Une nouvelle salle avec une 4ᵉ forme
de grille ajoute un nouveau type UNIQUEMENT dans ce fichier** — jamais en
forçant une forme existante à correspondre approximativement, jamais en
dupliquant la logique ailleurs.

## 4. Sécurité multi-tenant des sessions (kreovya/lib/resolvePrefillToken.js)

`prefill_tokens` est une table Supabase **partagée** entre tous les tenants.
Un audit du 28 septembre 2026 a trouvé qu'un token créé pour un tenant
pouvait être résolu depuis le site d'un AUTRE tenant (la recherche initiale
ne filtrait pas par tenant_id). Corrigé et **désormais centralisé** dans ce
module unique, utilisé identiquement par `resolve-reservation-prefill.js` et
`verify-payment.js` :

1. La requête Supabase elle-même est bornée à `listTenantIds()`
   (`tenantContext.getServerTenantContext()`) — les tenants que CE
   déploiement sert réellement — AVANT même de rapatrier la ligne.
2. Chaque relation (booking, resource, lead) est revérifiée explicitement
   contre ce même tenantId (`assertTenantOwnership`).
3. **FAIL CLOSED durci** : un lead manquant ou appartenant à un autre tenant
   invalide désormais TOUTE la résolution (plus de `lead:null` silencieux) —
   un booking réel a toujours un `reservation_request_id` valide en
   fonctionnement normal ; son absence est une incohérence, jamais un état
   légitime à masquer partiellement.

## 5. Stratégie de distribution du Core (choix du 29 septembre 2026)

**Option retenue : dépôts séparés + copie explicite + outil de détection de
divergence (`tests/check-core-drift.sh`)** — PAS un package npm partagé, PAS
un monorepo.

Raisons :
- **Package npm (registre + build)** : nécessiterait un pipeline de build
  qu'on ne peut pas exploiter/vérifier dans cet environnement de
  développement (pas de Node.js/npm disponible localement) — prématuré tant
  qu'on n'a que 2 tenants réels.
- **Monorepo** : impliquerait de restructurer le lien dépôt↔site Netlify
  déjà en production pour Salle 906 — risque et effort disproportionnés pour
  le bénéfice actuel, alors qu'on est explicitement "en phase de
  construction".
- **Fonctions centrales hébergées** : ajouterait une latence
  cross-origin, un nouveau point de défaillance partagé par tous les
  tenants, et compliquerait l'isolation des credentials par site — pas
  justifié tant que le volume de trafic ne l'exige pas.
- **Choisi** : chaque tenant garde son dépôt/site Netlify indépendant (donc
  aucun risque de casser un déploiement existant), mais les fichiers Core
  (§1) sont désormais clairement identifiés comme tels, et
  `tests/check-core-drift.sh <autre-dépôt>` permet de vérifier en une
  commande qu'aucune divergence silencieuse ne s'est introduite avant
  d'appliquer un correctif à un seul tenant. C'est délibérément le niveau
  d'outillage le plus simple qui résout le problème réel constaté (des
  copies qui divergent sans qu'on s'en aperçoive) — à réévaluer (vers un
  vrai package, voire un monorepo) uniquement quand le nombre de tenants ou
  la fréquence des correctifs Core le justifiera.

## 6. Tests de non-régression (`tests/`)

- **`tests/core-regression.sh`** : suite bash+curl (aucun framework Node
  disponible dans cet environnement) — tenant valide/inconnu, disponibilité,
  conflits (confirmé/chevauchant/HOLD actif/HOLD expiré), isolation
  inter-tenant, pricing, paiement (jamais réel). Variables d'environnement
  documentées en tête de fichier. Nettoie systématiquement ses données
  temporaires.
- **`tests/check-core-drift.sh <autre-dépôt>`** : compare les fichiers Core
  (§1) entre ce dépôt et un autre dépôt tenant local — signale toute
  différence pour revue humaine (voir §5).

## 7. Informations nécessaires pour ajouter une nouvelle salle

Avant de commencer, rassembler (jamais inventer un champ manquant — le laisser
`null` + une entrée dans `unknownOrUnconfirmed`) :

- Nom légal, adresse complète, téléphone, courriel, capacité réelle.
- Domaine prévu (même provisoire — mais le marquer comme tel).
- Fuseau horaire IANA (`America/Toronto` pour tout le Québec).
- La ou les salles/ressources : nom, capacité, et LA FORME RÉELLE de la
  grille tarifaire — ne jamais forcer une grille réelle dans un
  `pricingType` existant si la formule ne correspond pas exactement (voir §3).
- Services additionnels et leur prix réel (ou "sur demande" si aucun prix
  n'est communiqué — ne jamais en inventer un).
- Politique de dépôt/acompte, politique d'annulation, politique alcool —
  si absente, `depositPercentage:null` et geler l'étape de paiement (§9).
- Identifiants de paiement (PayPal ou autre) propres à CE tenant — jamais
  réutiliser ceux d'un autre tenant, même temporairement.

## 8. Étapes d'intégration d'un nouveau tenant ("Salle ABC")

**Réponse à "faut-il modifier KREOVYA Core ?" → NON**, sauf si la grille
tarifaire du nouveau tenant ne correspond à aucun `pricingType` existant
(auquel cas : un ajout dans `pricingEngine.js` uniquement, jamais une
réécriture). Toutes les étapes ci-dessous sont de la CONFIGURATION :

1. Copier les fichiers Core (§1) dans le nouveau dépôt, sans aucune
   modification sauf les commentaires d'exemple (`tenantId=...`).
2. Écrire `kreovya/config/tenants.js` avec une seule clé (le nouveau tenant),
   en suivant exactement la forme documentée dans le fichier lui-même.
3. Écrire `verify-payment.js` propre au tenant, en dérivant le montant via
   `pricingEngine.calculatePrice()` (voir le fichier de Salle Le Potier ou
   Salle 906 comme référence) — `paymentConfigured()` vérifie que les
   variables d'environnement PayPal DE CE SITE existent avant tout appel
   réel — jamais de repli vers un autre tenant.
4. Créer `netlify.toml` (copie strictement identique).
5. Ajouter `<script src="/kreovya-widget.js" data-tenant="XXX" defer></script>`
   sur chaque page HTML du site, avec le VRAI `tenantId` du nouveau tenant.
6. Créer une page `/reservation.html` (prefill + paiement) — adapter les
   champs affichés à la réalité du tenant.
7. Exécuter le SQL d'ajout de ressource (§10) dans Supabase.
8. Configurer les variables d'environnement Netlify (§9) du NOUVEAU site.
9. Lancer `tests/core-regression.sh` (avec les bonnes variables
   d'environnement) contre ce nouveau site avant toute mise en Production.
10. Lancer `tests/check-core-drift.sh` contre un tenant existant pour
    confirmer que les fichiers Core copiés sont bien restés identiques.
11. Déployer, tester (§11), puis seulement activer le paiement réel (§9).

## 9. Variables d'environnement nécessaires (par site Netlify)

| Variable | Obligatoire | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Oui | Peut être partagée entre tenants (même compte Anthropic) ou dédiée. |
| `SUPABASE_URL` | Oui | Peut être le MÊME projet Supabase que les autres tenants (isolation par `tenant_id`, déjà vérifiée). |
| `SUPABASE_SECRET_KEY` | Oui | Idem — jamais exposée au navigateur. |
| `PAYPAL_CLIENT_ID` | Non (tant que le paiement n'est pas activé) | Valeur PUBLIQUE — jamais copiée d'un autre tenant. |
| `PAYPAL_CLIENT_SECRET` | Non (tant que le paiement n'est pas activé) | SECRÈTE — jamais copiée d'un autre tenant, jamais committée. |
| `PAYPAL_ENV` | Non | `"sandbox"` ou `"live"` exactement — jamais de défaut implicite (voir `paymentConfigured()`). |
| `SITE_NAME` | Automatique | Fournie nativement par Netlify — aucune action requise. |

## 10. Configuration Supabase nécessaire

**Aucune nouvelle table.** Le schéma existant (`bookings`, `reservation_requests`,
`prefill_tokens`, `resources`, et les RPC `create_hold` /
`begin_prefill_payment` / `confirm_booking_from_prefill_token`) est déjà
multi-tenant via la colonne `tenant_id`, vérifié et utilisé par Salle 906 et
Salle Le Potier.

**Une seule action** : insérer une ligne dans `resources` pour le nouveau
tenant (voir `SUPABASE-SETUP.sql` à la racine de ce dépôt). Rien d'autre.

## 11. Configuration paiement nécessaire

1. Obtenir un compte marchand PayPal propre au NOUVEAU tenant (jamais un
   sous-compte ou une redirection vers le compte d'un autre tenant).
2. Confirmer la politique de dépôt/acompte avec le propriétaire AVANT
   d'activer le paiement — ne jamais supposer un pourcentage par défaut.
3. Renseigner `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_ENV`
   dans les variables d'environnement du site Netlify DE CE TENANT.
4. Tester d'abord en `PAYPAL_ENV=sandbox` avant tout passage en `live`.
5. Tant que ces variables sont absentes, `verify-payment.js` refuse tout
   appel PayPal réel (503, message clair) — le reste du parcours
   (disponibilité, lead, HOLD, préremplissage) reste testable normalement.

## 12. Checklist avant mise en Production (nouveau tenant)

- [ ] `kreovya/config/tenants.js` : toutes les infos vérifiées contre une
      source réelle, rien d'inventé, `unknownOrUnconfirmed` à jour.
- [ ] Ligne `resources` insérée dans Supabase pour ce tenant (§10).
- [ ] `ANTHROPIC_API_KEY` / `SUPABASE_URL` / `SUPABASE_SECRET_KEY` configurées
      sur le site Netlify de CE tenant.
- [ ] Domaine confirmé, `business.website` mis à jour dans `tenants.js`
      (CORS + lien de réservation en dépendent).
- [ ] `tests/core-regression.sh` exécuté contre ce site — tout au vert.
- [ ] `tests/check-core-drift.sh` exécuté contre un tenant existant — tout
      écart expliqué et voulu.
- [ ] Si le paiement doit être activé : identifiants PayPal propres obtenus,
      politique de dépôt confirmée, testé d'abord en sandbox.
- [ ] Test desktop + mobile (navigation, HOLD, KREOVYA, réservation).

## Notes — site public (non traité dans ce chantier)

Le site public (HTML/CSS) de chaque tenant reste entièrement écrit à la main
— aucun système de template/génération commun. C'est aujourd'hui le plus
gros volume de travail manuel par nouveau client, plus important que le
moteur KREOVYA lui-même. Prévu comme chantier séparé ("Salle 906 = template
maître" + extraction contenu/photos/branding en configuration) — non traité
ici pour ne pas augmenter le risque de ce chantier.
