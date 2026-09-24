# Handoff : repasse UX, UI et gameplay

## Vue d'ensemble

Treize corrections validées par le produit le 24/09/2026, après l'implémentation du handoff `2026-09-24` (reprise de l'hôte, coquille, son). Trois familles :

- **Tells (1, 2)** : aucun écran ne doit permettre de deviner un rôle à distance. C'est le prolongement de l'ADR D6.
- **Gameplay (3 à 6)** : fidélité au livret, lisibilité du résultat et des votes.
- **UX et UI (7 à 13)** : états d'attente, identité des joueurs, cohérence typographique.

Ordre d'implémentation conseillé : 1, 2, 7 (ils partagent des composants), puis 3, 6, 4, 5, puis 8 à 13.

## À propos des fichiers de design

`maquettes.dc.html` est une **référence de design en HTML** : ouvrir dans un navigateur, avec `support.js` dans le même dossier. Ce n'est pas du code à copier, tout y est en styles inline. Il faut **recréer ces écrans dans le client existant** en suivant ses conventions :
- classes dans `public/css/style.css` ;
- rendu en chaînes HTML dans `public/js/render.js` ;
- commandes serveur via `data-cmd`, actions locales via `data-ui` ;
- règles de jeu dans `src/engine/game.js` et `view.js`.

Repères dans la maquette :
- `5a` : enquête, au repos, identique pour tous les rôles ;
- `5b` : enquête, appui maintenu (Traître) ;
- `5c` : choix du mot, vue d'un joueur ;
- `5d` : résultat, vue hôte.

## Fidélité

**Haute fidélité.** On réutilise les tokens existants (`--red`, `--ink`, `--yellow`, `--cream`, `--muted`, `--well`, `--well-strong`, `--muted-strong`, `--sheet-muted`) et les composants du handoff précédent (`.msg-alert`, `.msg-alert.compact`, feuilles, barre de phase). Largeur de référence : 375 px.

---

## 1 · Enquête : même écran pour tous les rôles

**Problème.** Pendant `playing`, seuls le Maître et le Traître ont le bloc `.dark` avec le mot. Les téléphones sont posés sur la table pendant 5 minutes : la silhouette de l'écran trahit le Traître.

**Règle.** À l'écran d'enquête, un Citoyen et le Traître doivent avoir **exactement** le même rendu au repos : même DOM, même taille, mêmes couleurs.

### Composant « bloc secret » (nouveau, réutilisé au point 2)

`secretBlock({ label, reveal, revealCls, hint })` dans `render.js`, classe `.secret`.

Au repos (5a) :
- bouton plein largeur, hauteur min 84 px, padding `16px 18px`, rayon 16 px, fond `--ink`, texte `--cream`, gap 14 px, en flex centré verticalement ;
- œil à gauche : cercle 40 px, bordure `2.5px solid var(--yellow)`, point central 14 px `--yellow` (même motif que `.card-eye`, en plus petit) ;
- libellé : Oswald 600 12 px, `letter-spacing:.14em`, capitales, `--muted` (`Le mot`) ;
- indication : Oswald 600 20 px capitales `--cream` (`Maintiens pour voir`).

Appui maintenu (5b) :
- fond `--yellow`, texte `--ink`, `transform:scale(.98)` ;
- l'œil disparaît ; libellé `Le mot` (Oswald 12 px) ;
- valeur : Oswald 600 34 px capitales, interligne 1, `overflow-wrap:anywhere` ;
- **hauteur identique au repos** (min-height 84 px, la valeur tient sur une ligne ; au-delà, coupure autorisée mais même hauteur minimale).

Contenu révélé selon le rôle :
- Traître : le mot ;
- Citoyen : `Tu ne connais pas le mot`, en Oswald 22 px (même classe `.neutral` que la carte du rituel du mot).

Maître : le bloc est **ouvert en permanence** (son rôle est public), avec le libellé `Le mot à faire deviner`. On garde l'actuel `.dark`, qui ne trahit rien.

