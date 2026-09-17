/**
 * SALLE LE POTIER — Emplacements photo.
 * Aucune vraie photo de la salle n'a été fournie pour le moment : chaque
 * entrée a `src:null`, ce qui affiche un placeholder ÉLÉGANT et CLAIREMENT
 * IDENTIFIÉ (jamais une photo générique présentée comme réelle — voir brief).
 *
 * POUR AJOUTER UNE VRAIE PHOTO :
 * 1. Dépose le fichier dans /assets/images/<dossier>/ (ex. salle-1.jpg dans /assets/images/salle/)
 * 2. Remplace `src:null` par le chemin, ex. src:'/assets/images/salle/salle-1.jpg'
 * Rien d'autre à modifier — la galerie, le Hero et les sections concernées
 * s'actualisent automatiquement.
 */
const GALLERY = [
  { id:'salle-1', category:'Capacité', label:'La salle', src:null, folder:'salle' },
  { id:'salle-2', category:'Capacité', label:'La salle', src:null, folder:'salle' },
  { id:'mariage-1', category:'Mariages', label:'Mariage', src:null, folder:'events' },
  { id:'banquet-1', category:'Banquets', label:'Banquet', src:null, folder:'events' },
  { id:'conference-1', category:'Conférences', label:'Conférence', src:null, folder:'events' },
  { id:'terrasse-1', category:'Terrasse', label:'Terrasse', src:null, folder:'salle' },
  { id:'salle-3', category:'Capacité', label:'La salle', src:null, folder:'salle' },
  { id:'commodites-1', category:'Commodités', label:'Commodités', src:null, folder:'salle' },
];

// Image utilisée en fond du Hero de l'accueil (placeholder tant qu'aucune photo n'est fournie).
const HERO_IMAGE = { src:null, folder:'salle', label:'Salle Le Potier' };

if (typeof module !== 'undefined') module.exports = { GALLERY, HERO_IMAGE };
