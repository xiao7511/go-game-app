const mongoose = require('mongoose');

const CS16ResultSchema = new mongoose.Schema({
    playerId: { type: String, required: true }, // Player ID
    matchType: { type: String, enum: ['single', 'multiplayer'], required: true }, // Match type
    score: { type: Number, required: true }, // Player score
    kills: { type: Number, required: true }, // Total kills
    deaths: { type: Number, required: true }, // Total deaths
    timestamp: { type: Date, default: Date.now } // Timestamp of the result
});

module.exports = mongoose.model('CS16Result', CS16ResultSchema);