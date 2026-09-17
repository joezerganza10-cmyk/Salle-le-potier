/**
 * SALLE LE POTIER — Commodités.
 * Formulations volontairement prudentes : "à quelques minutes" (fourni),
 * jamais un nombre de minutes précis non vérifié.
 */
const AMENITIES = [
  { title:'Stationnement', sub:null, icon:'parking' },
  { title:'Terrasse disponible', sub:null, icon:'terrace' },
  { title:'Deux salles de bain distinctes', sub:'Homme / Femme', icon:'restroom' },
  { title:'Réfrigérateur', sub:null, icon:'fridge' },
  { title:'Micro-ondes', sub:null, icon:'microwave' },
  { title:'Comptoir / bar', sub:null, icon:'bar' },
  { title:'Accès à un parc équipé pour les enfants', sub:null, icon:'park' },
  { title:'À quelques minutes du parc Angrignon', sub:null, icon:'tree' },
  { title:'À quelques minutes du métro Angrignon', sub:null, icon:'metro' },
];

if (typeof module !== 'undefined') module.exports = { AMENITIES };
