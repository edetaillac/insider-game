---
date: 2026-09-17
contexte: Confrontation des règles officielles Insider (livret Oink Games, 2e impression sept. 2016, scan dans public/pdf/regle.pdf) avec le comportement du code actuel, pour figer les règles que le moteur de jeu devra implémenter et tester
statut: proposé, à valider par Manu avant le premier test du moteur
---

# ADR 0001, règles du jeu à implémenter

## TL;DR

Les deux "élargissements" de mémoire ne sont pas des adaptations : le mot libre est une option du livret ("Choisir un thème librement") et l'absence de Traître est la variante officielle des règles avancées. Le code de 2020 est fidèle à l'esprit du jeu mais il manque quatre mécaniques officielles : la défaite quand le sablier expire, la résolution automatique du premier vote à la majorité, le départage d'une égalité au second vote par le joueur qui a trouvé, et la phase de discussion. Il ne sait pas non plus qui a trouvé le mot, ce qui bloque deux de ces mécaniques.

Les quatre questions laissées ouvertes par le comité ont une réponse dans le livret. Reste cinq décisions à prendre, listées en fin de document.

## Règles officielles, résumé opérationnel

Partie de 4 à 8 joueurs (4 à 7 avec la variante sans Traître). Deux camps : Citoyens et Maître du jeu contre le Traître.

A. Coopération
- A-1, A-2 : un Maître du jeu, un Traître, le reste Citoyens. Seul le Maître se révèle
- A-3 : le Maître tire un thème, le Traître en prend connaissance en secret. Option officielle : le Maître écrit son propre thème
- A-4 : le Maître retourne le sablier. Citoyens et Traître posent des questions fermées. Réponses autorisées : Oui, Non, Je ne sais pas
- A-5 : quand un joueur trouve, le Maître dit "oui" et clôt la phase. Si le sablier expire sans réponse, tous les joueurs perdent

B. Accusation
- B-1 Discussion : le Maître retourne le sablier de nouveau (le temps de discussion est donc le temps consommé en A-4). Tous discutent pour deviner le Traître. Le Maître clôt quand le groupe a une conclusion, avant la fin du sablier
- B-2 Jugement du joueur qui a trouvé : tous les joueurs, Maître inclus, lèvent la main s'ils pensent que le trouveur est le Traître. Majorité stricte requise (à 6 joueurs, 4 mains). Si majorité : le trouveur révèle sa carte, s'il est le Traître les Citoyens gagnent, s'il est Citoyen le Traître gagne, la partie s'arrête. Si minorité : on passe au vote B-3
- B-3 Vote : tous les joueurs, trouveur inclus, pointent celui qu'ils pensent être le Traître. Le plus pointé révèle sa carte : Traître, les Citoyens gagnent ; Citoyen, le Traître gagne. Égalité : le joueur qui a trouvé départage entre les ex aequo

Règles avancées, variante "Il n'y a pas de Traître ?" (4 à 7 joueurs)
- Préparation : on retire la carte Maître, on mélange les n-1 cartes restantes (1 Traître, n-2 Citoyens), on en retire une au hasard face cachée au centre de la table, on la remplace par une carte Citoyen, on remet le Maître, on distribue. La carte du centre est donc le Traître avec probabilité 1/(n-1)
- Si personne n'a trouvé : après discussion, le Maître peut retourner une carte (celle d'un joueur ou celle du centre). Si c'est le Traître, les Citoyens gagnent. Sinon tout le monde perd
- Avant la confrontation : le trouveur peut regarder en secret une carte Rôle (un joueur ou le centre) et dire ce qu'il veut, y compris mentir
- Vote B-3 : on peut pointer la carte du centre. Si le centre est le Traître et qu'une majorité pointe un Citoyen, tous perdent. Si une majorité pointe le centre, tout le monde gagne

## Conformité du code actuel

