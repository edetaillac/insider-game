# Handoff : Insider — refonte de l'interface mobile

## Overview

Refonte de l'interface du client web de **insider-game** (Node 22 / Express 5 / socket.io 4 / client vanilla, rendu par `public/js/render.js`). Le jeu se joue à 4-8 joueurs autour d'une table, chacun sur son téléphone. La charte du jeu de société est conservée : rouge, jaune, noir, l'œil et le logo d'origine.

L'objectif n'est pas de changer le moteur de jeu. Le moteur (`src/engine/`), la vue serveur (`src/engine/view.js`) et le protocole socket restent inchangés. **Tout le travail est dans `public/js/render.js`, `public/css/style.css` et `views/layouts/layout.ejs`.**

## À propos des fichiers de design

Les fichiers HTML de ce bundle sont des **références de design**, pas du code à copier en production. Ce sont des prototypes montrant l'apparence et le comportement attendus. La tâche est de **recréer ces designs dans l'environnement existant du dépôt** : client vanilla ES modules, templates string dans `render.js`, CSS maison dans `style.css`. Pas de framework à introduire.

Les prototypes sont écrits avec des styles inline et une petite couche React interne (c'est le format de l'outil de design). **Ne pas reproduire cette structure.** Dans le dépôt, les styles vont dans `style.css` avec des classes, et le markup dans les fonctions de `render.js`.

## Fidélité

**Haute fidélité.** Les couleurs, typographies, tailles, rayons et espacements sont définitifs et doivent être repris à l'identique. Le prototype `Insider - Refonte mobile.dc.html` est la référence pixel.

`Insider - Écrans actuels.dc.html` est la recréation de l'état actuel, pour comparaison avant/après. `Insider - Audit design.dc.html` porte le raisonnement derrière chaque changement — à lire avant d'implémenter, il explique le *pourquoi*.

---

## Design tokens

### Couleurs

| Token | Hex | Usage |
|---|---|---|
| `--red` | `#DE3C31` | Fond de l'application, inchangé |
| `--ink` | `#14100F` | Texte sur rouge, surfaces sombres, action principale. Remplace `#111` |
| `--yellow` | `#FFC107` | **Uniquement sur fond `--ink`.** Secret, privilège du Maître, accent |
| `--cream` | `#FFF7EF` | Texte sur `--ink`, fond des champs de saisie |
| `--muted` | `#9A8F86` | Texte secondaire sur `--ink` |
| `--ink-72` | `rgba(20,16,15,.72)` | Texte secondaire sur rouge |
| `--ink-60` | `rgba(20,16,15,.6)` | Étiquettes en petites capitales sur rouge |
| `--well` | `rgba(0,0,0,.12)` | Encadré de contenu sur rouge |
| `--well-strong` | `rgba(0,0,0,.18)` | Pastille inactive sur rouge |
| `--disabled-bg` | `rgba(0,0,0,.2)` | Bouton inactif |
| `--disabled-fg` | `rgba(20,16,15,.55)` | Texte de bouton inactif |

**Règle de contraste, non négociable :** le jaune ne s'affiche jamais sur le rouge (2,4:1). Il vit sur `--ink` (11:1). Sur le rouge on n'écrit qu'en `--ink` ou en `--cream`. Supprimer `--offline: #7a2d27` : le statut hors-ligne passe par un libellé texte, plus par la couleur seule.

### Typographie

Deux familles, chargées via Google Fonts (`display=swap`) :

- **Oswald** 500 / 600 — titres, chiffres, étiquettes en capitales, libellés de boutons principaux
- **IBM Plex Sans** 400 / 500 / 600 / 700 — corps de texte, noms de joueurs, champs

La pile `"Gill Sans", "Gill Sans MT", Calibri, sans-serif` actuelle n'est résolue sur aucun mobile courant : elle tombe systématiquement en `sans-serif` système. Elle est remplacée.

