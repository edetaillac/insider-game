# Handoff : reprise de l'hôte, messages, coquille et son

## Vue d'ensemble

Cinq lots de changements pour le client mobile d'`insider-game`, à implémenter dans l'ordre :

1. **Système de messages** : trois niveaux visuels (alerte, confirmation, info) et une règle : l'action vit dans le socle, jamais dans le message.
2. **Reprise de l'hôte** : parcours complet quand l'hôte se déconnecte (alerte, confirmation, nouvel hôte, autres joueurs, retour de l'ancien hôte, variante en cours de partie).
3. **Coquille** : suppression du compteur en haut à droite, en-tête compact, barre de phase unique (phase + étape à gauche, présence à droite), feuille « À table ».
4. **Salon** : titre utile, lignes allégées, adresse copiable.
5. **Son** : un seul téléphone (l'hôte) joue quatre sons, bouton de coupure chez l'hôte seulement.

## À propos des fichiers de design

`maquettes.dc.html` est une **référence de design en HTML** (ouvrir dans un navigateur, `support.js` à côté). Ce n'est pas du code à copier : tout est en styles inline pour la maquette. Il faut **recréer ces écrans dans le client existant** (`public/js/render.js`, `public/css/style.css`, `views/index.ejs`, `public/js/audio.js`) en suivant ses conventions : classes CSS dans `style.css`, rendu en chaînes HTML dans `render.js`, commandes via `data-cmd`, actions locales via `data-ui`.

Repères dans la maquette (badges visibles) :
- `1a` : écran actuel de reprise (état de départ)
- `2a` à `2f` : parcours de reprise de l'hôte
- `3a` à `3c` : coquille et présence
- `4c` : son, téléphone de l'hôte

## Fidélité

**Haute fidélité.** Couleurs, typos, rayons et espacements sont définitifs et reprennent les tokens existants de `style.css` (handoff 2026-09-21). Largeur de référence : 375 px.

## Note sur la reprise d'hôte côté serveur

La reprise (« Reprendre la main ») tourne en production (insider.m85.fr) mais n'est pas dans l'état du dépôt lu pour ce handoff. **Garder la commande et les noms déjà implémentés** ; les noms ci-dessous (`claimHost`, `hostOnline`, etc.) sont indicatifs. Besoins côté vue :
- savoir si l'hôte est en ligne : `envelope.online.includes(hostId)` suffit ;
- savoir si je peux reprendre : action `claimHost` dans `view.actions` quand l'hôte est hors ligne et que je ne suis pas hôte ;
- savoir qu'un changement d'hôte vient d'avoir lieu et qui était l'ancien hôte, pour les messages uniques (2c, 2d, 2e) : par exemple `view.hostChange = { from: PlayerId, to: PlayerId, at: number } | null`, remis à `null` au changement de phase suivant.

Règle : un seul changement d'hôte possible tant que le nouvel hôte est en ligne. L'ancien hôte qui revient ne se voit **pas** proposer de reprise (pas de ping-pong).

---

## Design tokens (inchangés, déjà dans `:root`)

| Token | Valeur | Usage |
|---|---|---|
| `--red` | `#DE3C31` | fond d'app |
| `--ink` | `#14100F` | texte, blocs sombres, CTA primaire |
| `--yellow` | `#FFC107` | accent, CTA exceptionnel, confirmation |
| `--cream` | `#FFF7EF` | texte sur sombre, fond des feuilles |
| `--muted` | `#9A8F86` | texte secondaire sur sombre |
| `--well` | `rgba(255,255,255,.14)` | encadrés sur rouge |
| `--well-strong` | `rgba(255,255,255,.22)` | avatars éteints |
| `--disabled-bg` / `--disabled-fg` | `rgba(0,0,0,.2)` / `rgba(20,16,15,.55)` | bouton inactif |

Nouvelles valeurs (à ajouter en tokens) :
- `--muted-strong: #B8AEA5` : corps de texte dans une alerte sombre (meilleur contraste que `--muted` pour 13 px)
- `--sheet-muted: #6E645C` : texte secondaire sur fond crème
- `--sheet-line: rgba(20,16,15,.12)` : séparateurs dans les feuilles
- `--scrim: rgba(20,16,15,.35)` : voile derrière une feuille

Polices : Oswald 500/600 (titres, libellés, boutons, en capitales), IBM Plex Sans 400–700 (texte). Déjà auto-hébergées.

---

## Lot 1 · Système de messages

Trois niveaux, un seul emplacement pour agir.

| Niveau | Quand | Visuel | Action |
|---|---|---|---|
| **Alerte** | un problème bloque la table | bloc `--ink`, surtitre jaune | toujours liée à un CTA dans le socle |
| **Confirmation** | ce qui vient de changer pour moi | bloc `--yellow` | aucune ; affichée une fois |
| **Info** | ce qui a changé à la table pour les autres | encadré `--well` | aucune |

Règles :
- Le message se place **en tête de `.content`**, avant le titre de l'écran.
- **Jamais de bouton dans un message.** Le CTA est dans `#dock`, avec une `.dock-note` au-dessus qui dit qui agit et pourquoi.
- Le **jaune** en CTA (`.btn-accent`) est réservé à l'action exceptionnelle (reprendre la main). Le reste garde `.btn-primary`.
- Le bouton d'attente nomme la personne attendue : « En attente de Manu », pas « En attente de l'hôte ».

### CSS à ajouter

```css
/* Alerte */
.msg-alert { display:flex; gap:14px; padding:16px; border-radius:16px; background:var(--ink); color:var(--cream); }
.msg-alert .msg-eyebrow { margin:0; font-family:var(--display); font-weight:600; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--yellow); }
.msg-alert .msg-title { margin:0; font-family:var(--display); font-weight:600; font-size:22px; line-height:1.05; text-transform:uppercase; }
.msg-alert .msg-body { margin:2px 0 0; font-size:13px; line-height:1.45; color:var(--muted-strong); }
.msg-text { display:flex; flex-direction:column; gap:4px; min-width:0; }

/* Alerte compacte (écrans chargés : résultat, enquête) */
.msg-alert.compact { align-items:center; gap:12px; padding:12px 14px; border-radius:14px; }
.msg-alert.compact .msg-eyebrow { font-size:11px; }
.msg-alert.compact .msg-body { margin:0; font-size:14px; line-height:1.35; color:var(--cream); }
.msg-alert.compact .msg-text { gap:2px; }

/* Avatar de l'absent dans l'alerte : éteint + point jaune */
.avatar-away { position:relative; flex:none; width:44px; height:44px; border-radius:50%; background:rgba(255,247,239,.12); color:var(--muted); display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:600; font-size:18px; }
.avatar-away::after { content:''; position:absolute; right:-2px; bottom:-2px; width:14px; height:14px; border-radius:50%; background:var(--yellow); border:3px solid var(--ink); box-sizing:border-box; }
.msg-alert.compact .avatar-away { width:36px; height:36px; font-size:15px; }
.msg-alert.compact .avatar-away::after { width:12px; height:12px; border-width:2.5px; }

/* Confirmation */
.msg-ok { display:flex; align-items:center; gap:14px; padding:16px; border-radius:16px; background:var(--yellow); color:var(--ink); }
.msg-ok .msg-icon { flex:none; width:44px; height:44px; border-radius:50%; background:var(--ink); color:var(--yellow); display:flex; align-items:center; justify-content:center; }
.msg-ok .msg-title { margin:0; font-family:var(--display); font-weight:600; font-size:22px; line-height:1.05; text-transform:uppercase; }
.msg-ok .msg-body { margin:0; font-size:13px; line-height:1.45; }

/* Info */
.msg-info { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:14px; background:var(--well); }
.msg-info p { margin:0; font-size:14px; line-height:1.45; }
.msg-info strong { font-weight:700; }
```

Espacement : le titre d'écran qui suit un message prend `margin-top:20px` (22 px dans la coquille révisée).

### Helpers à ajouter dans `render.js`

```js
export function msgAlert({ eyebrow, title, body, awayName, compact = false })
export function msgOk({ title, body })          // icône = svg('check', 22)
export function msgInfo({ html, avatarName })   // avatar 36 px .avatar.ink
```

`msgAlert` compact : pas de `title`, seulement `eyebrow` + `body`. Accessibilité : `role="status"` sur info et confirmation, `role="alert"` sur l'alerte à son apparition uniquement.

---

## Lot 2 · Reprise de l'hôte

### 2a · Hôte déconnecté, vue d'un joueur (salon)

Condition : l'hôte n'est pas dans `online`, et `can(view, 'claimHost')`.

Contenu (dans l'ordre) :
1. `msgAlert` :
   - avatar : initiale de l'hôte, `.avatar-away`
   - surtitre : `L'hôte est parti`
   - titre : `{hostName} s'est déconnecté`
   - corps : `Sans hôte, personne ne peut lancer la partie. N'importe quel joueur peut prendre le relais.`
2. Le reste du salon (lot 4).
3. Ligne de l'hôte : badge `Hôte` en **bordure pointillée** tant qu'il est hors ligne (`.chip-host.vacant { border-style:dashed; }`).

Socle :
- note : `Tu deviendras hôte à la place de {hostName}.`
- CTA `.btn-accent` : `Reprendre la main` → `data-ui="claim-ask"` (ouvre 2b)
- Le bouton inactif « En attente de l'hôte » **disparaît** dans cet état.

### 2b · Confirmation avant reprise

Feuille montante (composant partagé avec 3b, voir lot 3). Le contenu derrière passe à `opacity:.45` + voile `--scrim`.

- surtitre (Oswald 12 px 600, `.14em`, capitales, couleur `--red`) : `Reprendre la main`
- titre (Oswald 28 px 600, capitales, interligne 1.05) : `Tu deviens l'hôte`
- liste à puces (15 px, interligne 1.4, puce ronde 6 px `--ink`, gap 8 px) :
  - `Tu lances la partie et les manches suivantes.`
  - `Tu peux retirer un joueur de la table.`
  - `{hostName} reste à table et redevient simple joueur à son retour.`
- CTA `.btn-primary` : `Oui, je prends la main` → `data-cmd="claimHost"`
- `.btn-secondary` : `Annuler` → `data-ui="claim-cancel"`

Si l'hôte revient pendant que la feuille est ouverte : fermer la feuille, toast `{hostName} est revenu.`
Si un autre joueur a repris entre-temps : l'erreur serveur ferme la feuille, toast `{newHostName} a déjà repris la main.`

### 2c · Nouvel hôte

- `msgOk` : titre `Tu es l'hôte`, corps `La table attend ton signal pour lancer.`
- Affiché **une fois** : disparaît au changement de phase suivant (ou au prochain rendu après 8 s, au choix ; préférer le changement de phase).
- Liste : moi en premier avec `Toi` + `Hôte` ; l'ancien hôte passe **en fin de liste**, `Hors ligne`, avec la croix de retrait.
- Socle standard de l'hôte (inchangé) : note `Tu es hôte : les autres attendent ton signal.` + `Lancer la partie`.

### 2d · Les autres joueurs

- `msgInfo`, avatar du nouvel hôte : `<strong>{newHost} a repris la main.</strong> {oldHost} s'est déconnecté, il reste à table.`
- Socle : note `{newHost} lance la partie quand tout le monde est là.` + bouton inactif `En attente de {newHost}`.

### 2e · Retour de l'ancien hôte

- `msgInfo`, avatar du nouvel hôte : `<strong>{newHost} est hôte depuis ton départ.</strong> Tu restes à table comme joueur.`
- Socle identique à 2d. Pas de CTA de reprise.

### 2f · En cours de partie (ex. résultat)

Sur tous les écrans hors salon, utiliser l'**alerte compacte** en tête de contenu :
- surtitre : `L'hôte est parti`
- corps selon la phase (ce qui est bloqué) :
  - `ended` : `{hostName} s'est déconnecté. Sans hôte, pas de nouvelle manche.`
  - `word` : `{hostName} s'est déconnecté. Le Maître peut lancer le chrono.` (pas de CTA si le Maître est présent : il a déjà l'action)
  - autres phases où seul l'hôte débloque : `{hostName} s'est déconnecté. Sans hôte, la partie ne peut pas avancer.`
- Socle : même note + `Reprendre la main` jaune qu'en 2a, **à la place** du bouton d'attente. Si le joueur a sa propre action en cours (voter, confirmer), elle reste prioritaire ; ne pas afficher la reprise dans le socle, garder seulement l'alerte.

### État local à ajouter (`client.js`)

- `claimSheet: boolean`
- lecture de `view.hostChange` pour choisir entre 2c / 2d / 2e.

---

## Lot 3 · Coquille et présence

### En-tête (`.top`)

- **Supprimer `#counter`** (le chiffre en haut à droite).
- En-tête en ligne, centré : `flex-direction:row; justify-content:center; gap:10px; padding:14px 16px;`
- `.top-eye` : hauteur **26 px** (au lieu de 34). `.top-logo` : hauteur **16 px** (au lieu de 20).

### Barre de phase (`.phasebar`)

- `min-height:44px; padding:0 12px 0 16px; align-items:center;`
- Gauche : libellé (inchangé) + rang juste à côté, en `baseline`, gap 8 px : `Enquête` `3/6` (rang 12 px `--muted`, sans espaces autour du `/`).
- Droite : **présence**, bouton `data-ui="presence"`, zone de tap ≥ 44 px de haut, `aria-label="{n} joueurs en ligne sur {total}, voir la table"`.
  - au salon : pastilles empilées + texte
  - en jeu : texte seul (la barre est plus chargée)
  - pastilles : 22 px, bordure 2 px `--ink`, chevauchement `margin-left:-7px`, Oswald 11 px 600. En ligne : fond `--yellow`, lettre `--ink`. Hors ligne : fond `--ink`, lettre `--muted`, anneau intérieur `inset 0 0 0 1.5px var(--muted)`. Ordre : en ligne d'abord, hors ligne en dernier. Au-delà de 5, afficher 4 pastilles + `+N`.
  - texte : 12 px 600 `--cream`. Tous en ligne : `4 en ligne`. Sinon : `3 sur 4 en ligne`.
- `role="status"` reste sur le libellé de phase seulement (pas sur la présence, trop bavard).

### 3b · Feuille « À table »

Composant **feuille** générique (réutilisé par 2b) :
- voile `--scrim` plein écran, tap = fermer
- feuille fixée en bas, fond `--cream`, rayon `24px 24px 0 0`, padding `14px 20px calc(26px + env(safe-area-inset-bottom))`, gap 10 px
- poignée : 40 × 4 px, rayon 2, `rgba(20,16,15,.2)`, centrée
- animation d'entrée : translateY(100%) → 0, 0.25 s ease ; aucune avec `prefers-reduced-motion`
- piège le focus, `Échap` ferme, `role="dialog" aria-modal="true"`

Contenu de « À table » :
- en-tête : titre `À table` (Oswald 26 px 600 capitales) à gauche, `3 sur 4 en ligne` (13 px 600) à droite, alignés en baseline
- lignes : hauteur min 56 px, séparateur `1px solid var(--sheet-line)` (pas sur la dernière), avatar 36 px, nom 17 px 600
  - hors ligne : avatar `rgba(20,16,15,.08)` lettre `--muted`, sous le nom `Hors ligne` 12 px italique `--sheet-muted` (si le serveur expose l'heure de déconnexion : `Hors ligne depuis 2 min`, sinon garder `Hors ligne`)
  - rôles **publics** seulement à droite : `Maître du jeu` (12 px 600 `--sheet-muted`), badge `Hôte`, pastille `Toi`
- `.btn-secondary` : `Fermer`

---

## Lot 4 · Salon

- **Supprimer le `<h1>Salon</h1>`** (doublon de la barre). Nouveau titre `.h2` : `{n} joueurs à table` (`1 joueur à table` au singulier).
- Sous-titre `.p` (margin-top 4 px) :
  - si assez : `Assez pour lancer, {min} minimum.`
  - sinon : `Encore {min - n} pour lancer, {min} minimum.`
- Lignes `.row` : hauteur min **56 px** (au lieu de 60), avatar **36 px** (au lieu de 40), nom 17 px. Nom et statut **sur une seule ligne** : `.row-main` passe en `flex-direction:row`, le statut n'apparaît que pour `Hors ligne` (500, italique, 12 px, avant le badge). On n'affiche plus `En ligne`.
- `Toi` devient une pastille : `padding:2px 8px; border-radius:999px; background:var(--ink); color:var(--cream); font-weight:600; font-size:11px;`
- Ordre : moi, puis l'hôte s'il n'est pas moi, puis les autres dans l'ordre d'arrivée, les joueurs hors ligne en fin de liste.
- Encadré d'adresse sur une ligne :
  - `.well` en flex, `padding:12px 12px 12px 16px`, gap 12 px
  - gauche : `Pour rejoindre, jusqu'au lancement` (12 px), dessous l'adresse **sans `https://`** (15 px 700)
  - droite : bouton `Copier` : min-height 44 px, padding `0 14px`, bordure `2px solid var(--ink)`, rayon 10 px, fond transparent, 13 px 700. Au tap : `navigator.clipboard.writeText(url)` (URL complète) puis toast `Adresse copiée.` Repli si refusé : sélectionner le texte.

---

## Lot 5 · Son

### Règles

1. **Seul le téléphone de l'hôte joue les sons.** Les autres sont muets. Pas de réglage pour changer de téléphone. Si l'hôte change (reprise), le son suit automatiquement.
2. **Quatre sons seulement**, aux moments où les téléphones sont posés :

| Moment | Déclencheur | Son |
|---|---|---|
| Départ du chrono | entrée en `playing` | `go` |
| Plus que 30 s | `deadline - now ≤ 30 000` pendant `playing`, une seule fois | **nouveau son à fournir**, court (< 1 s), doux |
| Temps écoulé | `ended` avec `reason === 'timeout'` | `dong` |
| Fin de manche | `ended` hors timeout | `tada` |

   Supprimés : `roles` (mysterious), `word` / `vote1` / `vote2` / `tiebreak` (message), `discussion` (ding).
3. **Jamais de son ni de vibration liés à un rôle.** (Cohérent avec l'ADR D6.)
4. Le son de 30 s part en même temps que le passage du bloc chrono en `.urgent` : même seuil.

### Code (`public/js/audio.js`)

- `SOUND_BY_PHASE` → `{ playing: 'go', ended: 'tada' }` + `dong` pour timeout + nouveau `warn` pour 30 s.
- `playFor(prev, phase, reason, { isHost, muted })` : retourner immédiatement si `!isHost || muted`.
- Nouvelle fonction `playWarn()` appelée depuis le tick du chrono, gardée par un drapeau remis à zéro à chaque nouvelle manche.
- `unlock()` ne précharge que ces 4 fichiers. Le Wake Lock reste demandé pour tout le monde (l'écran allumé sert aussi aux autres).
- Supprimer les fichiers inutilisés de `public/sound/` (`mysterious`, `message`, `ding`) si plus référencés.
- Volume : normaliser les fichiers vers environ −16 LUFS, `audio.volume = 0.7`.

### 4c · Contrôle de coupure (hôte uniquement)

- Dans la barre de phase, à gauche de la présence (gap 10 px), **chez l'hôte seulement** : pastille `Son`.
  - activé : min-height 28 px (zone de tap étendue à 44 px par padding ou pseudo-élément), padding `0 10px`, bordure `1.5px solid var(--yellow)`, rayon 999 px, texte `--yellow` Oswald 11 px 600 `.12em` capitales, point plein 7 px jaune avant le texte.
  - coupé : bordure et texte `--muted`, point **creux** (bordure 1.5 px, fond transparent), libellé `Son coupé`.
  - `role="switch" aria-checked`, `aria-label="Son de la partie"`.
  - préférence dans `localStorage` (`insider:muted`), locale au téléphone.

### Note du salon (proposée, à valider avec le produit)

Socle de l'hôte au salon : remplacer `Tu es hôte : les autres attendent ton signal.` par
`Tu es hôte : le son de la partie sort de ton téléphone.`

---

## Tests à ajouter ou adapter

- `test/client/dom.test.js` / rendu :
  - salon, hôte hors ligne, non-hôte : alerte présente, CTA `Reprendre la main`, pas de bouton `En attente de l'hôte`
  - salon, après reprise : `msgOk` pour le nouvel hôte, `msgInfo` pour les autres et pour l'ancien hôte, qui n'a pas de CTA de reprise
  - `ended`, hôte hors ligne : alerte compacte
  - bouton d'attente : contient le prénom de l'hôte
  - plus d'élément `#counter` ; présence `3 sur 4 en ligne` / `4 en ligne`
  - titre du salon au singulier et au pluriel
- audio : `playFor` muet si non-hôte ou coupé ; aucun son sur `roles`, `word`, `vote1`, `vote2`, `discussion` ; `warn` joué une seule fois par manche.

## Fichiers du bundle

- `maquettes.dc.html` : toutes les maquettes (ouvrir dans un navigateur). Tours 1 à 4, le plus récent en haut.
- `support.js` : runtime nécessaire pour ouvrir la maquette.
- `fonts/`, `img/` : copies des polices et images du dépôt (`public/fonts`, `public/image/frise.jpg`, `title.jpg`), pour la maquette seulement.

## Fichiers du dépôt concernés

- `views/index.ejs` : en-tête (retrait du compteur), barre de phase (présence, pastille Son), conteneur de feuille
- `public/css/style.css` : lots 1, 3, 4, 5
- `public/js/render.js` : helpers de message, `lobby()`, alerte compacte dans les autres écrans, `phaseBar()`
- `public/js/client.js` : état local (`claimSheet`, `presenceSheet`, `muted`), gestion des feuilles, copie de l'adresse, tick du son de 30 s
- `public/js/audio.js` : lot 5
- `public/js/dom.js` : `PHASE_BAR` inchangé ; éventuellement libellés `Hors ligne`
