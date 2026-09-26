/**
 * KREOVYA AI — Configuration multi-tenant (copie de moteur — Salle Le Potier)
 * ============================================================
 * Ce fichier suit EXACTEMENT la même forme que kreovya/config/tenants.js du
 * dépôt Salle 906 Galt Est (salle906-site-deploy), qui documentait déjà
 * explicitement ce prochain tenant en exemple. Aucune donnée métier Salle 906
 * n'a été copiée ici — uniquement la structure du moteur.
 *
 * Toutes les informations ci-dessous proviennent exclusivement du contenu
 * déjà présent dans le projet Salle Le Potier (data/site-data.js,
 * data/pricing.js, data/amenities.js, data/faq.js, data/events.js). Rien n'a
 * été inventé — voir `public.unknownOrUnconfirmed` pour ce qui est
 * volontairement laissé à confirmer par le propriétaire.
 *
 * Ce dépôt (Salle-le-potier) est un projet Netlify/Supabase totalement
 * distinct de salle906-site-deploy : ce fichier ne contient et ne lira
 * jamais la configuration d'un autre tenant que "salle-le-potier".
 */

const TENANTS = {
  'salle-le-potier': {
    tenantId: 'salle-le-potier',
    active: true,

    public: {
      business: {
        name: 'Salle Le Potier',
        address: {
          street: '2136 A rue Pigeon',
          city: 'LaSalle',
          region: 'QC',
          country: 'Canada',
          full: '2136 A rue Pigeon, LaSalle, QC',
        },
        phone: '438-935-9473',
        phoneHref: '+14389359473',
        email: 'dons.potier@gmail.com',
        // Domaine PROVISOIRE (voir data/site-data.js dans ce même projet,
        // qui le marque déjà explicitement comme non confirmé). Sert de
        // repli pour le CORS/la génération du lien de réservation ; sur un
        // Deploy Preview, resolveAllowedWebsite() (prepareReservationLink.js)
        // utilise de toute façon l'origine réelle de la requête via SITE_NAME.
        website: 'https://salle-le-potier.ca',
        areaServed: 'LaSalle, Montréal, Québec',
        description: 'Salle Le Potier est un espace événementiel polyvalent à LaSalle pouvant accueillir plus de 350 personnes : mariages, anniversaires, conférences, galas et événements corporatifs.',
      },

      // Une seule salle chez ce tenant (contrairement à Salle 906) — le
      // tableau reste à un élément, mais la forme est identique pour que
      // checkAvailability.js/createHold.js n'aient besoin d'aucune adaptation.
      rooms: [
        {
          id: 'principale',
          name: 'Salle Le Potier',
          capacity: 350,
          capacityNote: 'Plus de 350 personnes (capacité minimale confirmée ; aucun plafond exact communiqué).',
          tagline: 'Un espace polyvalent pour vos plus grands rassemblements à LaSalle.',
          description: "Salle événementielle unique pouvant accueillir plus de 350 personnes, pour mariages, anniversaires, conférences, galas et événements corporatifs.",
          // Type propre à ce tenant, géré par describeRoomPricing() dans LA
          // COPIE LOCALE de kreovya-agent.js (jamais dans le fichier partagé
          // avec Salle 906) : deux forfaits fixes, pas une formule continue.
          pricingType: 'packageTiers',
          packages: [
            { hours: 4, price: 800 },
            { hours: 8, price: 1200 },
          ],
          extraHourPrice: 200,
          amenities: [
            'Tables et chaises incluses',
            'Système de son, amplificateur et 3 micros sans fil inclus',
            'Internet haute vitesse Bell',
            'Climatisation',
            'Stationnement',
            'Terrasse disponible',
            'Deux salles de bain distinctes (homme / femme)',
            'Réfrigérateur et micro-ondes',
            'Comptoir / bar',
            'Accès à un parc équipé pour les enfants',
            'À quelques minutes du parc Angrignon et du métro Angrignon',
          ],
        },
      ],

      // Services additionnels réellement tarifés dans data/pricing.js
      // (technology + instruments). Les services "sur demande" (traiteur,
      // photographe, etc.) sont listés séparément dans reservation.* /
      // importantRules, jamais avec un prix inventé.
      services: [
        { id: 'retransmission', name: 'Retransmission en direct', description: 'Forfait retransmission en direct : 200 $.' },
        { id: 'console-dj', name: 'Console DJ', description: 'Forfait console DJ : 200 $.' },
        { id: 'piano-batterie', name: 'Piano + batterie électrique', description: 'Forfait piano + batterie électrique : 350 $.' },
        { id: 'instrument-individuel', name: 'Instrument individuel', description: "Forfait instrument individuel : 200 $ (détail de l'instrument à préciser)." },
        { id: 'micro-supplementaire', name: 'Micro sans fil supplémentaire', description: '20 $ par micro sans fil supplémentaire (au-delà des 3 inclus).' },
        { id: 'ingenieur-son', name: 'Ingénieur de son', description: '50 $ par heure.' },
        { id: 'maitre-ceremonie', name: 'Maître de cérémonie', description: 'Forfait maître de cérémonie : 300 $.' },
        { id: 'planification', name: "Planification d'événement", description: 'Sur mesure — prix communiqué directement par l\'équipe.' },
        { id: 'photographe', name: 'Photographe', description: 'Service disponible sur demande — prix communiqué directement par l\'équipe.' },
        { id: 'camera', name: 'Caméraman', description: 'Service disponible sur demande — prix communiqué directement par l\'équipe.' },
        { id: 'traiteur', name: 'Traiteur', description: 'Service disponible sur demande — prix communiqué directement par l\'équipe.' },
        { id: 'gateau', name: 'Gâteau', description: 'Service disponible sur demande — prix communiqué directement par l\'équipe.' },
      ],

      durations: {
        principale: '4 heures (800 $) ou 8 heures (1 200 $) ; toute heure supplémentaire au-delà du forfait choisi est facturée 200 $/heure, sans maximum communiqué.',
        note: "Aucune plage horaire fixe (heure de début/fin) n'est publiée — à confirmer avec l'équipe selon la disponibilité.",
      },

      parking: 'Stationnement disponible sur place.',

      // Non documenté nulle part dans le projet — jamais inventé ici.
      alcohol: null,
      accessHours: null,

      importantRules: [
        "Le configurateur en ligne (outil d'estimation) fournit un montant indicatif ; le montant final est confirmé directement par l'équipe de Salle Le Potier.",
        'Les taxes ne sont pas incluses ni précisées dans les tarifs affichés — à confirmer avec l\'équipe.',
        'Toute heure entamée au-delà du forfait choisi (4 h ou 8 h) est facturée 200 $/heure.',
      ],

      reservation: {
        // AUCUN pourcentage de dépôt n'est documenté nulle part dans ce
        // projet (contrairement à Salle 906, où le dépôt de 50 % est publié
        // explicitement) — jamais inventé. Tant que ceci n'est pas confirmé
        // par le propriétaire, le parcours de paiement Le Potier reste
        // volontairement désactivé (voir verify-payment.js / DISABLED_REASON).
        depositPercentage: null,
        paymentProvider: null, // à activer une fois les identifiants PayPal propres à Salle Le Potier fournis
        confirmationFlow: "KREOVYA vérifie la disponibilité réelle → recueille les coordonnées → bloque temporairement le créneau (HOLD, 15 minutes) → propose de finaliser sur /reservation. Le paiement en ligne est préparé mais reste désactivé tant que les identifiants de paiement et la politique de dépôt propres à Salle Le Potier ne sont pas confirmés.",
        leadFormFlow: null,
        onlineBookingUrl: null, // renseigné une fois le site déployé sur son domaine définitif
      },

      usefulLinks: {
        home: 'https://salle-le-potier.ca/',
        rooms: 'https://salle-le-potier.ca/la-salle',
        services: 'https://salle-le-potier.ca/services',
        pricing: 'https://salle-le-potier.ca/tarifs',
        gallery: 'https://salle-le-potier.ca/galerie',
        contact: 'https://salle-le-potier.ca/contact',
        estimator: 'https://salle-le-potier.ca/configurateur',
      },

      // Informations demandées mais introuvables avec certitude dans le
      // projet actuel — volontairement non inventées.
      unknownOrUnconfirmed: [
        'Domaine définitif (salle-le-potier.ca est marqué "provisoire, non confirmé" dans data/site-data.js).',
        "Politique de dépôt/acompte pour confirmer une réservation (aucune mention dans le projet).",
        "Politique d'annulation.",
        "Politique sur l'alcool.",
        'Taxes (incluses ou non dans les tarifs affichés).',
        "Heures d'accès fixes (horaires de début/fin) — non publiées, à confirmer au cas par cas.",
        'Identifiants de paiement (PayPal ou autre) propres à Salle Le Potier — aucun identifiant existant, paiement réel désactivé en attendant.',
        'Numéro/plaque WhatsApp (site-data.js le laisse explicitement à activer plus tard si souhaité).',
      ],
    },

    // Réservé à la copie locale de kreovya-agent.js. kreovya-config.js ne lit
    // et ne retourne JAMAIS cette section — jamais exposée au navigateur.
    internal: {
      // Fuseau horaire IANA de l'établissement (LaSalle, QC = America/Toronto,
      // identique à Salle 906 — même fuseau, donnée générique, pas une
      // information propre à Salle 906).
      timezone: 'America/Toronto',
    },
  },
};

function getTenant(tenantId) {
  return TENANTS[tenantId] || null;
}

function isKnownTenant(tenantId) {
  const t = getTenant(tenantId);
  return !!t && t.active === true;
}

/** Retourne uniquement la portion sûre à exposer au navigateur, ou null si le tenant est inconnu/inactif. */
function getPublicConfig(tenantId) {
  const t = getTenant(tenantId);
  if (!t || t.active !== true || !t.public) return null;
  return { tenantId: t.tenantId, ...t.public };
}

function listTenantIds() {
  return Object.keys(TENANTS).filter((id) => TENANTS[id].active === true);
}

module.exports = { TENANTS, getTenant, isKnownTenant, getPublicConfig, listTenantIds };