Interaction :
- `pointerdown` révèle, `pointerup`, `pointercancel`, `pointerleave` et `blur` masquent ; pas de minimum de durée ;
- clavier : `Espace` ou `Entrée` maintenus révèlent, le relâchement masque ;
- `aria-pressed` suit l'état ; `aria-label="Le mot, maintenir pour voir"` ;
- `touch-action:none; user-select:none; -webkit-touch-callout:none` pour éviter la loupe et le menu contextuel iOS ;
- **pas de son, pas de vibration** ;
- l'état est local et se perd au re-rendu (le rendu par défaut est toujours masqué).

Dans `playing()` :
- supprimer le `wordBlock` conditionnel ;
- insérer `secretBlock` pour **tous** les joueurs sauf le Maître, à la même place (sous la barre du chrono, `margin-top:20px`), puis `RULE_WELL` (`margin-top:14px`) ;
- supprimer les notes `Visible seulement par toi et le Traître.` et `Tu connais le mot. Personne ne doit le deviner sur ton visage.` : elles différenciaient les écrans.

Côté vue (`view.js`) : rien ne change pour les données. Le Citoyen reçoit toujours `word: null` ; le texte neutre est local.

### Chrono

Le passage en bloc sombre (`.timer-block.urgent`) reste à 30 s, identique pour tous. Vérifier qu'aucune autre classe ne dépend du rôle sur cet écran.

### Tests

- `render(playing)` pour un Citoyen et pour le Traître : même HTML, une fois le mot et le texte révélé retirés (les comparer après avoir retiré le contenu de `.secret-reveal`).
- Le Maître a le bloc ouvert, sans « Maintiens ».

---

## 2 · Rôle masqué pendant l'attente

**Problème.** Dans `roles()`, une fois la carte vue et quand on n'est pas Maître, `roleRecall()` affiche `Ton rôle : Traître` en clair alors que l'écran dit de poser le téléphone.

**Écran 5c** (remplace la branche « attente du mot » de `roles()`) :
- bloc centré, `padding-top:36px` ;
- avatar du Maître 64 px, `.avatar.ink`, Oswald 26 px ;
- titre `.h2` (32 px, voir point 10) : `{masterName} choisit le mot`, `margin-top:16px` ;
- `.lead` (`max-width:28ch`, `margin-top:8px`) : `{masterName} est le Maître du jeu. Pose ton téléphone, écran vers la table.` ;
- `secretBlock` en variante claire, `margin-top:36px` :
  - au repos : fond `--well`, hauteur min 72 px, padding `14px 18px`, œil 36 px à bordure `2px solid var(--ink)` et point 12 px `--ink`, libellé `.label` `Ton rôle`, indication 15 px 600 `Maintiens pour le revoir` ;
  - appui : fond `--yellow`, rôle en Oswald 26 px capitales (`ROLE_LABELS`), dessous l'indice du rôle (`ROLE_HINTS`) en 14 px ;
  - même interaction qu'au point 1.
- supprimer les `dots()` de cet écran (remplacés par le bas d'écran d'attente, point 7) et `roleRecall()` s'il n'est plus utilisé ailleurs.

Bas d'écran : attente (point 7), texte `Le mot arrive dans un instant`.

---

## 3 · Seul le Maître déclare le mot trouvé et clôt la discussion

**Livret :** A-5 (le Maître dit « oui ») et B-1 (le Maître clôt la discussion).

`src/engine/game.js`, `canAct` :
```js
case 'wordFound':
case 'closeDiscussion':
    return isMaster || (isHost && !masterOnline);
case 'startTimer':
    return isMaster || isHost; // inchangé
```
La présence ne vit pas dans le moteur. Deux options, à choisir selon l'architecture :
- (a) la table passe `deps.online` ou un `game.masterAway` mis à jour par la table, comme pour `setHost` ;
- (b) le serveur (`table.js`) filtre `wordFound` et `closeDiscussion` venant de l'hôte quand le Maître est en ligne.

