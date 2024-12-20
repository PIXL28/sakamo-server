const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// Cache pour stocker les résultats des requêtes
const cache = new Map();

// Fonction pour nettoyer le cache toutes les 24 heures
setInterval(() => {
    cache.clear();
}, 24 * 60 * 60 * 1000);

// Fonction pour vérifier un mot sur Wiktionnaire
async function checkWiktionaryWord(word) {
    const params = new URLSearchParams({
        action: 'parse',
        page: word,
        format: 'json',
        prop: 'wikitext',
        formatversion: '2',
        redirects: '1'
    });

    const response = await fetch(`https://fr.wiktionary.org/w/api.php?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.error || !data.parse?.wikitext) {
        return false;
    }

    const content = typeof data.parse.wikitext === 'string'
        ? data.parse.wikitext
        : data.parse.wikitext['*'] || data.parse.wikitext.content;

    return content.includes('{{langue|fr}}') || content.includes('{{=fr=}}');
}

// Route pour vérifier un mot
app.get('/check-word/:word', async (req, res) => {
    try {
        const word = req.params.word.toLowerCase();

        // Vérifier le cache d'abord
        if (cache.has(word)) {
            console.log(`Mot "${word}" trouvé dans le cache`);
            res.json({ isValid: cache.get(word) });
            return;
        }

        // Ajouter un délai aléatoire pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

        const isValid = await checkWiktionaryWord(word);
        
        // Stocker le résultat dans le cache
        cache.set(word, isValid);
        
        console.log(`Mot "${word}" vérifié: ${isValid ? 'valide' : 'invalide'}`);
        res.json({ isValid });
    } catch (error) {
        console.error('Erreur lors de la vérification du mot:', error);
        
        // Si c'est une erreur de rate limit, on renvoie un code spécial
        if (error.message.includes('429')) {
            res.status(429).json({ 
                error: 'Too Many Requests',
                message: 'Veuillez réessayer dans quelques secondes'
            });
            return;
        }
        
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: 'Une erreur est survenue lors de la vérification du mot'
        });
    }
});

// Route de test pour vérifier que le serveur fonctionne
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Serveur Sakamo opérationnel' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Test serveur: http://localhost:${PORT}/ping`);
});
