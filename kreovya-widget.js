/**
 * KREOVYA AI — Widget conversationnel (V1)
 * ============================================================
 * Installation sur un site client :
 *
 *   <script src="/kreovya-widget.js" data-tenant="salle-le-potier" defer></script>
 *
 * Le widget est 100 % JavaScript vanille, autonome, sans dépendance externe
 * et sans framework CSS. Il ne connaît aucune information d'entreprise codée
 * en dur : tout vient de `data-tenant` + un appel à kreovya-config.js, qui
 * renvoie uniquement la configuration PUBLIQUE du tenant.
 *
 * Le navigateur ne communique qu'avec deux fonctions Netlify :
 *   - GET  /.netlify/functions/kreovya-config?tenantId=...
 *   - POST /.netlify/functions/kreovya-agent
 * Il ne voit jamais ANTHROPIC_API_KEY, aucun secret, aucune configuration
 * `internal`, ni le prompt système (construit côté serveur uniquement).
 *
 * Isolation : tout le rendu visuel vit dans un Shadow DOM (mode "open"),
 * pour qu'aucun CSS du site hôte ne puisse casser le widget, et que le CSS
 * du widget n'affecte jamais le site hôte.
 *
 * Persistance : aucune. La conversation vit uniquement en mémoire de page
 * (variable JS) — un rechargement recommence une nouvelle conversation.
 * Pas de localStorage, pas de cookies, pas de base de données.
 *
 * Rendu du texte : uniquement du texte brut (textContent / DOM sécurisé).
 * Aucun HTML ni Markdown venant de Claude, du visiteur, ou de la
 * configuration du tenant n'est jamais injecté via innerHTML. Les seuls
 * usages d'innerHTML dans ce fichier concernent des icônes SVG statiques,
 * écrites en dur par KREOVYA — jamais de contenu dynamique.
 * ============================================================
 */