**Préférer (a)** pour que `allowedActions`, donc les boutons, reste juste.

Rendu :
- `playing()`, non-Maître et non-hôte de repli : bas d'écran d'attente `{masterName} déclarera le mot trouvé` ;
- `discussion()`, non-Maître : attente `{masterName} passe au vote quand vous êtes prêts` ;
- hôte avec Maître absent : il garde le bouton, avec la note `{masterName} est hors ligne, tu peux déclarer à sa place.` ;
- mettre à jour `MASTER_NEXT` et `masterCarries()` si besoin (ils supposent déjà que le Maître porte ces phases).

Tests moteur :
- `wordFound` et `closeDiscussion` par l'hôte non Maître, Maître en ligne : `FORBIDDEN` ;
- Maître hors ligne : `ok`.

---

## 4 · Résultat qui raconte la manche (5d)

Ordre du contenu de `ended()` :

1. **Supprimer le surtitre** `Fin de la manche` (la barre dit « Résultat »).
2. Titre `.h-xl` 42 px (inchangé) : `outcomeTitle(r)`.
3. **Phrase de décision** `.p` 15 px, `margin-top:8px`, via une nouvelle fonction `outcomeStory(view)` dans `dom.js` :

| `reason` | Condition | Phrase |
|---|---|---|
| `vote1` | le trouveur est le Traître | `Au vote 1, {yes} joueurs sur {n} ont accusé {finder}. C'était bien le Traître.` |
| `vote1` | le trouveur est Citoyen | `Au vote 1, {yes} joueurs sur {n} ont accusé {finder}, qui était Citoyen.` |
| `vote2` | Traître pointé | `Au vote 2, {pointed} a été le plus pointé. C'était bien le Traître.` |
| `vote2` | Citoyen pointé | `Au vote 2, {pointed} a été le plus pointé, mais c'était un Citoyen.` |
| `vote2` | centre pointé, pas de Traître | `La majorité a vu juste : il n'y avait pas de Traître.` |
| `vote2` | centre pointé, il y avait un Traître | `La majorité a pointé « Personne », mais il y avait un Traître.` |
| `vote2` | Citoyen pointé, le Traître était au centre | `Il n'y avait pas de Traître, et un Citoyen a été accusé.` |
| `tiebreak` | (les cas du vote 2) | préfixe `Égalité au vote 2, {finder} a départagé.` puis la fin de phrase correspondante |
| `timeout` | | `Personne n'a trouvé le mot avant la fin du chrono.` |

   Accord : `joueur` ou `joueurs` selon `{yes}`.

4. **Bloc de révélation** `.reveal`, `margin-top:16px`, avec le mot à droite :
   - gauche : avatar 52 px or, `Le Traître était` et le nom ; sans Traître : `Il n'y avait pas de Traître` ;
   - droite (`text-align:right`) : `.dark-label` `Le mot`, dessous le mot en Oswald 600 20 px capitales `--yellow` ;
   - supprimer l'ancien encadré `.word-line`.
5. **Les rôles** : `.label` `Les rôles`, `margin:20px 0 8px`. Encadré `--well`, rayon 14 px, padding `4px 14px`. Lignes de 40 px minimum, séparateur `1px solid rgba(20,16,15,.15)`, 15 px, nom en 600 à gauche, rôle à droite :
   - `{Maître}` : `Maître du jeu`
   - `{Traître}` : `Traître`, en 700 ; ajouter ` · a trouvé` si c'est le trouveur
   - trouveur Citoyen : `Citoyen · a trouvé`
   - autres Citoyens **regroupés sur une ligne** : `Manu, Marie, Karim` / `Citoyens`
   - en variante, dernière ligne : `Carte du centre` en italique / `Traître` ou `Citoyen`
