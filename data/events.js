/**
 * SALLE LE POTIER — Types d'événements.
 * Utilisé sur l'accueil, la page Événements et l'étape 1 du configurateur.
 * `featured` = affiché dans le bloc "Une salle, mille possibilités" de l'accueil.
 */
const EVENT_TYPES = [
  { id:'mariage', label:'Mariage', featured:true },
  { id:'anniversaire', label:'Anniversaire', featured:true },
  { id:'baby-shower', label:'Baby shower', featured:false },
  { id:'conference', label:'Conférence', featured:true },
  { id:'gala-banquet', label:'Gala / banquet', featured:true },
  { id:'corporatif', label:'Événement corporatif', featured:false },
  { id:'celebration-familiale', label:'Célébration familiale', featured:false },
  { id:'communautaire', label:'Événement communautaire', featured:false },
  { id:'religieux', label:'Événement religieux', featured:false },
  { id:'autre', label:'Autre', featured:false },
];

if (typeof module !== 'undefined') module.exports = { EVENT_TYPES };
