const express = require('express');
const router = express.Router();
const CS16Result = require('../models/CS16Result');

// CS1.6 Match Results Logging
router.post('/api/games/cs16/result', async (req, res) => {
    const { playerId, matchType, score, kills, deaths } = req.body;

    // Validate required fields
    if (!playerId || !matchType || score === undefined || kills === undefined || deaths === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        // Create and save the result
        const result = new CS16Result({ playerId, matchType, score, kills, deaths });
        await result.save();
        
        // Respond back
        res.status(201).json({ message: 'Result logged successfully', result });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error', error });
    }
});

// CS1.6 Launch Configuration
router.get('/api/games/cs16/launch-config', (req, res) => {
    const { mode } = req.query;

    if (mode === 'single') {
        return res.json({ launchUrl: 'cs16://launch?mode=single&slots=10&bots=9' });
    } else if (mode === 'multiplayer') {
        return res.json({ launchUrl: 'cs16://launch?mode=multiplayer&server=127.0.0.1:27015' });
    } else {
        return res.status(400).json({ message: 'Invalid mode parameter. Use "single" or "multiplayer".' });
    }
});

module.exports = router;