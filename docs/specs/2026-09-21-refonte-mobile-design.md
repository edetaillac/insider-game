---
date: 2026-09-21
contexte: Refonte de l'interface mobile à partir du handoff Claude Design (docs/design/handoff-2026-09-21/README.md, référence pixel refonte-mobile.html, raisonnement audit-design.html). Ce document ne répète pas le handoff, il consigne les écarts décidés avec Manu, le contrat technique client/serveur et le périmètre
statut: validé (4 décisions prises par Manu le 21/09)
---

# Refonte mobile, écarts et contrat

## TL;DR

Le handoff est la spec visuelle : tokens, typographies, tailles, espacements, textes, écrans. On l'implémente en haute fidélité dans `render.js`, `style.css`, `layout.ejs`, `client.js`. Trois ajouts serveur, tous petits et testés : accusés "j'ai vu ma carte", bulletin propre exposé dans la vue (pour l'état sélectionné et le vote modifiable), URL de partage. Quatre écarts par rapport au handoff, décidés avec Manu, listés ci-dessous. Le moteur reste pur, le protocole socket ne change pas de forme (`state`, `command` avec ack).

## Écarts décidés par rapport au handoff

1. Mot pendant l'enquête : bloc noir permanent pour le Maître seul. Le Traître a exactement le même écran qu'un Citoyen (cohérent avec ADR D6 et le livret : rien ne distingue un Traître d'un Citoyen, même en regardant l'écran voisin). Le handoff donnait le bloc aux deux. La vue serveur continue d'exposer le mot au Traître, c'est le client qui ne l'affiche pas hors du rituel
2. Polices auto-hébergées dans `public/fonts/` (Oswald 500 et 600, IBM Plex Sans 400 à 700, woff2, latin et latin-ext) via `public/css/fonts.css`, au lieu de Google Fonts. Marche sans Internet sur le wifi d'un salon
3. Bootstrap et Font Awesome retirés dès ce chantier, pas en chantier de fond. Glyphes en SVG inline (croix, coche, flèche, chevron)
4. Le compteur de joueurs de l'en-tête est affiché mais n'ouvre pas de feuille modale (non maquettée). Différé

Ajustements de copie imposés par le moteur :
- Écran "Qui a trouvé" : le chrono ne se met pas en pause côté serveur. Texte : "Le chrono continue pendant ton choix."
- Accusé du mot : pas de CTA "J'ai regardé" pendant le rituel, l'accusé est envoyé quand la carte est retournée. L'hôte peut lancer le chrono même si tout le monde n'a pas regardé (la note l'invite à attendre), pour ne jamais bloquer une table

## Contrat serveur

### Moteur (`src/engine/`)

- Phases `roles` et `word` portent `seen: Record<PlayerId, true>`. `startRound` crée `{ name: 'roles', seen: {} }`, `setWord` et `drawWord` créent `{ name: 'word', seen: {} }`
- Nouvelles commandes `seenRole` (phase roles) et `seenWord` (phase word), tout joueur, idempotentes : `seen[actor] = true`. Pas de résolution automatique, la progression est informative
- `allowedActions` n'exclut plus `vote1` et `vote2` après un bulletin (le vote est modifiable jusqu'au dernier bulletin, `apply` l'acceptait déjà). Il exclut `seenRole` et `seenWord` une fois vus
- Vue : `me.hasSeen` et `players[].hasSeen` (vrai si vu dans la phase roles ou word courante, faux sinon) ; `me.ballot` (le bulletin du joueur lui-même dans la phase de vote courante, `boolean | CandidateId | null`), jamais celui d'un autre. `hasVoted` inchangé
- Tests : les 3 commandes et champs couverts, la grille phase x commande étendue, les tests de vue existants ajustés (`vote1` reste dans `actions` après vote)

### Adaptateur et transport (`src/server/`)

- `CLIENT_COMMANDS` accepte `seenRole` et `seenWord` (sans argument)
- `snapshot` porte `shareUrl: string | null`, valeur de `createTable({ shareUrl })`, venant de `PUBLIC_URL` dans `app.js` (null si absent, le client replie sur `location.origin`)

## Contrat client

### Coquille (`layout.ejs`)

```
<div id="app">
  <div id="banner" role="status" hidden>Reconnexion...</div>   pousse le contenu, ne recouvre pas
  <header class="top"> frise (une fois, 34px) + logo (20px) + compteur joueurs 44x44 </header>
  <div id="phasebar" class="phasebar" hidden><span data-phase-label></span><span data-phase-rank></span></div>
  <main id="screen" class="content"></main>                     flex:1, overflow-y:auto, padding 20px 20px 8px
  <div id="dock" class="dock"></div>                            socle dégradé, safe-area
  <div id="toast" class="toast" role="status" hidden></div>     au-dessus du socle
</div>
```
Meta viewport `width=device-width, initial-scale=1, viewport-fit=cover`. Feuilles : `fonts.css` puis `style.css`. Plus aucun CDN. `aria-live="polite"` sur la barre de phase, pas sur `#screen`.

### Rendu (`render.js`)

`render(envelope, local) -> { phase: { label, rank } | null, content: string, dock: string, counter: string }`. Pure. `client.js` écrit les quatre régions et masque la barre de phase quand `phase` est null (accueil).

État local d'interface tenu par `client.js`, remis à zéro à chaque changement de `view.phase` : `flipped` (carte retournée), `v1` (`true | false | null`, dernier bulletin envoyé), `v2` (candidat sélectionné avant confirmation), `finderPicking`, `kickConfirm` (id du joueur dont on demande le retrait). `local.v1` et `local.v2` sont initialisés depuis `view.me.ballot` au premier rendu de la phase (reload).

Délégation : `data-cmd` + `data-args` envoient une commande serveur (inchangé). `data-ui="<action>"` + `data-arg` modifient l'état local puis re-rendent : `flip`, `pick-finder`, `cancel-finder`, `select-v1`, `select-v2`, `confirm-vote`, `kick-ask`, `kick-cancel`. Correctif du 21/09 : `flip` n'envoie plus rien, l'accusé (`seenRole` ou `seenWord`) passe par un CTA du socle, inactif tant que la carte n'a jamais été retournée. Même règle dans les deux phases.

Barre de temps des cartes : élément `.timebar` dans la face révélée, animation CSS `shrink 5s linear both` déclenchée par `[data-flipped]`, alignée sur `AUTOHIDE_MS = 5000`. `prefers-reduced-motion` coupe `breathe` et `rise`, garde `shrink`.

### Écrans

Ceux du handoff, dans l'ordre : join, lobby, roles (carte puis, une fois vue, choix du mot pour le Maître ou attente pour les autres), word (rituel), playing (Maître : chrono, barre de temps, bloc du mot, règle du tour, CTA jaune ; autres : chrono, règle, CTA inactif avec note), finder (écran plein, Maître ou hôte), discussion, vote1, vote2, tiebreak, ended. Textes et valeurs : handoff, sections 1 à 13.

## Hors périmètre

Feuille modale du compteur, SVG détourés du logo et de l'œil (les JPEG restent, ils ne fonctionnent que sur le rouge), rooms, transfert d'hôte, variantes de règles non implémentées.

## Critères de fin

- `npm test`, `npm run typecheck`, `npm run lint` verts
- `git grep -n "bootstrapcdn\|font-awesome\|fontawesome\|jquery" -- ':!docs'` vide
- Manche complète jouée à deux navigateurs en largeur 390 px sans erreur console, chaque écran comparé au prototype
- Aucun jaune sur fond rouge (revue visuelle), aucune cible sous 44 px