| Mécanique | Livret | Code 2020 (après P0) | Écart |
|---|---|---|---|
| Nombre de joueurs | 4 à 8, 4 à 7 avec variante | aucune borne | à borner dans le lobby |
| Rôles | 1 Maître, 1 Traître, Citoyens | idem | conforme |
| Thème | carte ou thème libre du Maître | liste de 855 mots ou saisie du Maître | conforme |
| Sablier | durée du sablier physique | 300 s serveur | conforme, durée à confirmer |
| Réponses | Oui, Non, Je ne sais pas | hors application (oral) | conforme |
| Fin de sablier | tous perdent | son "dong", rien d'autre | manquant |
| Qui a trouvé | connu de tous | non modélisé, "Mot trouvé" sans nom | manquant, bloque B-2 et l'égalité B-3 |
| Discussion B-1 | sablier retourné, Maître clôt | aucune phase | manquant |
| Jugement B-2 | tous votent Maître inclus, majorité stricte résout la partie | pouces haut/bas, comptage affiché, aucune résolution, l'hôte enchaîne toujours sur B-3 | résolution manquante |
| Vote B-3 | tous pointent, Maître non candidat | tous votent, Maître exclu des candidats | conforme |
| Égalité B-3 | le trouveur départage | égalité = défaite des Citoyens | écart |
| Variante sans Traître, tirage | centre = Traître avec P 1/(n-1) | fantôme ajouté au tirage, P 1/n | écart mineur |
| Variante, vote du centre | majorité sur le centre = tout le monde gagne, centre Traître + Citoyen pointé = tous perdent | fantôme candidat, "Bravo" si fantôme Traître le plus voté, "Perdu, pas de Traître" sinon | conforme dans l'esprit |
| Variante, personne n'a trouvé | le Maître retourne une carte | absent | manquant, optionnel |
| Variante, regard avant confrontation | le trouveur regarde une carte | absent | manquant, optionnel |

## Réponses aux questions ouvertes du comité

1. Égalité au vote 2. Le livret fait départager par le joueur qui a trouvé. Le code actuel déclare les Citoyens perdants. Décision proposée : suivre le livret, le trouveur choisit parmi les ex aequo
2. Le trouveur vote-t-il au vote 1. Oui. Le livret dit "tous les joueurs, le Maître du jeu inclus" et n'exclut personne. La proposition du Designer de l'exclure est contraire au livret
3. Vote pour le Maître. Le Maître n'est jamais candidat. Le moteur refuse la commande, il ne l'ignore pas silencieusement
4. Le Maître voit-il le mot pendant le chrono. Il le connaît et doit répondre aux questions. Le mot reste accessible au Maître et au Traître pendant toute la partie, derrière un tap, puis il est révélé à tous à l'écran de fin

## Décisions à prendre

D1. Défaite au temps. Implémenter A-5 (sablier expiré = tous perdent) dans le moteur comme commande `timeout`. La variante "le Maître retourne une carte" est reportée, elle demande un écran de désignation pour le Maître. Proposé : oui pour A-5 maintenant, variante plus tard

D2. Qui a trouvé. L'action "Mot trouvé" du Maître désigne le trouveur dans la liste des joueurs. Nécessaire pour B-2 automatique et pour le départage B-3. Proposé : oui, dès le moteur

D3. Résolution automatique de B-2. Majorité stricte des votants humains (fantôme exclu) : si atteinte, le rôle du trouveur décide et la partie s'arrête, sinon passage au vote B-3. Aujourd'hui l'hôte décide à la main d'enchaîner. Proposé : automatique, conforme au livret. Alternative : garder l'enchaînement manuel comme tolérance de table

D4. Phase de discussion. Ajouter une phase `discussion` entre "mot trouvé" et B-2, clôturée par l'hôte, avec un chrono indicatif égal au temps consommé en questions (le sablier retourné). Proposé : phase oui, chrono indicatif oui, sans défaite au temps

D5. Probabilité du "pas de Traître". Aligner sur le livret (1/(n-1)) en tirant la carte du centre parmi les n-1 rôles hors Maître avant de distribuer. Coût nul dans un moteur réécrit. Proposé : aligner

Hors périmètre pour l'instant, à rouvrir après les premières parties : la variante "regard avant confrontation", la variante "personne n'a trouvé", une durée de sablier configurable.

## Point à vérifier

Le livret précise que le Maître vote au B-2 ("le Maître du jeu inclus") mais ne le dit pas explicitement pour le B-3 ("tous les joueurs, le joueur qui a trouvé inclus"). Le code le fait voter aux deux. À confirmer avec l'édition anglaise ou la FAQ Oink Games avant d'écrire le test correspondant.

## Actions

- [ ] Valider D1 à D5
- [ ] Trancher le vote du Maître au B-3
- [ ] Retirer `public/pdf/help.pdf` du repo : c'est la planche d'icônes du jeu Concept, pas Insider, reste du projet précédent
- [ ] Traduire chaque ligne du tableau de conformité en cas de test du moteur
