---
date: 2026-09-17
contexte: Vérifications manuelles sur téléphones réels avant une partie, ce que les tests automatiques ne prouvent pas
---

# Checklist mobile

À passer sur un iPhone (Safari) et un Android (Chrome) réels, serveur lancé avec `MIN_PLAYERS=2`.

- [ ] Le son sort après le premier tap (Rejoindre), puis à chaque changement de phase
- [ ] L'écran ne se verrouille pas pendant le chrono (Wake Lock)
- [ ] Un reload en pleine partie revient au bon écran, avec le même prénom
- [ ] Verrouiller puis déverrouiller le téléphone revient au bon écran, le chrono est juste
- [ ] Deux onglets du même téléphone comptent pour un seul joueur en ligne
- [ ] Couper le réseau 10 secondes affiche le bandeau "Reconnexion...", le rétablir rattrape l'état

Résultats, date et appareils :

| Date | Appareil | Résultat | Notes |
|---|---|---|---|
