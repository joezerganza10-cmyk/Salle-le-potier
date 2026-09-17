/**
 * SALLE LE POTIER — Informations générales du site.
 * Source unique de vérité pour les coordonnées, utilisées partout
 * (header, footer, contact, JSON-LD, boutons d'appel/courriel).
 */
const SITE = {
  name: 'Salle Le Potier',
  legalName: 'Salle Le Potier',
  tagline: 'Créez. Célébrez. Rassemblez.',
  addressLine1: '2136 A rue Pigeon',
  addressLine2: 'LaSalle, Québec',
  phoneDisplay: '438-935-9473',
  phoneHref: 'tel:+14389359473',
  whatsappHref: null, // à activer plus tard si souhaité (même numéro, non confirmé pour l'instant)
  email: 'dons.potier@gmail.com',
  capacityLabel: 'Plus de 350 personnes',
  capacityShort: '350+',
  domain: 'salle-le-potier.ca', // domaine PROVISOIRE, non confirmé — à valider avant mise en ligne
};

if (typeof module !== 'undefined') module.exports = { SITE };