| Rôle | Famille | Taille | Poids | Autres |
|---|---|---|---|---|
| Titre d'écran XL | Oswald | 42px | 600 | `line-height:1`, `text-transform:uppercase` |
| Titre d'écran | Oswald | 34px | 600 | `line-height:1.05`, uppercase |
| Titre d'écran S | Oswald | 30-32px | 600 | `line-height:1.05`, uppercase |
| Chrono principal | Oswald | 88px | 600 | `line-height:.9`, `letter-spacing:-.01em`, `font-variant-numeric:tabular-nums` |
| Chrono indicatif | Oswald | 52px | 600 | `line-height:1`, tabular-nums |
| Mot révélé (Maître) | Oswald | 46px | 600 | uppercase |
| Nom de rôle sur carte | Oswald | 42px | 600 | uppercase, `line-height:1` |
| Libellé de CTA | Oswald | 19px | 600 | `letter-spacing:.06em`, uppercase |
| Barre de phase | Oswald | 13px | 500 | `letter-spacing:.16em`, uppercase |
| Étiquette de section | Oswald ou Plex | 12-13px | 600 | `letter-spacing:.14em`, uppercase |
| Corps | IBM Plex Sans | 15-16px | 400 | `line-height:1.5` à `1.6` |
| Nom de joueur (ligne) | IBM Plex Sans | 18-19px | 600 | |
| Saisie | IBM Plex Sans | 20px | 600 | |
| Initiale d'avatar | Oswald | 15-22px | 600 | selon la taille du cercle |

### Espacement, rayons, ombres

- Gouttière d'écran : `20px` horizontal
- Espacement vertical entre blocs : `8px` (liste), `14px` / `18px` / `20px` (sections)
- Rayons : `14px` (lignes, encadrés, champs), `16px` (CTA, blocs de contenu), `18px` / `22px` (cartes), `999px` (pastille), `50%` (avatar)
- Ombre de carte : `0 14px 34px rgba(0,0,0,.32)`
- Ombre de CTA : `0 6px 18px rgba(0,0,0,.2)`
- Hauteurs tactiles : CTA `60px`, lignes de liste et de vote `64px`, boutons de vote 1 `76px`, champs `60px`, avatars de liste `40px`, avatars de progression `36px`. **Aucune cible sous 44px.**

---

## Structure commune à tous les écrans

Le cadre est une colonne flex pleine hauteur, en trois zones. Cette structure est la même à chaque phase — c'est le point central de la refonte.

```
┌──────────────────────────┐
│  En-tête (flex:none)     │  fond rouge
│    œil, 34px de haut     │
│    logo, 20px de haut    │
│    compteur joueurs ▸    │  44×44, absolu à droite, centré vertical
├──────────────────────────┤
│  Barre de phase          │  fond #14100F, padding 9px 16px
│  ENQUÊTE          3 / 6  │  Oswald 13px jaune / Plex 12px #9A8F86
├──────────────────────────┤
│                          │
│  Contenu (flex:1)        │  overflow-y:auto, padding 20px 20px 8px
│                          │
├──────────────────────────┤
│  Socle (flex:none)       │  dégradé vers le rouge, padding 12px 20px 26px
│  [note optionnelle]      │  + env(safe-area-inset-bottom)
│  [  ACTION PRINCIPALE  ] │  60px
│  [ action secondaire   ]  │  50px, optionnel
└──────────────────────────┘
```

### En-tête

- `assets/frise.jpg` affiché **une seule fois**, centré, hauteur `34px`. Ce n'est plus un motif répété horizontalement.
- `assets/title.jpg` en dessous, hauteur `20px`, `gap:9px`.
- Padding `16px`.
- Compteur de joueurs : `position:absolute; top:50%; right:16px; transform:translateY(-50%)`, 44×44, rayon 12px, fond `rgba(0,0,0,.14)`, texte `--ink` 14px 700. Ouvre la liste des joueurs (à implémenter en feuille modale ; non maquetté).
- Les deux JPEG ont un fond rouge cuit dans l'image, ils ne fonctionnent que sur `#DE3C31`. Idéalement, les remplacer par des SVG détourés.

### Barre de phase

Visible sur tous les écrans **sauf** l'accueil. Nom de phase à gauche, rang à droite.