6. Les barres de votes (`tallies`) restent, **sous** les rôles, **seulement pour le vote 2 et le départage**. Pour le vote 1, la phrase de décision suffit : supprimer la barre unique.

Vue (`view.js`) : en phase `ended`, exposer `roles: Record<PlayerId, Role>` et `centerCard: Role | null` à tous. Aujourd'hui, seul `insiderId` est exposé.

Bas d'écran : inchangé (`Rejouer une manche`, `Retour au salon`, bouton secondaire en 17 px).

---

## 5 · Annoncer la variante sans Traître

Quand `settings.traitorOptional` est vrai :
- **Salon**, sous le sous-titre (`.p`, `margin-top:4px`) : `Variante : il peut n'y avoir aucun Traître.` Exposer `traitorOptional` dans l'enveloppe ou la vue.
- **Carte de rôle** (`card-text` au dos), Citoyen et Maître seulement : ajouter une seconde phrase à `ROLE_HINTS` :
  - Citoyen : `Trouve le mot, puis démasque le Traître, s'il y en a un.`
  - Maître : `Tu choisis le mot et tu réponds aux questions. Il peut n'y avoir aucun Traître.`
  - Traître : inchangé.
- Vérifier que les deux lignes réservées de `.card-text` (`min-height: calc(2 * 1.45em)`) suffisent ; sinon passer à 3 lignes **pour tous les rôles** (même silhouette, ADR D6).

---

## 6 · Confirmer le vote, dans les deux votes

**Problème.** Au vote 1, le tap enregistre tout de suite. Le dernier votant clôt le vote sans pouvoir se reprendre, alors que l'écran dit « Ton vote reste modifiable ».

**Nouveau parcours**, identique aux votes 1 et 2 :
1. Un tap sur une option la **sélectionne** en local (`local.v1` / `local.v2`), sans commande envoyée.
2. Le bas d'écran propose `Voter` (`.btn-primary`), actif dès qu'une option est choisie. Au vote 2 et au départage, le libellé actuel `Confirmer mon vote` devient `Voter` pour aligner les deux votes.
3. Après envoi : `Vote enregistré` (`.btn-registered`, inchangé).
4. Toucher une autre option après envoi la resélectionne, et `Voter` revient pour renvoyer.

Textes :
- sans sélection : bas d'écran d'attente (point 7) `Choisis une réponse` au vote 1, `Choisis un joueur` au vote 2 ;
- la phrase sous la progression devient `Ton vote reste modifiable jusqu'au dernier votant.`

Client : `select-v1` ne doit plus envoyer `vote1`. Ajouter une action `confirm-v1`, ou généraliser `confirm-vote`.

---

## 7 · Un bas d'écran d'attente à la place des boutons morts

Nouveau helper `waitDock(text)`, classe `.dock-wait`. Il remplace **tous** les `disabledButton()` utilisés comme état d'attente.

Style :
```css
.dock-wait { display:flex; align-items:center; justify-content:center; gap:12px; min-height:60px; padding:0 18px; border-radius:16px; box-shadow:inset 0 0 0 2px rgba(20,16,15,.3); color:var(--ink); font-weight:600; font-size:15px; text-align:center; }
.dock-wait .wait-dots { display:flex; gap:5px; flex:none; }
.dock-wait .wait-dots i { width:8px; height:8px; border-radius:50%; background:var(--ink); animation:breathe 1.4s ease-in-out infinite; }
.dock-wait .wait-dots i:nth-child(2) { animation-delay:.2s; }
.dock-wait .wait-dots i:nth-child(3) { animation-delay:.4s; }
@media (prefers-reduced-motion: reduce) { .dock-wait .wait-dots i { animation:none; } .dock-wait .wait-dots i:nth-child(2) { opacity:.6; } .dock-wait .wait-dots i:nth-child(3) { opacity:.3; } }
```
- Élément `<div role="status">`, pas un bouton : ni focusable ni tappable.
- **Pas de `.dock-note` au-dessus** : la phrase du bas d'écran suffit. Exception : les notes d'explication d'un vrai bouton restent.

