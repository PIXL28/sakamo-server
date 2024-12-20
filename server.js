const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// Configuration
const CONFIG = {
    DELAY_BETWEEN_REQUESTS: 2000,    // 2 secondes entre chaque requête
    MAX_RETRIES: 3,                  // Nombre maximum de tentatives
    RETRY_DELAY: 5000,               // 5 secondes entre chaque tentative
    CACHE_DURATION: 24 * 60 * 60 * 1000  // 24 heures
};

// Cache pour stocker les résultats des requêtes
const cache = new Map();

// Fonction pour nettoyer le cache toutes les 24 heures
setInterval(() => {
    cache.clear();
}, CONFIG.CACHE_DURATION);

// Fonction pour vérifier un mot sur Wiktionnaire
async function checkWiktionaryWord(word) {
    try {
        console.log(`Vérification du mot "${word}" sur Wiktionnaire...`);
        
        const params = new URLSearchParams({
            action: 'parse',
            page: word,
            format: 'json',
            prop: 'wikitext',
            formatversion: '2',
            origin: '*',
            redirects: '1'
        });

        const url = `https://fr.wiktionary.org/w/api.php?${params}`;
        console.log(`URL de requête: ${url}`);

        const response = await fetch(url);
        console.log(`Statut de la réponse: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.parse?.wikitext) {
            console.log(`Mot "${word}" non trouvé dans Wiktionnaire`);
            return false;
        }

        const content = typeof data.parse.wikitext === 'string'
            ? data.parse.wikitext
            : data.parse.wikitext['*'] || data.parse.wikitext.content;

        const isValid = content.includes('{{langue|fr}}') || content.includes('{{=fr=}}');
        console.log(`Mot "${word}" ${isValid ? 'trouvé' : 'non trouvé'} dans Wiktionnaire`);
        
        return isValid;
    } catch (error) {
        console.error(`Erreur lors de la vérification de "${word}":`, error);
        throw error;
    }
}

// Route pour vérifier un mot
app.get('/check-word/:word', async (req, res) => {
    try {
        const word = req.params.word.toLowerCase();
        console.log(`\nNouvelle requête pour le mot "${word}"`);

        // Vérifier le cache d'abord
        if (cache.has(word)) {
            console.log(`Mot "${word}" trouvé dans le cache`);
            res.json({ isValid: cache.get(word) });
            return;
        }

        // Ajouter un délai pour éviter les rate limits
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

        const isValid = await checkWiktionaryWord(word);
        
        // Stocker le résultat dans le cache
        cache.set(word, isValid);
        
        console.log(`Réponse finale pour "${word}": ${isValid}`);
        res.json({ isValid });
    } catch (error) {
        console.error('Erreur complète:', error);
        
        if (error.message.includes('429')) {
            console.log('Rate limit détecté, envoi de 429');
            res.status(429).json({ 
                error: 'Too Many Requests',
                message: 'Veuillez réessayer dans quelques secondes'
            });
            return;
        }
        
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: error.message
        });
    }
});

// Route de test
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Serveur Sakamo opérationnel',
        cacheSize: cache.size
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Test serveur: http://localhost:${PORT}/ping`);
    console.log('Configuration:');
    console.log(` - Délai entre requêtes: ${CONFIG.DELAY_BETWEEN_REQUESTS}ms`);
    console.log(` - Tentatives maximum: ${CONFIG.MAX_RETRIES}`);
    console.log(` - Délai entre tentatives: ${CONFIG.RETRY_DELAY}ms`);
});