| Phase moteur | Libellé | Rang |
|---|---|---|
| `lobby` | Salon | — |
| `roles` (carte) | Les rôles | 1 / 6 |
| `roles` (choix du mot) | Le mot | 2 / 6 |
| `word` | Le mot | 2 / 6 |
| `playing` | Enquête | 3 / 6 |
| `discussion` | Discussion | 4 / 6 |
| `vote1` | Premier vote | 5 / 6 |
| `vote2` / `tiebreak` | Second vote | 6 / 6 |
| `ended` | Résultat | — |

La salutation `C'est parti <prénom>` de `render()` est **supprimée**. Le prénom n'est confirmé qu'à l'arrivée.

### Socle d'action

Fond : `linear-gradient(to top, #DE3C31 62%, rgba(222,60,49,0))`, le contenu défile derrière.
Padding : `12px 20px calc(26px + env(safe-area-inset-bottom))`.
Ajouter `viewport-fit=cover` au meta viewport de `layout.ejs`.

**Règle de couleur des boutons — une seule action principale par écran :**

| Niveau | Style | Usage |
|---|---|---|
| Principal | fond `--ink`, texte `--cream` | l'action qui fait avancer la manche |
| Principal accentué | fond `--yellow`, texte `--ink` | uniquement le privilège du Maître (« Le mot a été trouvé ») |
| Inactif | fond `--disabled-bg`, texte `--disabled-fg` | **avec le motif écrit dans le libellé ou la note au-dessus**, jamais un simple grisé |
| Secondaire | fond transparent, texte `rgba(20,16,15,.8)` | retour, alternative |
| Contour | bordure `2px solid --ink`, fond transparent | alternative de même niveau |

Une note optionnelle de 13px centrée au-dessus du CTA porte l'explication (`« Tu es hôte : les autres attendent ton signal. »`, `« Seul le Maître peut déclarer le mot trouvé. »`).

### Composant : progression collective

Réutilisé sur quatre écrans. Un encadré `--well`, rayon 14px, padding `14px 16px`, contenant :
- une étiquette 13px 600, `letter-spacing:.08em`, uppercase, couleur `--ink-60` : `« 3 sur 5 ont vu leur carte »`
- une rangée d'avatars 36px en `flex; gap:8px; flex-wrap:wrap` — initiale en Oswald 15px 600. **Actif** : fond `--ink`, texte `--yellow`. **Inactif** : fond `--well-strong`, texte `rgba(20,16,15,.45)`.

Les données viennent de la vue serveur (`view.players[].hasVoted`, `envelope.online`). Pour les phases rôle/mot, il faut ajouter au moteur un accusé « j'ai vu ma carte » — voir *Changements côté serveur*.

---

## Écrans

### 1. Rejoindre (`renderJoin`)

**But.** Saisir son prénom et entrer à la table.
**Pas de barre de phase.**

- Titre Oswald 38px 600 uppercase, marge `24px 0 8px` : `Qui es-tu ?`
- Paragraphe 16px, `max-width:30ch`, `--ink-72` : `Ton prénom s'affiche pour les autres joueurs pendant toute la manche.`
- Label 12px 600 uppercase `letter-spacing:.1em` `--ink-60` : `Prénom`
- Champ pleine largeur, `min-height:60px`, padding `0 18px`, Plex 20px 600, `border:0`, rayon 14px, fond `--cream`, texte `--ink`
- Encadré `--well`, rayon 14px, padding `14px 16px`, 13px : `Le premier arrivé devient **hôte** : il lance la partie et gère la table.`
- Socle : CTA principal `Rejoindre la table`

**Erreur de validation.** Zone réservée sous le champ, hauteur fixe, pour éviter le saut de mise en page à l'apparition du message. Messages actuels de `dom.js` conservés (`Ce prénom est déjà pris.`, `Partie en cours, attends la fin de la manche.`).

### 2. Salon (`lobby`)

**But.** Voir qui est là, attendre, lancer.