Remplacements :

| Écran | Avant | Après |
|---|---|---|
| Salon, non-hôte | note + `En attente de {host}` | `{host} lance la partie quand tout le monde est là` |
| Salon, hôte, pas assez de joueurs | note + `Lancer la partie` grisé | **garder** le bouton grisé et la note `Il faut au moins N joueurs.` : c'est une action à venir pour ce joueur |
| Rôles, carte pas encore retournée | note + bouton grisé | **garder** : action à venir pour ce joueur |
| Choix du mot, non-Maître | `Continuer` grisé | `Le mot arrive dans un instant` |
| Le mot, déjà vu, sans `startTimer` | note + `Lancer le chrono` grisé | `{master} lance le chrono quand tout le monde a regardé` |
| Enquête, sans `wordFound` | note + bouton grisé | `{master} déclarera le mot trouvé` |
| Discussion, sans `closeDiscussion` | note + bouton grisé | `{master} passe au vote quand vous êtes prêts` |
| Vote 1 ou 2, rien de choisi | `Choisis une réponse` / `Choisis un joueur` grisé | attente avec le même texte |
| Départage, pas le trouveur | note + `En attente` | `{finder} départage entre les ex aequo` |
| Résultat, non-hôte | note + `En attente de {host}` | `{host} relance quand vous êtes prêts` |

Règle : on garde un bouton grisé **seulement** quand ce joueur pourra agir (pré-requis manquant). S'il n'agira pas, on affiche l'attente.

