# Sakamo Server

Serveur backend pour l'application Sakamo, gérant les vérifications de mots avec Wiktionnaire.

## Installation

```bash
npm install
```

## Démarrage en développement

```bash
npm run dev
```

## Démarrage en production

```bash
npm start
```

## Routes API

- `GET /ping` - Vérifie que le serveur fonctionne
- `GET /check-word/:word` - Vérifie si un mot existe dans Wiktionnaire

## Variables d'environnement

- `PORT` - Port du serveur (par défaut: 3001)