- Titre Oswald 32px 600 uppercase : `Salon`
- Sous-titre 15px `--ink-72` : `5 joueurs à table · 4 minimum pour lancer` (nombres dynamiques, minimum depuis `envelope.minPlayers`)
- Liste, `flex column; gap:8px`. Chaque ligne : `min-height:60px`, padding `0 12px 0 10px`, rayon 14px, fond `--well`
  - avatar 40px, fond `--ink`, initiale Oswald 17px 600 `--yellow`
  - nom Plex 18px 600 `--ink`
  - statut 12px 600 sous le nom : `Toi` / `En ligne` / `Hors ligne`, couleur `rgba(20,16,15,.65)` (`.5` si hors ligne). **Le statut est écrit, plus seulement coloré.**
  - badge hôte : Oswald 11px 600 `letter-spacing:.14em` uppercase, bordure `1.5px solid rgba(20,16,15,.5)`, rayon 6px, padding `3px 7px`
  - bouton de retrait 44×44 en fin de ligne, `✕` 20px `rgba(20,16,15,.5)`, hover fond `rgba(0,0,0,.12)`. **Demander confirmation avant d'émettre `kick`** — aujourd'hui un mistap exclut un joueur.
- Encadré `--well` 13px : instruction de partage de l'adresse. **Afficher l'URL à partager** — elle manque totalement aujourd'hui alors que c'est la seule action de cet écran.
- Socle, hôte : CTA `Lancer la partie` + note `Tu es hôte : les autres attendent ton signal.` Si `players.length < minPlayers` : CTA inactif, note `Il faut au moins N joueurs.`
- Socle, non-hôte : CTA inactif, note nommant l'hôte.

### 3. Les rôles (`roles`, première moitié)

**But.** Découvrir son rôle en privé.

Écran séparé du choix du mot — aujourd'hui les deux sont empilés.

- Paragraphe centré 15px `--ink-72` : `Personne d'autre ne voit ta carte.`
- **Carte**, pleine largeur, hauteur `250px`, rayon 22px, ombre de carte. Tout le bloc est un bouton.
  - *Face cachée* : fond `--ink`. Un cercle 56px, bordure `3px solid --yellow`, avec une pupille 20px `--yellow` au centre. Titre Oswald 24px 600 `letter-spacing:.1em` uppercase `--cream` : `Ton rôle`. Sous-titre 14px `--muted` : `Touche pour révéler`. `gap:10px`.
  - *Face révélée* : fond `--yellow`, `position:relative; overflow:hidden`. Surtitre 13px 600 `letter-spacing:.14em` uppercase `rgba(20,16,15,.6)` : `Tu es`. Nom Oswald 42px 600 uppercase `--ink`. Phrase 14px `rgba(20,16,15,.75)`, `max-width:32ch`, centrée.
  - **Barre de temps** : `position:absolute; left:0; right:0; bottom:0; height:5px`, fond `--ink`, `transform-origin:left`, animation `shrink 5s linear both` (`transform:scaleX(1)` → `scaleX(0)`). C'est la correction clé : aujourd'hui les 5 secondes d'auto-masquage ne sont annoncées par rien et les joueurs ratent leur rôle.
- Composant de progression : `3 sur 5 ont vu leur carte`
- Socle : CTA `J'ai vu ma carte`

Textes de rôle :

| Rôle | Nom | Phrase |
|---|---|---|
| `master` | Maître du jeu | Tu choisis le mot et tu réponds aux questions. |
| `insider` | Traître | Tu connais le mot. Fais-le trouver sans te faire repérer. |
| `common` | Citoyen | Trouve le mot, puis démasque le Traître. |

### 4. Le mot — Maître (`roles`, seconde moitié)

**But.** Choisir ou tirer le mot.

- Pastille : `display:inline-flex`, padding `7px 12px`, rayon 999px, fond `--ink`, texte `--yellow`, Oswald 12px 600 `letter-spacing:.14em` uppercase : `Tu mènes la manche`
- Titre Oswald 32px 600 uppercase : `Choisis le mot`
- Paragraphe 15px `--ink-72` `max-width:32ch` : `Un nom commun que les autres peuvent deviner par questions fermées.`
- Champ identique à l'accueil, placeholder `Mot à faire deviner`, `maxlength=40`
- Séparateur : deux filets `rgba(20,16,15,.22)` de part et d'autre du mot `ou` en 12px `letter-spacing:.14em` uppercase
- Bouton contour `Tirer un mot au hasard`, `min-height:56px`, bordure `2px solid --ink`, rayon 14px
- Socle : CTA `Valider le mot`, inactif tant que le champ est vide