Le flag `waiting` retourné par les écrans (utilisé pour substituer la reprise d'hôte) doit rester vrai dans tous les cas « Après » ci-dessus.

---

## 8 · Initiales distinctes

Dans `dom.js`, nouvelle fonction `initials(players)` → `Map<PlayerId, string>` :
- par défaut, la première lettre en capitale ;
- si plusieurs joueurs partagent la même initiale : première lettre + première consonne suivante en minuscule (`Manu` → `Mn`, `Marie` → `Mr`). Si c'est encore ambigu, première lettre + deuxième lettre (`Ma`, `Mr`). Garder au plus 2 caractères.

`avatar()` reçoit l'initiale calculée au lieu du nom. Mettre à jour tous les appels : lignes, progression, candidats, trouveur, présence, feuilles, résultat.

À 2 caractères, la taille de police baisse d'un cran : 36 px → 13 px, 40 → 15, 44 → 16, 52 → 19, 22 (pastilles de présence) → 9.

**Progression** : le prénom passe sous chaque pastille.
- chaque élément est une colonne centrée, gap 4 px, prénom en 11 px 600, tronqué avec des points de suspension à 52 px de large ;
- joueur pas encore fait : pastille `--well-strong`, prénom en 500 ;
- gap entre éléments : 10 px, retour à la ligne autorisé.

---

## 9 · Supprimer les surtitres en double

- `vote1()` : supprimer `<p class="eyebrow">Vote 1 sur 2</p>`.
- `vote2()` et `tiebreak()` : supprimer `Vote 2 sur 2`.
- `ended()` : supprimer `Fin de la manche` (voir point 4).
- La barre de phase (`Premier vote 5/6`, `Second vote 6/6`, `Résultat`) porte seule le contexte.

---

## 10 · Une seule taille de titre d'écran

| Usage | Classe | Taille |
|---|---|---|
| Titre d'écran, partout | `.h2` | 32 px, interligne 1.05 |
| Titre du résultat seulement | `.h-xl` | 42 px, interligne 1 |

- `roles()` attente : `.h3` → `.h2`.
- `vote1()`, `vote2()`, `tiebreak()` : `.h1` → `.h2`. Garder `<br>` si besoin au vote 1.
- `renderJoin()` : le `<h1 class="h1" style="font-size:38px…">` devient `.h2` avec `margin:24px 0 8px` par classe (voir point 13).
- Supprimer `.h1` et `.h3` de `style.css` s'ils ne sont plus utilisés.
- Les balises `<h1>` restent sémantiques : une par écran.

---

## 11 · Vote 1 sans accord de genre

- Titre : `{finder}, Traître ?`
- Options : `Oui, Traître` / `Non`
- Toast de vote : inchangé.

---

## 12 · Le jaune réservé à l'action exceptionnelle

- `playing()` : `Le mot a été trouvé` chez le Maître passe de `btn-accent` à `btn-primary`.
- Règle, à documenter en commentaire au-dessus de `.btn-accent` : jaune = action exceptionnelle qui débloque la table (`Reprendre la main`). Rien d'autre.
- Les options de vote `.opt-yes` en jaune ne sont pas des CTA : elles ne changent pas.

---

## 13 · Styles inline hors de render.js

Remplacer chaque `style="…"` de `render.js` par une classe. Liste relevée :

| Occurrence | Classe proposée |
|---|---|
| `style="margin:0 auto 14px"` sur `.p` (rôles, mot) | `.intro` : `margin:0 auto 14px; text-align:center; max-width:32ch` |
| `style="max-width:28ch"` sur `.lead` | `.lead.narrow` : `max-width:28ch` |
| `style="margin:0"` dans `roleRecall` | supprimé avec le point 2 |
| `style="margin-top:4px"` sur le sous-titre du salon | `.sub` : `margin-top:4px` |
| `style="margin:8px 0 0"` sur l'eyebrow du chrono | `.eyebrow.below` : `margin:8px 0 0` |
| `style="margin-top:10px"` dans la discussion | `.mt-10` |
| `style="font-size:13px"` sous la progression du vote 1 | `.p.small` : `font-size:13px` |
| `style="font-size:38px;margin:24px 0 8px"` dans `renderJoin` | `.h2.join-title` : `margin:24px 0 8px` (38 px abandonné, voir point 10) |
| `style="width:…%"` sur `.tally-fill` | **garder** : c'est une valeur dynamique |

Test : `grep -n 'style="' public/js/render.js` ne doit plus renvoyer que `.tally-fill`.

---

## Question ouverte

**Point 1 : maintenir le doigt, ou taper pour afficher 3 s ?** La recommandation (et les maquettes) : maintenir. C'est plus discret, l'écran ne reste pas jaune sur la table. Si les tests à table montrent que le geste n'est pas compris, passer au tap : 3 s d'affichage, barre de temps comme sur les cartes, identique pour tous.

## Fichiers du bundle

- `maquettes.dc.html` : les 13 constats et les maquettes 5a à 5d (ouvrir dans un navigateur).
- `support.js` : runtime nécessaire pour ouvrir la maquette.
- `fonts/`, `img/` : copies des polices et images du dépôt, pour la maquette seulement.

## Fichiers du dépôt concernés

- `src/engine/game.js` : point 3 (`canAct`)
- `src/engine/view.js` : points 4 (`roles` et `centerCard` en fin de manche) et 5 (`traitorOptional`)
- `src/server/table.js` : point 3 (présence du Maître)
- `public/js/render.js` : tous les points
- `public/js/dom.js` : points 4 (`outcomeStory`), 5 (`ROLE_HINTS`) et 8 (`initials`)
- `public/js/client.js` : points 1 et 2 (appui maintenu), 6 (sélection sans envoi)
- `public/css/style.css` : points 1, 2, 4, 7, 8, 10, 12, 13
- `test/engine/*`, `test/client/render.test.js` : tests listés dans chaque point
- `docs/adr/0001-regles-du-jeu.md` : ajouter D7 (même écran d'enquête pour tous, prolongement de D6) et D8 (`wordFound` et `closeDiscussion` réservés au Maître, l'hôte seulement si le Maître est hors ligne)
