---
date: 2026-09-17
contexte: Vérifications manuelles sur téléphones réels avant une partie, ce que les tests automatiques ne prouvent pas
---

# Checklist mobile

À passer sur un iPhone (Safari) et un Android (Chrome) réels, serveur lancé avec `MIN_PLAYERS=2`.

- [ ] Le son sort sur le téléphone de l'hôte seulement, après son premier tap : départ du chrono, 30 s restantes, temps écoulé, fin de manche. Les autres téléphones restent muets
- [ ] La pastille Son de l'hôte coupe le son et le reste après un rechargement
- [ ] Verrouiller le téléphone de l'hôte fait apparaître "Reprendre la main" chez les autres, et le son suit le nouvel hôte
- [ ] Le bouton Copier du salon copie l'adresse complète
- [ ] Maintenir le bloc « Le mot » en enquête révèle le mot, le relâcher le masque, sans loupe ni menu contextuel sur iOS
- [ ] Posés sur la table, les téléphones du Traître et d'un Citoyen sont indiscernables pendant l'enquête (ADR D7)
- [ ] Le geste « maintenir » est compris sans explication à table. Sinon, basculer sur un tap qui affiche 3 s (question ouverte du handoff)
- [ ] L'écran ne se verrouille pas pendant le chrono (Wake Lock)
- [ ] Un reload en pleine partie revient au bon écran, avec le même prénom
- [ ] Verrouiller puis déverrouiller le téléphone revient au bon écran, le chrono est juste
- [ ] Deux onglets du même téléphone comptent pour un seul joueur en ligne
- [ ] Couper le réseau 10 secondes affiche le bandeau "Reconnexion...", le rétablir rattrape l'état
- [ ] La barre de temps de la carte se vide bien en 5 s et la carte se recache au même moment
- [ ] Le socle d'action reste visible au-dessus de la barre home (safe area)

Résultats, date et appareils :

| Date | Appareil | Résultat | Notes |
|---|---|---|---|