### 5. Le mot — Citoyen / Traître (attente)

- Trois points 11px `--ink`, animation `breathe 1.4s ease-in-out infinite`, décalés de `.2s` et `.4s` (`opacity` 1 → .45 → 1)
- Titre Oswald 28px 600 uppercase : `<Prénom du Maître> choisit le mot`
- Paragraphe 16px `--ink-72` `max-width:28ch` : `Rien à faire pour l'instant. Pose ton téléphone.`
- Rappel du rôle : encadré `--well`, rayon 16px, padding `16px 18px`, `max-width:300px`, aligné à gauche. Étiquette `Ton rôle`, nom en Oswald 26px 600 uppercase, phrase 14px.
  **Le rôle reste consultable après les 5 secondes.** Le secret est protégé par le fait que chacun regarde son propre téléphone, pas par l'effacement — aujourd'hui il est impossible de le revoir.
- Socle : CTA inactif `Continuer`

### 6. Le rituel du mot (`word`)

**But.** Tout le monde retourne la même carte pendant la même durée. C'est la meilleure mécanique du produit.

Structure identique à l'écran 3, avec une correction déterminante : **les deux faces révélées doivent avoir la même silhouette.**

- Paragraphe centré 15px, `max-width:32ch` : `Tout le monde retourne la même carte, en même temps. Rien ne trahit qui lit vraiment.`
- Face révélée, Maître ou Traître : mot en Oswald 46px 600 uppercase, sous-texte 14px `Ne le dis pas. Réponds seulement oui, non, je ne sais pas.`
- Face révélée, Citoyen : **une seule ligne** en Oswald 22px 600 uppercase — `Tu ne connais pas le mot` — puis le même sous-texte 14px `Garde la carte à l'écran, comme les autres.`
  Aujourd'hui la face neutre est un paragraphe de trois lignes en 16px face à un mot en 30px : les deux faces n'ont ni la même densité ni la même forme, et un coup d'œil sur l'écran voisin trahit immédiatement le Citoyen. Le padding, la position du texte et la barre de temps doivent être rigoureusement identiques entre les deux variantes.
- Barre de temps 5s identique
- Progression : `4 sur 5 ont regardé`
- Socle, hôte : CTA `Lancer le chrono`. Non-hôte : CTA inactif + note `L'hôte lance le chrono quand tout le monde a regardé.`

### 7. L'enquête (`playing`)

**But.** Le chrono tourne, les questions fermées s'enchaînent.

- Chrono centré Oswald 88px 600, `line-height:.9`, tabular-nums, `--ink`. Sous-titre 12px 600 `letter-spacing:.16em` uppercase `--ink-60` : `Temps restant`
- Barre de progression : hauteur 6px, rayon 3px, fond `rgba(0,0,0,.16)`, remplissage `--ink`, largeur = fraction de temps restante
- État urgent (< 30 s) : le chrono passe en `--yellow` **uniquement s'il est posé sur un fond `--ink`** ; sinon garder `--ink` et faire pulser l'opacité. Ne pas mettre de jaune sur le rouge.
- **Bloc Maître** (visible si `me.role === 'master'`) : fond `--ink`, rayon 16px, padding `16px 18px`. Étiquette Oswald 12px 600 uppercase `--muted` `Le mot à faire deviner`, mot en Oswald 34px 600 uppercase `--yellow`, note 13px `--muted` `Visible seulement par toi et le Traître.`
  Le Maître relit le mot en permanence pendant qu'on l'interroge ; aujourd'hui cela exige de retourner une carte à chaque fois. Le Traître reçoit le même bloc.
- **Rappel de règle** (tous) : encadré `--well`, rayon 16px. Étiquette `Règle du tour`, texte 15px : `Questions fermées uniquement. Le Maître ne répond que **oui**, **non** ou **je ne sais pas**. Si le temps s'écoule, tout le monde perd.`
- Socle, Maître : CTA accentué jaune `Le mot a été trouvé`. Autres : CTA inactif + note `Seul le Maître peut déclarer le mot trouvé.`