(function () {
  'use strict';

  /* ============================================================
     0. Récupération de la configuration d'installation (data-tenant)
     ============================================================ */
  var currentScript = document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll('script[src*="kreovya-widget.js"]');
      return scripts.length ? scripts[scripts.length - 1] : null;
    })();

  var TENANT_ID = currentScript && currentScript.getAttribute('data-tenant');

  if (!TENANT_ID) {
    console.warn('[KREOVYA] Attribut data-tenant manquant sur la balise <script> — widget non initialisé.');
    return;
  }

  // Empêche une double initialisation si le script est inclus deux fois.
  window.__kreovyaWidgets = window.__kreovyaWidgets || {};
  if (window.__kreovyaWidgets[TENANT_ID]) {
    return;
  }
  window.__kreovyaWidgets[TENANT_ID] = true;

  /* ============================================================
     1. Constantes
     ============================================================ */
  var CONFIG_URL = '/.netlify/functions/kreovya-config?tenantId=' + encodeURIComponent(TENANT_ID);
  var AGENT_URL = '/.netlify/functions/kreovya-agent';
  var CONFIG_TIMEOUT_MS = 8000;
  var AGENT_TIMEOUT_MS = 30000; // légèrement au-dessus du timeout serveur (25s)
  var MAX_MESSAGE_LENGTH = 2000; // doit rester <= la limite serveur de kreovya-agent.js

  // Clé sessionStorage namespacée par tenant : ne survit qu'à l'onglet en
  // cours (fermé à la fermeture de l'onglet, jamais partagé entre onglets),
  // cohérent avec la politique "aucune persistance de conversation au-delà
  // de la page" — seul cet identifiant opaque est conservé, jamais les
  // messages échangés.
  var LEAD_ID_STORAGE_KEY = 'kreovya_leadId_' + TENANT_ID;

  // Clé sessionStorage DISTINCTE et INDÉPENDANTE de LEAD_ID_STORAGE_KEY —
  // purement pour l'UI (mémoriser que la mini-bulle d'accueil a déjà été
  // montrée durant cette session d'onglet). Ne contient aucun identifiant
  // métier, jamais lue ni écrite par la logique de session KREOVYA.
  var GREETING_SHOWN_STORAGE_KEY = 'kreovya_greeting_shown_' + TENANT_ID;
  var GREETING_DELAY_MS = 2500;

  // Valeurs par défaut de marque KREOVYA. Point d'extension prêt pour plus
  // tard : si un tenant définit un jour `config.branding` (couleur
  // principale, logo, nom de l'assistant, message d'accueil, position), ces
  // valeurs prendront le dessus automatiquement — tenants.js ne définit
  // volontairement aucun de ces champs pour l'instant.
  //
  // Palette IDENTIQUE aux tokens réels de Salle Le Potier (voir :root dans
  // styles.css à la racine de ce projet) — jamais une teinte réutilisée telle
  // quelle d'un autre tenant : le widget doit se fondre visuellement dans
  // CE site précis, jamais donner l'impression d'un module rapporté d'ailleurs.
  var DEFAULT_ACCENT = '#C6A66A';        // --champagne (styles.css) — accent uniquement
  var DEFAULT_INK = '#111111';           // --noir (styles.css)
  var DEFAULT_CARD = '#1a1a1a';          // --noir-doux (styles.css), bulles visiteur
  var DEFAULT_IVORY = '#F7F5F1';         // --blanc-casse (styles.css), bulles assistant
  var DEFAULT_FG = '#F7F5F1';            // texte clair sur fond sombre (même ton que l'ivoire)
  var DEFAULT_ASSISTANT_NAME = 'KREOVYA';
  var DEFAULT_POSITION = 'right';

  // Icônes SVG statiques (écrites en dur, jamais de contenu dynamique) —
  // même famille visuelle : trait fin (1.7), extrémités arrondies, 16x16.
  var CHIP_ICON_CALENDAR_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3v3.2M16 3v3.2"/><path d="M9 14.2l2 2 4-4.4"/></svg>';
  var CHIP_ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12.5" r="8.2"/><path d="M12 8v4.7l3.2 1.9"/><path d="M9.5 3.3h5"/></svg>';
  var CHIP_ICON_DOOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 20.5V4.8a1 1 0 0 1 .77-.97l7-1.6A1 1 0 0 1 15 3.2v17.3"/><path d="M4.5 20.5h13"/><path d="M11.8 12.3h.01"/></svg>';
  var CHIP_ICON_QUESTION = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="8.2"/><path d="M9.6 9.4a2.4 2.4 0 1 1 3.4 2.2c-.9.5-1.1 1-1.1 1.9"/><path d="M12 16.6h.01"/></svg>';

  var SUGGESTIONS = [
    { icon: CHIP_ICON_CALENDAR_CHECK, label: 'Réserver une salle', text: 'Je souhaite réserver une salle.', primary: true },
    { icon: CHIP_ICON_CLOCK, label: 'Voir les disponibilités', text: 'Quelles sont vos disponibilités ?' },
    { icon: CHIP_ICON_DOOR, label: 'Découvrir les salles', text: 'Pouvez-vous me présenter vos salles ?' },
    { icon: CHIP_ICON_QUESTION, label: 'Poser une question', text: 'J\'ai une question.' },
  ];

  /* ============================================================
     2. Icônes SVG statiques (écrites en dur par KREOVYA — jamais de
        contenu dynamique injecté via ces gabarits)
     ============================================================ */
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';

  /* ============================================================
     3. Feuille de style (Shadow DOM — isolée du site hôte)
     ============================================================ */
  var SIDE = (DEFAULT_POSITION === 'left' ? 'left' : 'right');

  var CSS = ''
    + ':host{all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483000;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '*,*::before,*::after{box-sizing:border-box;}'
    + '.kv-root{position:fixed;inset:0;pointer-events:none;}'

    /* ---------- Bouton flottant : pilule premium (monogramme + libellé) ---------- */
    + '.kv-bubble{position:fixed;bottom:20px;' + SIDE + ':20px;'
    + 'display:flex;align-items:center;gap:9px;height:50px;padding:0 16px 0 5px;border-radius:999px;'
    + 'background:' + DEFAULT_INK + ';border:1px solid rgba(201,164,99,.45);color:' + DEFAULT_FG + ';'
    + 'cursor:pointer;pointer-events:auto;box-shadow:0 6px 18px rgba(0,0,0,.2);'
    + 'transition:transform .15s ease,box-shadow .15s ease;'
    + 'animation:kv-bubble-in .5s cubic-bezier(.16,1,.3,1) both;}'
    + '.kv-bubble:hover{transform:translateY(-2px);box-shadow:0 9px 22px rgba(0,0,0,.24);}'
    + '.kv-bubble:active{transform:translateY(0) scale(.98);}'
    + '.kv-bubble:focus-visible{outline:2px solid var(--kv-accent,' + DEFAULT_ACCENT + ');outline-offset:2px;}'
    + '.kv-bubble.kv-hidden{display:none;}'
    + '.kv-bubble-mark{flex:none;width:38px;height:38px;border-radius:50%;background:var(--kv-accent,' + DEFAULT_ACCENT + ');'
    + 'color:' + DEFAULT_INK + ';display:flex;align-items:center;justify-content:center;'
    + 'font-family:Georgia,"Playfair Display",serif;font-size:16.5px;font-weight:700;}'
    + '.kv-bubble-label{font-size:13px;font-weight:600;letter-spacing:.2px;white-space:nowrap;}'
    + '.kv-bubble::after{content:"";position:absolute;inset:-6px;border-radius:999px;'
    + 'border:1px solid rgba(201,164,99,.55);opacity:0;pointer-events:none;'
    + 'animation:kv-halo 1.8s ease-out 2;}'
    + '@keyframes kv-bubble-in{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}'
    + '@keyframes kv-halo{0%{opacity:.6;transform:scale(.92);}100%{opacity:0;transform:scale(1.16);}}'

    /* ---------- Mini-bulle d'accueil automatique (rapprochée du bouton, avec pointe de connexion) ---------- */
    + '.kv-teaser{position:fixed;bottom:76px;' + SIDE + ':20px;width:270px;max-width:calc(100vw - 32px);'
    + 'background:' + DEFAULT_IVORY + ';border:1px solid rgba(201,164,99,.3);border-radius:16px;'
    + 'box-shadow:0 16px 38px rgba(0,0,0,.2);pointer-events:auto;overflow:visible;'
    + 'opacity:0;transform:translateY(8px) scale(.98);'
    + 'transition:opacity .26s cubic-bezier(.16,1,.3,1),transform .26s cubic-bezier(.16,1,.3,1);}'
    + '.kv-teaser.kv-teaser-visible{opacity:1;transform:translateY(0) scale(1);}'
    + '.kv-teaser.kv-teaser-hidden{display:none;}'
    + '.kv-teaser::after{content:"";position:absolute;bottom:-6px;' + SIDE + ':28px;width:12px;height:12px;'
    + 'background:' + DEFAULT_IVORY + ';border-right:1px solid rgba(201,164,99,.3);border-bottom:1px solid rgba(201,164,99,.3);'
    + 'transform:rotate(45deg);border-radius:0 0 3px 0;}'
    + '.kv-teaser-close{position:absolute;top:7px;right:7px;width:24px;height:24px;border-radius:50%;'
    + 'border:none;background:rgba(22,20,15,.06);color:' + DEFAULT_INK + ';display:flex;align-items:center;'
    + 'justify-content:center;cursor:pointer;transition:background .15s ease;z-index:1;}'
    + '.kv-teaser-close:hover{background:rgba(22,20,15,.12);}'
    + '.kv-teaser-close svg{width:11px;height:11px;}'
    + '.kv-teaser-body{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;'
    + 'padding:18px 18px 16px;font-family:inherit;position:relative;}'
    + '.kv-teaser-greeting{margin:0 0 12px;font-size:13.5px;line-height:1.55;color:' + DEFAULT_INK + ';white-space:pre-line;}'
    + '.kv-teaser-cta{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;'
    + 'letter-spacing:.2px;color:' + DEFAULT_INK + ';padding-bottom:2px;border-bottom:1px solid rgba(201,164,99,.55);}'
    + '.kv-teaser-cta::after{content:"→";color:var(--kv-accent,' + DEFAULT_ACCENT + ');transition:transform .15s ease;}'
    + '.kv-teaser-body:hover .kv-teaser-cta{border-color:var(--kv-accent,' + DEFAULT_ACCENT + ');}'
    + '.kv-teaser-body:hover .kv-teaser-cta::after{transform:translateX(3px);}'

    /* ---------- Panneau de conversation ---------- */
    + '.kv-panel{position:fixed;bottom:96px;' + SIDE + ':20px;'
    + 'width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 140px);'
    + 'background:' + DEFAULT_IVORY + ';border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);'
    + 'display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;'
    + 'opacity:0;transform:translateY(16px) scale(.98);transition:opacity .2s cubic-bezier(.16,1,.3,1),transform .2s cubic-bezier(.16,1,.3,1);}'
    + '.kv-panel.kv-open{opacity:1;transform:translateY(0) scale(1);}'
    + '.kv-panel.kv-closed{display:none;}'
    // Panneau compact tant qu'aucune vraie conversation n'a commencé (avant le
    // premier message) : hauteur qui épouse le contenu (en-tête + accueil +
    // actions rapides + composer) au lieu d'un grand vide fixe. Ne touche à
    // AUCUNE logique de messages — purement une classe CSS présentationnelle,
    // retirée par removeSuggestions() dès qu'une vraie conversation démarre.
    // Hauteur FIXE (pas "auto") : dans un conteneur flex-column, "auto" +
    // .kv-messages en flex:1/overflow:auto s'effondre (min-height:auto devient
    // 0 dès qu'overflow n'est pas visible), ce qui repoussait le composer par
    //-dessus le contenu (4e action masquée). Une valeur fixe laisse flex:1
    // calculer correctement l'espace réel restant pour .kv-messages — le
    // composer ne peut alors jamais recouvrir le contenu, par construction du
    // layout flex (il reste après .kv-messages dans le flux normal).
    + '.kv-panel.kv-panel-compact{height:460px;max-height:calc(100vh - 140px);}'
    + '.kv-header{background:' + DEFAULT_INK + ';color:' + DEFAULT_FG + ';padding:17px 16px 17px 20px;display:flex;'
    + 'align-items:center;gap:13px;flex:none;border-bottom:1px solid rgba(201,164,99,.25);}'
    + '.kv-header-avatar{width:38px;height:38px;border-radius:50%;background:var(--kv-accent,' + DEFAULT_ACCENT + ');'
    + 'display:flex;align-items:center;justify-content:center;flex:none;font-weight:700;font-size:15.5px;'
    + 'font-family:Georgia,"Playfair Display",serif;color:' + DEFAULT_INK + ';overflow:hidden;}'
    + '.kv-header-avatar img{width:100%;height:100%;object-fit:cover;display:block;}'
    + '.kv-header-text{flex:1;min-width:0;}'
    + '.kv-header-title{font-size:15.5px;font-weight:700;letter-spacing:.5px;margin:0;line-height:1.25;}'
    + '.kv-header-sub{font-size:12px;color:rgba(246,242,234,.68);margin:3px 0 0;line-height:1.3;}'
    + '.kv-status{display:flex;align-items:center;gap:7px;font-size:11.5px;color:rgba(246,242,234,.72);margin-top:7px;}'
    + '.kv-status-dot{width:6px;height:6px;border-radius:50%;background:#3ecf7e;flex:none;}'
    + '.kv-status-dot.kv-status-loading{background:#8a8474;}'
    + '.kv-status-dot.kv-status-degraded{background:var(--kv-accent,' + DEFAULT_ACCENT + ');}'
    + '.kv-close{background:rgba(246,242,234,.06);border:none;color:' + DEFAULT_FG + ';width:30px;height:30px;border-radius:50%;'
    + 'display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;transition:background .15s ease;}'
    + '.kv-close:hover{background:rgba(246,242,234,.16);}'

    /* ---------- Messages ---------- */
    + '.kv-messages{flex:1;overflow-y:auto;padding:20px 18px;display:flex;flex-direction:column;gap:14px;'
    + 'background:' + DEFAULT_IVORY + ';-webkit-overflow-scrolling:touch;'
    + 'scrollbar-width:thin;scrollbar-color:rgba(201,164,99,.3) transparent;}'
    + '.kv-row{display:flex;max-width:100%;animation:kv-fade-up .32s cubic-bezier(.16,1,.3,1) both;}'
    + '.kv-row.kv-from-user{justify-content:flex-end;}'
    + '.kv-row.kv-from-assistant{justify-content:flex-start;}'
    + '@keyframes kv-fade-up{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}'
    + '.kv-bubble-msg{max-width:80%;padding:12px 16px;border-radius:16px;font-size:14.5px;line-height:1.55;'
    + 'white-space:pre-wrap;word-wrap:break-word;}'
    + '.kv-from-user .kv-bubble-msg{background:' + DEFAULT_CARD + ';color:' + DEFAULT_FG + ';'
    + 'border:1px solid rgba(201,164,99,.35);border-bottom-right-radius:4px;}'
    + '.kv-from-assistant .kv-bubble-msg{background:#fff;color:#2a2620;border:1px solid rgba(201,164,99,.16);'
    + 'border-bottom-left-radius:4px;}'
    + '.kv-bubble-msg.kv-error{background:#fdf3f2;border:1px solid #f0c9c4;color:#8c342a;}'
    + '.kv-retry{margin-top:8px;display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e3b3ac;'
    + 'color:#8c342a;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;}'
    + '.kv-retry:hover{background:#fdf3f2;}'
    + '.kv-cta-row{display:flex;justify-content:flex-start;padding:2px 0 4px;'
    + 'animation:kv-fade-up .32s cubic-bezier(.16,1,.3,1) both;}'
    + '.kv-cta{display:inline-flex;align-items:center;gap:8px;background:var(--kv-accent,' + DEFAULT_ACCENT + ');color:' + DEFAULT_INK + ';'
    + 'text-decoration:none;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:700;'
    + 'transition:transform .12s ease,box-shadow .15s ease;box-shadow:0 8px 20px rgba(201,164,99,.35);}'
    + '.kv-cta:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(201,164,99,.42);}'
    + '.kv-cta:active{transform:translateY(0);}'

    /* ---------- Indicateur "KREOVYA réfléchit…" ---------- */
    + '.kv-typing{display:flex;gap:8px;align-items:center;padding:2px 2px;}'
    + '.kv-typing-label{font-size:13px;color:#8a8474;font-style:italic;}'
    + '.kv-typing-dots{display:flex;gap:4px;align-items:center;}'
    + '.kv-typing-dots span{width:6px;height:6px;border-radius:50%;background:var(--kv-accent,' + DEFAULT_ACCENT + ');display:inline-block;'
    + 'animation:kv-bounce 1.1s infinite ease-in-out;}'
    + '.kv-typing-dots span:nth-child(2){animation-delay:.15s;}'
    + '.kv-typing-dots span:nth-child(3){animation-delay:.3s;}'
    + '@keyframes kv-bounce{0%,60%,100%{transform:translateY(0);opacity:.45;}30%{transform:translateY(-4px);opacity:1;}}'

    /* ---------- Actions rapides ---------- */
    + '.kv-suggestions{display:flex;flex-wrap:wrap;gap:8px;padding:2px 0 4px;'
    + 'animation:kv-fade-up .32s cubic-bezier(.16,1,.3,1) both;}'
    + '.kv-chip{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid rgba(201,164,99,.28);'
    + 'border-radius:999px;padding:8px 15px;font-size:13px;color:#2a2620;cursor:pointer;'
    + 'transition:border-color .15s ease,background .15s ease,transform .1s ease;text-align:left;}'
    + '.kv-chip-icon{display:flex;flex:none;color:#8a8474;}'
    + '.kv-chip:hover{border-color:var(--kv-accent,' + DEFAULT_ACCENT + ');background:#fbf6ea;}'
    + '.kv-chip:hover .kv-chip-icon{color:var(--kv-accent,' + DEFAULT_ACCENT + ');}'
    + '.kv-chip:active{transform:scale(.98);}'
    // Action principale ("Réserver une salle") : distinction très subtile —
    // liseré doré plus présent + fond ivoire/or extrêmement léger — jamais un
    // gros bouton CTA, juste un accent discret parmi des puces égales sinon.
    + '.kv-chip-primary{border-color:rgba(201,164,99,.6);background:#fdf9f0;}'
    + '.kv-chip-primary .kv-chip-icon{color:var(--kv-accent,' + DEFAULT_ACCENT + ');}'
    + '.kv-chip-primary:hover{background:#fbf3e2;}'

    /* ---------- Zone de saisie ---------- */
    + '.kv-composer{flex:none;display:flex;align-items:flex-end;gap:10px;padding:14px;background:#fff;'
    + 'border-top:1px solid rgba(201,164,99,.18);padding-bottom:calc(14px + env(safe-area-inset-bottom, 0px));}'
    + '.kv-textarea{flex:1;resize:none;border:1px solid #e6e0d2;border-radius:16px;padding:12px 16px;font-size:14.5px;'
    + 'font-family:inherit;line-height:1.45;max-height:120px;min-height:22px;color:#241f18;outline:none;background:#fdfbf7;'
    + 'transition:border-color .15s ease,background .15s ease,box-shadow .15s ease;}'
    + '.kv-textarea::placeholder{color:#7d735c;}'
    + '.kv-textarea:hover{border-color:#d8cfb8;}'
    + '.kv-textarea:focus{border-color:var(--kv-accent,' + DEFAULT_ACCENT + ');background:#fff;'
    + 'box-shadow:0 0 0 3px rgba(201,164,99,.14);}'
    + '.kv-textarea:disabled{background:#f5f4f1;color:#a19c8d;}'
    + '.kv-send{flex:none;width:44px;height:44px;border-radius:50%;border:none;background:var(--kv-accent,' + DEFAULT_ACCENT + ');'
    + 'color:' + DEFAULT_INK + ';display:flex;align-items:center;justify-content:center;cursor:pointer;'
    + 'transition:opacity .15s ease,transform .1s ease,box-shadow .15s ease;box-shadow:0 6px 16px rgba(201,164,99,.3);}'
    + '.kv-send:hover:not(:disabled){transform:translateY(-1px);}'
    + '.kv-send:active{transform:scale(.94);}'
    + '.kv-send:disabled{opacity:.35;cursor:default;box-shadow:none;}'
    + '.kv-messages::-webkit-scrollbar{width:5px;}'
    + '.kv-messages::-webkit-scrollbar-track{background:transparent;}'
    + '.kv-messages::-webkit-scrollbar-thumb{background:rgba(201,164,99,.3);border-radius:8px;}'
    + '.kv-messages::-webkit-scrollbar-thumb:hover{background:rgba(201,164,99,.45);}'

    /* ---------- Focus clavier visible (accessibilité) ---------- */
    + '.kv-close:focus-visible,.kv-send:focus-visible,.kv-chip:focus-visible,'
    + '.kv-teaser-close:focus-visible,.kv-teaser-body:focus-visible,.kv-retry:focus-visible{'
    + 'outline:2px solid var(--kv-accent,' + DEFAULT_ACCENT + ');outline-offset:2px;}'
    + '.kv-textarea:focus-visible{outline:none;}'

    /* ---------- Mobile ---------- */
    + '@media (max-width:480px){'
    + '  .kv-panel{width:100vw;max-width:100vw;height:100%;height:100dvh;max-height:100dvh;bottom:0;right:0;left:0;'
    + '    border-radius:0;}'
    + '  .kv-bubble{bottom:calc(16px + env(safe-area-inset-bottom, 0px));padding:0;width:48px;height:48px;'
    + '    justify-content:center;}'
    + '  .kv-bubble-label{display:none;}'
    + '  .kv-bubble-mark{width:100%;height:100%;}'
    + '  .kv-teaser{bottom:calc(70px + env(safe-area-inset-bottom, 0px));right:16px;left:16px;width:auto;}'
    + '  .kv-teaser::after{display:none;}' // pointe visuelle superflue une fois la mini-bulle pleine largeur sur mobile
    + '  .kv-header{padding-top:calc(18px + env(safe-area-inset-top, 0px));}'
    + '  .kv-panel.kv-panel-compact{height:100%;height:100dvh;max-height:100dvh;}' // jamais de compacité sur mobile (plein écran préservé)
    + '}'

    /* ---------- prefers-reduced-motion : neutralise toutes les animations/transitions ajoutées ---------- */
    + '@media (prefers-reduced-motion: reduce){'
    + '  .kv-bubble,.kv-bubble::after,.kv-panel,.kv-teaser,.kv-row,.kv-cta-row,.kv-suggestions,'
    + '  .kv-typing-dots span,.kv-send,.kv-cta,.kv-chip{animation:none!important;transition:none!important;}'
    + '  .kv-bubble::after{display:none;}'
    + '}';

  /* ============================================================
     4. Construction du DOM (Shadow DOM) — aucun innerHTML dynamique
     ============================================================ */
  var host = document.createElement('div');
  host.setAttribute('id', 'kreovya-widget-host-' + TENANT_ID);
  // Verrouille la boîte de l'hôte contre le CSS du site client, en plus de
  // l'isolation apportée par le Shadow DOM lui-même.
  host.style.cssText = 'all:initial;position:fixed;inset:0;width:0;height:0;z-index:2147483000;pointer-events:none;';
  document.body.appendChild(host);

  var shadow = host.attachShadow({ mode: 'open' });

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS; // CSS statique écrite en dur ci-dessus, jamais de contenu externe
  shadow.appendChild(styleEl);

  var root = document.createElement('div');
  root.className = 'kv-root';
  shadow.appendChild(root);

  // Bulle flottante — pilule premium (monogramme + libellé), aucun contenu
  // dynamique : "K" et le libellé sont des chaînes statiques écrites en dur.
  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'kv-bubble';
  bubble.setAttribute('aria-label', "Ouvrir l'assistant de réservation");
  root.appendChild(bubble);

  var bubbleMark = document.createElement('span');
  bubbleMark.className = 'kv-bubble-mark';
  bubbleMark.setAttribute('aria-hidden', 'true');
  bubbleMark.textContent = 'K';
  bubble.appendChild(bubbleMark);

  var bubbleLabel = document.createElement('span');
  bubbleLabel.className = 'kv-bubble-label';
  bubbleLabel.setAttribute('aria-hidden', 'true');
  bubbleLabel.textContent = 'Assistant réservation';
  bubble.appendChild(bubbleLabel);

  // Mini-bulle d'accueil automatique — élément indépendant du panneau,
  // construit intégralement via des méthodes DOM sûres (textContent),
  // jamais innerHTML avec du contenu dynamique (voir buildGreetingTeaserText).
  var teaser = document.createElement('div');
  teaser.className = 'kv-teaser kv-teaser-hidden';
  teaser.setAttribute('role', 'dialog');
  teaser.setAttribute('aria-label', "Message d'accueil de l'assistant");
  root.appendChild(teaser);

  var teaserCloseBtn = document.createElement('button');
  teaserCloseBtn.type = 'button';
  teaserCloseBtn.className = 'kv-teaser-close';
  teaserCloseBtn.setAttribute('aria-label', "Fermer le message d'accueil");
  teaserCloseBtn.innerHTML = ICON_CLOSE; // icône statique
  teaser.appendChild(teaserCloseBtn);

  var teaserBody = document.createElement('button');
  teaserBody.type = 'button';
  teaserBody.className = 'kv-teaser-body';
  teaser.appendChild(teaserBody);

  var teaserGreeting = document.createElement('p');
  teaserGreeting.className = 'kv-teaser-greeting';
  teaserBody.appendChild(teaserGreeting);

  var teaserCta = document.createElement('p');
  teaserCta.className = 'kv-teaser-cta';
  teaserCta.textContent = 'Commencer'; // la flèche "→" est ajoutée en CSS (::after), jamais dans le texte
  teaserBody.appendChild(teaserCta);

  // Panneau de conversation
  var panel = document.createElement('div');
  panel.className = 'kv-panel kv-closed kv-panel-compact';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Assistant de réservation');
  root.appendChild(panel);

  // En-tête
  var header = document.createElement('div');
  header.className = 'kv-header';
  panel.appendChild(header);

  var avatar = document.createElement('div');
  avatar.className = 'kv-header-avatar';
  avatar.textContent = 'K';
  header.appendChild(avatar);

  var headerText = document.createElement('div');
  headerText.className = 'kv-header-text';
  header.appendChild(headerText);

  var headerTitle = document.createElement('p');
  headerTitle.className = 'kv-header-title';
  headerTitle.textContent = DEFAULT_ASSISTANT_NAME;
  headerText.appendChild(headerTitle);

  var headerSub = document.createElement('p');
  headerSub.className = 'kv-header-sub';
  headerSub.textContent = 'Assistant de réservation';
  headerText.appendChild(headerSub);

  var statusRow = document.createElement('div');
  statusRow.className = 'kv-status';
  headerText.appendChild(statusRow);

  var statusDot = document.createElement('span');
  statusDot.className = 'kv-status-dot kv-status-loading';
  statusRow.appendChild(statusDot);

  var statusLabel = document.createElement('span');
  statusLabel.textContent = 'Connexion…';
  statusRow.appendChild(statusLabel);

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'kv-close';
  closeBtn.setAttribute('aria-label', "Fermer l'assistant");
  closeBtn.innerHTML = ICON_CLOSE; // icône statique
  header.appendChild(closeBtn);

  // Zone de messages
  var messagesEl = document.createElement('div');
  messagesEl.className = 'kv-messages';
  messagesEl.setAttribute('aria-live', 'polite');
  panel.appendChild(messagesEl);

  // Zone de saisie
  var composer = document.createElement('div');
  composer.className = 'kv-composer';
  panel.appendChild(composer);

  var textarea = document.createElement('textarea');
  textarea.className = 'kv-textarea';
  textarea.rows = 1;
  textarea.maxLength = MAX_MESSAGE_LENGTH;
  textarea.placeholder = 'Écrivez votre message…';
  textarea.setAttribute('aria-label', 'Votre message');
  composer.appendChild(textarea);

  var sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'kv-send';
  sendBtn.setAttribute('aria-label', 'Envoyer');
  sendBtn.innerHTML = ICON_SEND; // icône statique
  composer.appendChild(sendBtn);

  /* ============================================================
     5. État de la conversation (mémoire de page uniquement)
     ============================================================ */
  var state = {
    open: false,
    sending: false,
    businessName: null,
    messages: [],       // [{role:'user'|'assistant', content:string}]
    suggestionsShown: false,
    bodyOverflowBackup: null,
    leadId: null,       // opaque, jamais affiché ; hydraté depuis sessionStorage ci-dessous
  };

  /* ---------- Persistance du leadId (sessionStorage uniquement) ----------
     Le serveur seul décide si ce leadId correspond à un prospect réel
     (voir getLeadContext côté kreovya-agent.js) : ce module ne fait que le
     transporter. Toute indisponibilité de sessionStorage (navigation privée
     stricte, quota, etc.) dégrade silencieusement vers "pas de leadId" —
     jamais d'erreur visible au visiteur. */
  function loadStoredLeadId() {
    try {
      return sessionStorage.getItem(LEAD_ID_STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function storeLeadId(leadId) {
    try {
      if (leadId) {
        sessionStorage.setItem(LEAD_ID_STORAGE_KEY, leadId);
      } else {
        sessionStorage.removeItem(LEAD_ID_STORAGE_KEY);
      }
    } catch (e) {
      // sessionStorage indisponible : la conversation continue simplement
      // sans persistance du leadId au prochain rechargement.
    }
  }

  state.leadId = loadStoredLeadId();

  function isMobileViewport() {
    return window.matchMedia('(max-width: 480px)').matches;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function autoGrowTextarea() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  /* ---------- Rendu des bulles de message (texte brut uniquement) ---------- */
  function appendMessageRow(role, text, opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'kv-row kv-from-' + role;

    var bubbleMsg = document.createElement('div');
    bubbleMsg.className = 'kv-bubble-msg' + (opts.isError ? ' kv-error' : '');
    bubbleMsg.textContent = text; // JAMAIS innerHTML : texte de Claude/visiteur toujours en textContent
    row.appendChild(bubbleMsg);

    if (opts.onRetry) {
      var retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'kv-retry';
      retryBtn.textContent = 'Réessayer';
      retryBtn.addEventListener('click', opts.onRetry);
      bubbleMsg.appendChild(document.createElement('br'));
      bubbleMsg.appendChild(retryBtn);
    }

    messagesEl.appendChild(row);
    scrollToBottom();
    return row;
  }

  /* ---------- CTA "Finaliser ma réservation" ----------
     reservationUrl provient exclusivement de la réponse serveur
     (kreovya-agent.js) — jamais construite ni devinée ici. Une simple
     affectation .href, jamais innerHTML avec du contenu dynamique. */
  function appendReservationCta(url) {
    var row = document.createElement('div');
    row.className = 'kv-cta-row';

    var link = document.createElement('a');
    link.className = 'kv-cta';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Finaliser ma réservation';

    row.appendChild(link);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  var typingRow = null;
  function showTyping() {
    if (typingRow) return;
    typingRow = document.createElement('div');
    typingRow.className = 'kv-row kv-from-assistant';
    var bubbleMsg = document.createElement('div');
    bubbleMsg.className = 'kv-bubble-msg';
    var typing = document.createElement('div');
    typing.className = 'kv-typing';
    typing.setAttribute('aria-label', 'KREOVYA réfléchit…');
    var typingLabel = document.createElement('span');
    typingLabel.className = 'kv-typing-label';
    typingLabel.textContent = 'KREOVYA réfléchit…'; // texte statique, jamais dynamique
    typing.appendChild(typingLabel);
    var typingDots = document.createElement('span');
    typingDots.className = 'kv-typing-dots';
    typingDots.appendChild(document.createElement('span'));
    typingDots.appendChild(document.createElement('span'));
    typingDots.appendChild(document.createElement('span'));
    typing.appendChild(typingDots);
    bubbleMsg.appendChild(typing);
    typingRow.appendChild(bubbleMsg);
    messagesEl.appendChild(typingRow);
    scrollToBottom();
  }
  function hideTyping() {
    if (typingRow && typingRow.parentNode) {
      typingRow.parentNode.removeChild(typingRow);
    }
    typingRow = null;
  }

  /* ---------- Suggestions initiales ---------- */
  var suggestionsRow = null;
  function showSuggestions() {
    if (state.suggestionsShown) return;
    state.suggestionsShown = true;
    suggestionsRow = document.createElement('div');
    suggestionsRow.className = 'kv-suggestions';
    SUGGESTIONS.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'kv-chip' + (s.primary ? ' kv-chip-primary' : '');

      var chipIcon = document.createElement('span');
      chipIcon.className = 'kv-chip-icon';
      chipIcon.setAttribute('aria-hidden', 'true');
      chipIcon.innerHTML = s.icon; // SVG statique écrit en dur, jamais de contenu dynamique
      chip.appendChild(chipIcon);

      var chipLabel = document.createElement('span');
      chipLabel.textContent = s.label; // texte statique écrit en dur, sûr
      chip.appendChild(chipLabel);

      chip.addEventListener('click', function () {
        removeSuggestions();
        sendUserMessage(s.text);
      });
      suggestionsRow.appendChild(chip);
    });
    messagesEl.appendChild(suggestionsRow);
    scrollToBottom();
  }
  function removeSuggestions() {
    if (suggestionsRow && suggestionsRow.parentNode) {
      suggestionsRow.parentNode.removeChild(suggestionsRow);
    }
    suggestionsRow = null;
    // Une vraie conversation démarre ici (appelé par sendUserMessage() et par
    // le clic sur une action rapide, juste avant l'envoi) : le panneau peut
    // maintenant utiliser tout l'espace disponible. Purement présentationnel.
    panel.classList.remove('kv-panel-compact');
  }

  /* ============================================================
     6. Appels réseau (uniquement vers les fonctions KREOVYA)
     ============================================================ */
  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    options = options || {};
    options.signal = controller.signal;
    return fetch(url, options).finally(function () { clearTimeout(timer); });
  }

  function loadTenantConfig() {
    fetchWithTimeout(CONFIG_URL, { method: 'GET' }, CONFIG_TIMEOUT_MS)
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.success || !result.data.tenant) {
          setStatus('degraded', 'Mode limité');
          renderGreeting(null);
          return;
        }
        var tenant = result.data.tenant;
        state.businessName = tenant.business && tenant.business.name ? tenant.business.name : null;

        // Point d'extension prêt pour plus tard : un futur `tenant.branding`
        // (couleur principale, logo, nom de l'assistant, message d'accueil,
        // position) sera lu ici et appliqué. Aucun tenant ne le définit
        // encore — tout retombe sur les valeurs par défaut KREOVYA.
        var branding = tenant.branding || {};
        applyBranding(branding);

        setStatus('online', 'En ligne · Réponse instantanée');
        renderGreeting(branding.welcomeMessage || null);
      })
      .catch(function () {
        setStatus('degraded', 'Mode limité');
        renderGreeting(null);
      });
  }

  function applyBranding(branding) {
    if (branding.primaryColor) {
      root.style.setProperty('--kv-accent', branding.primaryColor);
    }
    if (branding.assistantName) {
      headerTitle.textContent = branding.assistantName;
      avatar.textContent = branding.assistantName.trim().charAt(0).toUpperCase() || 'K';
    }
    if (branding.logoUrl) {
      var img = document.createElement('img');
      img.src = branding.logoUrl;
      img.alt = '';
      avatar.textContent = '';
      avatar.appendChild(img);
    }
    // La position gauche/droite affecte le CSS statique injecté au chargement ;
    // non recalculée dynamiquement en V1 puisqu'aucun tenant ne la définit encore.
  }

  function setStatus(kind, label) {
    statusDot.className = 'kv-status-dot' + (kind === 'loading' ? ' kv-status-loading' : kind === 'degraded' ? ' kv-status-degraded' : '');
    statusLabel.textContent = label;
  }

  var greetingRendered = false;
  function renderGreeting(customMessage) {
    if (greetingRendered) return;
    greetingRendered = true;
    var name = state.businessName;
    // Double saut de ligne pour une respiration typographique nette entre la
    // présentation et la question — kv-bubble-msg est déjà en white-space:pre-wrap.
    var text = customMessage
      || (name
        ? 'Bonjour 👋\nJe suis l\'assistant de réservation de ' + name + '.\n\nQue souhaitez-vous organiser ?'
        : 'Bonjour 👋\n\nQue souhaitez-vous organiser ?');
    appendMessageRow('assistant', text);
    showSuggestions();
  }

  /* ---------- Mini-bulle d'accueil automatique (UI uniquement) ----------
     Totalement indépendante du leadId / de la session métier KREOVYA :
     GREETING_SHOWN_STORAGE_KEY ne contient aucun identifiant, n'est jamais
     lue par callAgent()/le serveur, et ne sert qu'à éviter de réafficher
     cette invitation à chaque changement de page pendant le même onglet. */
  function hasGreetingTeaserBeenShown() {
    try {
      return sessionStorage.getItem(GREETING_SHOWN_STORAGE_KEY) === '1';
    } catch (e) {
      return false; // sessionStorage indisponible : on se contente de la montrer une fois par page.
    }
  }

  function markGreetingTeaserShown() {
    try {
      sessionStorage.setItem(GREETING_SHOWN_STORAGE_KEY, '1');
    } catch (e) {
      // Dégradation silencieuse — aucun impact sur la conversation.
    }
  }

  function buildGreetingTeaserText() {
    // CORRIGÉ : ce fichier est partagé entre plusieurs tenants (data-tenant) —
    // "Salle 906" ne doit JAMAIS être codé en dur ici, sous peine de saluer un
    // visiteur d'un autre établissement par le mauvais nom. Utilise le nom
    // réel du tenant courant (state.businessName, hydraté par
    // loadTenantConfig() depuis kreovya-config.js), avec un repli générique
    // si la configuration n'a pas encore été chargée.
    var name = state.businessName;
    return 'Bonjour 👋\nJe suis l\'assistant de ' + (name || 'réservation') + '.\n\nQue souhaitez-vous organiser ?';
  }

  var teaserVisible = false;
  function showGreetingTeaser() {
    if (state.open || teaserVisible || hasGreetingTeaserBeenShown()) return;
    markGreetingTeaserShown();
    teaserGreeting.textContent = buildGreetingTeaserText(); // textContent uniquement, jamais innerHTML
    teaser.classList.remove('kv-teaser-hidden');
    requestAnimationFrame(function () { teaser.classList.add('kv-teaser-visible'); });
    teaserVisible = true;
  }

  function hideGreetingTeaser() {
    if (!teaserVisible) return;
    teaserVisible = false;
    teaser.classList.remove('kv-teaser-visible');
    setTimeout(function () {
      if (!teaserVisible) teaser.classList.add('kv-teaser-hidden');
    }, 280);
  }

  function scheduleGreetingTeaser() {
    if (hasGreetingTeaserBeenShown()) return;
    setTimeout(showGreetingTeaser, GREETING_DELAY_MS);
  }

  teaserCloseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideGreetingTeaser();
  });
  teaserBody.addEventListener('click', function () {
    hideGreetingTeaser();
    openPanel();
  });

  function callAgent() {
    state.sending = true;
    updateComposerState();
    showTyping();

    var payload = { tenantId: TENANT_ID, leadId: state.leadId || null, messages: state.messages };

    fetchWithTimeout(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, AGENT_TIMEOUT_MS)
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        hideTyping();
        state.sending = false;
        updateComposerState();

        if (!result.ok || !result.data || !result.data.success || !result.data.message) {
          var errMsg = (result.data && result.data.message) || 'Une erreur est survenue. Veuillez réessayer.';
          appendMessageRow('assistant', errMsg, { isError: true, onRetry: retryLast });
          return;
        }

        // Ordre important : on efface d'abord (si le serveur a rejeté le
        // leadId envoyé), puis on adopte le leadId courant renvoyé (qu'il
        // s'agisse d'une confirmation du même id ou d'un nouveau, créé par
        // createLead pendant cette requête). Jamais affiché au visiteur.
        if (result.data.leadIdInvalid) {
          state.leadId = null;
          storeLeadId(null);
        }
        if (result.data.leadId) {
          state.leadId = result.data.leadId;
          storeLeadId(result.data.leadId);
        }

        var replyText = result.data.message.content;
        state.messages.push({ role: 'assistant', content: replyText });
        appendMessageRow('assistant', replyText);

        // reservationUrl : pont KREOVYA → /reservation (paiement existant du
        // site, inchangé). Présent uniquement après un HOLD réussi. Jamais
        // persistée (pas de sessionStorage), jamais réutilisée au-delà de
        // cet affichage — un nouvel appel agent la retransmettra si pertinent.
        if (result.data.reservationUrl) {
          appendReservationCta(result.data.reservationUrl);
        }
      })
      .catch(function () {
        hideTyping();
        state.sending = false;
        updateComposerState();
        appendMessageRow('assistant', 'Impossible de contacter l\'assistant pour le moment. Veuillez réessayer.', { isError: true, onRetry: retryLast });
      });
  }

  function retryLast() {
    // Retire la bulle d'erreur cliquée puis retente le même appel : les
    // messages envoyés (state.messages) contiennent déjà le dernier message
    // du visiteur, on ne le ré-ajoute pas.
    var lastRow = messagesEl.querySelector('.kv-row:last-child');
    if (lastRow && lastRow.parentNode) lastRow.parentNode.removeChild(lastRow);
    callAgent();
  }

  function sendUserMessage(text) {
    text = (text || '').trim();
    if (!text || state.sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.slice(0, MAX_MESSAGE_LENGTH);
    }
    removeSuggestions();
    state.messages.push({ role: 'user', content: text });
    appendMessageRow('user', text);
    callAgent();
  }

  /* ============================================================
     7. Composer (textarea + bouton d'envoi)
     ============================================================ */
  function updateComposerState() {
    sendBtn.disabled = state.sending || !textarea.value.trim();
  }

  textarea.addEventListener('input', function () {
    autoGrowTextarea();
    updateComposerState();
  });

  textarea.addEventListener('keydown', function (e) {
    // Entrée seule = envoyer ; Maj+Entrée = retour à la ligne (comportement
    // par défaut du textarea, non intercepté). Pendant l'envoi en cours, on
    // laisse aussi Entrée seule insérer une ligne plutôt que de la bloquer
    // silencieusement, pour ne jamais donner l'impression d'une touche morte.
    if (e.key === 'Enter' && !e.shiftKey && !state.sending) {
      e.preventDefault();
      if (textarea.value.trim()) {
        var text = textarea.value;
        textarea.value = '';
        autoGrowTextarea();
        updateComposerState();
        sendUserMessage(text);
      }
    }
  });

  sendBtn.addEventListener('click', function () {
    if (state.sending || !textarea.value.trim()) return;
    var text = textarea.value;
    textarea.value = '';
    autoGrowTextarea();
    updateComposerState();
    sendUserMessage(text);
  });

  /* ============================================================
     8. Ouverture / fermeture du panneau
     ============================================================ */
  function openPanel() {
    state.open = true;
    hideGreetingTeaser(); // toute ouverture du panneau masque la mini-bulle, quel que soit le déclencheur
    panel.classList.remove('kv-closed');
    // requestAnimationFrame pour laisser le navigateur appliquer kv-closed→visible
    // avant d'ajouter kv-open, afin que la transition CSS se joue.
    requestAnimationFrame(function () { panel.classList.add('kv-open'); });
    bubble.classList.add('kv-hidden');

    if (isMobileViewport()) {
      state.bodyOverflowBackup = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    setTimeout(function () { textarea.focus(); }, 50);
  }

  function closePanel() {
    state.open = false;
    panel.classList.remove('kv-open');
    bubble.classList.remove('kv-hidden');
    setTimeout(function () {
      if (!state.open) panel.classList.add('kv-closed');
    }, 200);

    if (state.bodyOverflowBackup !== null) {
      document.body.style.overflow = state.bodyOverflowBackup;
      state.bodyOverflowBackup = null;
    }

    bubble.focus();
  }

  bubble.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);

  shadow.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.open) { closePanel(); return; }
    if (teaserVisible) hideGreetingTeaser();
  });

  /* ============================================================
     9. Démarrage
     ============================================================ */
  updateComposerState();
  loadTenantConfig();
  scheduleGreetingTeaser(); // délai fixe depuis le chargement de la page, indépendant du réseau
})();
