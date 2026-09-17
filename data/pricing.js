/**
 * SALLE LE POTIER — Grille tarifaire, SOURCE UNIQUE DE VÉRITÉ.
 * Toutes les pages (Tarifs, Services, Configurateur) lisent ces valeurs.
 * Pour changer un prix partout sur le site : modifier UNE seule valeur ici.
 *
 * Aucun prix ici n'inclut ou n'exclut les taxes — cette information n'a
 * pas été fournie, donc rien n'est affiché à ce sujet (voir brief).
 */
const PRICING = {
  packages: {
    fourHours: { label:'4 heures', hours:4, price:800 },
    eightHours: { label:'8 heures', hours:8, price:1200 },
  },
  extraHour: 200,

  // Ce qui est inclus dans les deux formules (identique pour les deux)
  packageIncludes: [
    'Salle d\'une capacité de plus de 350 personnes',
    'Tables et chaises',
    'Système de son',
    '3 micros sans fil',
    'Amplificateur',
    'Internet haute vitesse Bell',
    'Climatisation',
  ],

  technology: {
    livestream: { label:'Retransmission en direct', price:200, unit:'forfait' },
    djConsole: { label:'Console DJ', price:200, unit:'forfait' },
    extraWirelessMic: { label:'Micro sans fil supplémentaire', price:20, unit:'unité' },
    soundEngineer: { label:'Ingénieur de son', price:50, unit:'heure' },
  },

  instruments: {
    pianoAndDrums: { label:'Piano + batterie électrique', price:350, unit:'forfait' },
    individual: { label:'Instrument individuel', price:200, unit:'forfait', needsDetail:true },
  },

  decoration: {
    vipChair1: { label:'Chaise VIP — 1 place', indoor:100, outdoor:150, unit:'unité' },
    vipChair2: { label:'Chaise VIP — 2 places', indoor:200, outdoor:300, unit:'unité' },
    honorTable: { label:'Table d\'honneur', indoor:75, outdoor:100, unit:'unité' },
    heatingPlate: { label:'Plaque chauffante', price:10, unit:'unité' },
    flowers: { label:'Fleurs', price:20, unit:'unité' },
    centerpiece: { label:'Centre de table', price:5, unit:'unité' },
    chargerPlate: { label:'Sous-plat argenté ou doré', price:2, unit:'unité' },
    chairCover: { label:'Housse de chaise', price:2, unit:'unité' },
    tablecloth: { label:'Nappe noire ou blanche', price:5, unit:'unité' },
  },

  // Services professionnels : seul le maître de cérémonie a un prix fourni.
  // Les autres sont explicitement "sur demande" — ne jamais inventer de montant.
  professionalServices: {
    planning: { label:'Planification d\'événement', price:null, note:'Sur mesure' },
    mc: { label:'Maître de cérémonie', price:300, unit:'forfait' },
    photographer: { label:'Photographe', price:null, note:'Prix sur demande' },
    videographer: { label:'Caméraman', price:null, note:'Prix sur demande' },
    caterer: { label:'Traiteur', price:null, note:'Prix sur demande' },
    cake: { label:'Gâteau', price:null, note:'Prix sur demande' },
    other: { label:'Autres services', price:null, note:'Sur demande' },
  },
};

function money(n){
  return Number(n).toLocaleString('fr-CA', { style:'currency', currency:'CAD', minimumFractionDigits:0, maximumFractionDigits:0 });
}

if (typeof module !== 'undefined') module.exports = { PRICING, money };