### 8. Qui a trouvé (écran plein)

Remplace le `<details>` / `<summary>` actuel, qui n'est pas annoncé comme bouton et pousse le contenu vers le bas.

- Titre Oswald 30px 600 uppercase : `Qui a trouvé ?`
- Paragraphe 15px : `Le chrono est en pause pendant ton choix.`
- Une ligne par joueur hors Maître : `min-height:64px`, rayon 14px, fond `--ink`, texte `--cream`, avatar 40px `--yellow` fond / `--ink` texte, nom 19px 600, chevron `→` `--muted` à droite. Hover fond `#2A2320`.
- Socle : action secondaire `Retour au chrono`

### 9. Discussion (`discussion`)

- Bandeau : fond `--ink`, rayon 16px, padding 14px, `flex; gap:12px`. Avatar 44px jaune. Titre Oswald 22px 600 uppercase `--cream` : `<Prénom> a trouvé`. Sous-titre 13px `--muted` avec le mot en `--yellow` 600.
- Encadré `--well`, rayon 16px, padding 18px. Étiquette `Discussion — temps indicatif`, chrono Oswald 52px 600 tabular-nums, texte 15px : `Reprenez le fil des questions. Qui savait déjà ? Qui a orienté ? Le Maître passe au vote quand vous êtes prêts.`
- **Les deux chronos de la manche se distinguent par leur traitement, pas par leur taille.** Le chrono contraignant occupe le haut de l'écran en pleine largeur ; le chrono indicatif vit dans un encadré de contenu avec son étiquette.
- Socle, Maître : CTA `Passer au vote`. Autres : inactif + note.

### 10. Premier vote (`vote1`)

- Surtitre 12px 600 `letter-spacing:.16em` uppercase `--ink-60` : `Vote 1 sur 2`
- Titre Oswald 34px 600 uppercase : `<Prénom> est-il<br>le Traître ?`
- Paragraphe 15px `max-width:32ch` : `Majorité stricte. Si elle est atteinte, la manche s'arrête immédiatement.`
- **Deux boutons empilés, pas juxtaposés** : `flex column; gap:10px`, chacun `min-height:76px`, rayon 16px, padding `0 20px`, `display:flex; justify-content:space-between; align-items:center`, libellé Oswald 26px 600 uppercase, `✓` 20px à droite quand sélectionné
  - `Oui, c'est lui` — non sélectionné : fond `--yellow`, texte `--ink`. Sélectionné : fond `--ink`, texte `--yellow`, `✓`
  - `Non` — non sélectionné : fond `rgba(0,0,0,.14)`, texte `--ink`. Sélectionné : fond `--ink`, texte `--yellow`, `✓`
  Aujourd'hui les deux boutons sont jaunes, identiques, côte à côte à 14px d'écart, pour deux réponses opposées qui décident de la fin de la manche.
- Progression + ligne 13px : `Ton vote reste modifiable tant que tout le monde n'a pas voté.`
- Socle : CTA inactif `Choisis une réponse` → une fois voté, fond `--ink` texte `--yellow`, libellé `Vote enregistré`

**Le vote doit être modifiable** tant que le dernier bulletin n'est pas déposé. À vérifier côté moteur : `vote1` accepte-t-il un second bulletin du même joueur ? Sinon, ajouter le cas.

### 11. Second vote (`vote2`) et égalité (`tiebreak`)

- Surtitre : `Vote 2 sur 2` · Titre Oswald 34px 600 uppercase : `Qui est le Traître ?` · Paragraphe : `Le plus pointé révèle son rôle.`
- Une ligne par candidat : `min-height:64px`, rayon 14px, bordure `2px`, `flex; gap:12px`, avatar 40px, nom 19px 600, marque à droite
  - non sélectionné : fond `--well`, texte `--ink`, bordure transparente, avatar fond `--well-strong` / texte `rgba(20,16,15,.6)`
  - sélectionné : fond `--ink`, texte `--cream`, bordure `--ink`, avatar `--yellow` / `--ink`, `✓`
