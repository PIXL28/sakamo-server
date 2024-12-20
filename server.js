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

// File d'attente pour les requêtes
let requestQueue = [];
let isProcessing = false;

// Fonction pour nettoyer le cache toutes les 24 heures
setInterval(() => {
    cache.clear();
}, CONFIG.CACHE_DURATION);

// Fonction pour attendre
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour vérifier un mot sur Wiktionnaire avec retry
async function checkWiktionaryWord(word, retryCount = 0) {
    try {
        const params = new URLSearchParams({
            action: 'parse',
            page: word,
            format: 'json',
            prop: 'wikitext',
            formatversion: '2',
            redirects: '1'
        });

        const response = await fetch(`https://fr.wiktionary.org/w/api.php?${params}`);
        
        if (response.status === 429 && retryCount < CONFIG.MAX_RETRIES) {
            console.log(`Rate limit pour "${word}", tentative ${retryCount + 1}/${CONFIG.MAX_RETRIES}`);
            await wait(CONFIG.RETRY_DELAY);
            return checkWiktionaryWord(word, retryCount + 1);
        }

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
    } catch (error) {
        if (error.message.includes('429') && retryCount < CONFIG.MAX_RETRIES) {
            console.log(`Rate limit pour "${word}", tentative ${retryCount + 1}/${CONFIG.MAX_RETRIES}`);
            await wait(CONFIG.RETRY_DELAY);
            return checkWiktionaryWord(word, retryCount + 1);
        }
        throw error;
    }
}

// Fonction pour traiter la file d'attente
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;
    
    isProcessing = true;
    console.log(`Traitement de la file d'attente (${requestQueue.length} mots)`);
    
    while (requestQueue.length > 0) {
        const { word, resolve, reject } = requestQueue.shift();
        try {
            console.log(`Vérification du mot "${word}"`);
            const result = await checkWiktionaryWord(word);
            cache.set(word, result);
            resolve(result);
            if (requestQueue.length > 0) {
                console.log(`Attente de ${CONFIG.DELAY_BETWEEN_REQUESTS}ms avant le prochain mot`);
                await wait(CONFIG.DELAY_BETWEEN_REQUESTS);
            }
        } catch (error) {
            console.error(`Erreur pour le mot "${word}":`, error.message);
            reject(error);
        }
    }
    
    isProcessing = false;
    console.log('File d\'attente traitée');
}

// Fonction pour ajouter une requête à la file d'attente
function queueRequest(word) {
    console.log(`Ajout du mot "${word}" à la file d'attente`);
    return new Promise((resolve, reject) => {
        requestQueue.push({ word, resolve, reject });
        processQueue();
    });
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

        console.log(`Vérification du mot "${word}"`);
        const isValid = await queueRequest(word);
        console.log(`Résultat pour "${word}": ${isValid ? 'valide' : 'invalide'}`);
        res.json({ isValid });
    } catch (error) {
        console.error('Erreur:', error);
        
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

// Route de test
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Serveur Sakamo opérationnel',
        queueLength: requestQueue.length,
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
