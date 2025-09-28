"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchResult = void 0;
const mongoose_1 = require("mongoose");
const MatchResultSchema = new mongoose_1.Schema({
    matchId: { type: String, required: true, unique: true },
    queueId: { type: String, required: true },
    gamemodeId: { type: String, required: true },
    winningTeam: { type: Number, enum: [1, 2], required: true },
    map: { type: String, required: true },
    teams: {
        team1: [{ type: String, required: true }],
        team2: [{ type: String, required: true }]
    },
    players: [{ type: String, required: true }],
    completedAt: { type: Date, default: Date.now }
});
exports.MatchResult = (0, mongoose_1.model)('MatchResult', MatchResultSchema);
//# sourceMappingURL=MatchResult.js.map