- `Personne — il n'y a pas de Traître` (candidat `center`) : bouton pleine largeur `min-height:60px`, **bordure `2px dashed`**, séparé du groupe par `margin-top:14px`. Non sélectionné : bordure `rgba(20,16,15,.35)`, texte `rgba(20,16,15,.75)`. Sélectionné : fond `--ink`, texte `--cream`.
  Aujourd'hui cette option a un style d'annulation alors que c'est un vote de même nature.
- Progression
- Socle : CTA inactif `Choisis un joueur` → `Confirmer mon vote` une fois une ligne sélectionnée. **Sélection puis confirmation, deux gestes.** Aujourd'hui le vote part au premier tap sur un choix qui désigne nommément quelqu'un.

**Égalité** : même composant de ligne, titre court `Égalité` au lieu de la phrase actuelle `Égalité entre X (2) et Y (2)`, et le score affiché dans la ligne de chaque candidat. Pour les joueurs qui ne départagent pas, l'attente nomme la personne qui tranche.

### 12. Résultat (`ended`)

Trois temps, hiérarchie décroissante.

1. Surtitre 12px uppercase `Fin de la manche`, puis l'issue en Oswald 42px 600 uppercase `line-height:1` — `Les Citoyens gagnent`, `Le Traître gagne`, `Tout le monde gagne`, `Le temps est écoulé` (textes de `outcomeSentence` dans `dom.js`, conservés)
2. Révélation : `flex; gap:14px`, padding 16px, rayon 18px, fond `--ink`. Avatar 52px `--yellow`. Étiquette Oswald 12px uppercase `--muted` `Le Traître était`, nom Oswald 28px 600 uppercase `--cream`. Variante sans traître : `Il n'y avait pas de Traître`, sans avatar.
3. Le mot : encadré `--well`, rayon 14px, padding `14px 16px`, `flex; align-items:baseline; gap:10px`. Étiquette 13px uppercase `Le mot`, valeur Oswald 26px 600 uppercase.
4. Les votes : étiquette 13px uppercase `Les votes`, puis une barre par candidat. Nom et compte sur une ligne (16px 600, compte en tabular-nums), barre `height:10px; border-radius:5px`, piste `rgba(0,0,0,.14)`, remplissage proportionnel au maximum — `--ink` pour le plus pointé, `rgba(20,16,15,.4)` pour les autres.
   Remplace la liste de chiffres nus actuelle : on lit un écart, pas des nombres.
- Socle : CTA `Rejouer une manche` + action secondaire `Retour au salon`. Aujourd'hui les deux sont côte à côte au même niveau.

### 13. États système

- **Bandeau de reconnexion** : pousse le contenu vers le bas au lieu de le recouvrir. Fond `--ink`, texte `--yellow`, 8px, centré, 700.
- **Toast d'erreur** : se place **au-dessus du socle d'action**, jamais par-dessus. Fond `--ink`, texte `--cream`, rayon 10px, padding `12px 18px`, ombre `0 8px 20px rgba(0,0,0,.3)`, `role="status"`. Messages de `ERROR_MESSAGES` dans `dom.js`, conservés.
- Aujourd'hui les deux partagent `z-index:10` : le bandeau masque le haut, le toast couvre le bouton principal pendant 3 secondes.

---

## Interactions et animations

| Nom | Déclencheur | Détail |
|---|---|---|
| `shrink` | révélation d'une carte à masquage auto | `transform: scaleX(1)` → `scaleX(0)`, `5s linear both`, `transform-origin:left`. Doit être **synchronisée** avec le `AUTOHIDE_MS = 5000` de `client.js`. |
| `breathe` | attente | `opacity` 1 → .45 → 1, `1.4s ease-in-out infinite`, trois points décalés de `.2s` |
| `rise` | entrée d'écran | `opacity:0; translateY(8px)` → `none`, `.25s ease both` |
| Retournement de carte | tap sur la carte | Le prototype bascule le contenu. Dans le dépôt, conserver la rotation 3D existante (`rotateY`, `.55s cubic-bezier(.2,.8,.2,1)`, `backface-visibility:hidden`) — elle fonctionne bien. |
| Hover | pointeur uniquement | À placer sous `@media (hover: hover)`, sans quoi l'état reste collé après un tap sur mobile. |

Respecter `prefers-reduced-motion: reduce` : couper `breathe` et `rise`, **garder `shrink`** (elle porte une information de temps, pas une décoration).

## État

Aucun état nouveau côté client au-delà de ce qui existe. Le prototype simule :

- `flipped` — carte retournée, remis à `false` à chaque changement de phase
- `v1` — `'yes' | 'no' | null`, réponse locale au vote 1
- `v2` — identifiant de candidat ou `'center'` ou `null`, sélection locale au vote 2 avant confirmation

Le reste vient de l'enveloppe socket existante : `view.phase`, `view.me`, `view.players`, `view.word`, `view.master`, `view.finder`, `view.timer`, `view.candidates`, `view.tallies`, `view.result`, `view.actions`, `envelope.online`, `envelope.minPlayers`, `envelope.serverTime`.

### Changements côté serveur nécessaires

Trois seulement :

1. **Accusé « j'ai vu ma carte »** pour les phases `roles` et `word`. Nouvelle commande, et un champ par joueur dans la vue (`hasSeenRole`, `hasSeenWord`). Sans cela les états de progression des écrans 3 et 6 ne peuvent pas être alimentés.
2. **Vote 1 modifiable** tant que le dernier bulletin n'est pas déposé, si le moteur ne l'autorise pas déjà.
3. **URL de partage** exposée au salon, pour l'écran 2.

## Assets

| Fichier | Origine | Note |
|---|---|---|
| `assets/title.jpg` | `public/image/title.jpg` du dépôt | 235×70 environ, fond rouge cuit dans l'image |
| `assets/frise.jpg` | `public/image/frise.jpg` du dépôt | 103×50, un œil, fond rouge cuit. Utilisé **une fois** dans l'en-tête, plus en motif répété |

Les deux ne fonctionnent que posés sur `#DE3C31`. Les redessiner en SVG détouré serait une amélioration nette : ils deviendraient utilisables sur fond sombre, se redimensionneraient proprement et pèseraient moins.

Aucune icône externe. Les quelques glyphes utilisés (`✕`, `✓`, `→`) sont des caractères Unicode ; les passer en SVG inline si le rendu varie entre plateformes. **Retirer Font Awesome et Bootstrap** de `layout.ejs` : 250 ko bloquants pour six glyphes et quatre classes de boutons, dont la quasi-totalité est déjà redéfinie dans `style.css`.

## Fichiers de ce bundle

| Fichier | Contenu |
|---|---|
| `Insider - Refonte mobile.dc.html` | Prototype cliquable de la refonte. 11 phases enchaînées, bascule Maître / Citoyen. **Référence pixel.** |
| `Insider - Écrans actuels.dc.html` | Recréation fidèle de l'interface actuelle, pour comparaison |
| `Insider - Audit design.dc.html` | L'audit complet : 6 constats transversaux, un passage écran par écran, priorisation |
| `support.js` | Runtime des prototypes. Aucun intérêt pour l'implémentation. |
| `assets/` | Logo et œil, repris du dépôt |

Ouvrir les `.dc.html` directement dans un navigateur.

## Ordre d'implémentation suggéré

**Fort impact, faible coût** — se tient dans `style.css` et la coquille de `render()` :
1. En-tête compact, barre de phase, suppression de la salutation
2. Socle d'action fixe avec `env(safe-area-inset-bottom)` et `viewport-fit=cover`
3. Règle de couleur des boutons appliquée partout
4. Retrait du jaune sur fond rouge
5. Barre de temps visible sur les cartes à masquage automatique

**Ensuite** — demande les changements serveur :
6. États d'attente chiffrés (écrans 3, 6, 10, 11)
7. Refonte des deux votes : sélection, confirmation, état visible
8. Bloc « mot en clair » pour le Maître pendant l'enquête
9. Alignement des deux faces de la carte du rituel
10. Écran de résultat en trois temps

**Chantier de fond :**
11. Sortie de Bootstrap et Font Awesome
12. Accessibilité : `role="status"` sur le toast, `aria-live` déplacé sur la région de phase plutôt que sur tout `#screen`, contrastes vérifiés
