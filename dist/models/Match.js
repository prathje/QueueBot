"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Match = void 0;
const mongoose_1 = require("mongoose");
const types_1 = require("../types");
const MatchSchema = new mongoose_1.Schema({
    matchId: { type: String, required: true, unique: true },
    queueId: { type: String, required: true },
    gamemodeId: { type: String, required: true },
    players: [{ type: String, required: true }],
    teams: {
        team1: [{ type: String, required: true }],
        team2: [{ type: String, required: true }]
    },
    map: { type: String, required: true },
    state: {
        type: String,
        enum: Object.values(types_1.MatchState),
        default: types_1.MatchState.INITIAL
    },
    discordChannelId: { type: String, required: false, default: null },
    discordVoiceChannel1Id: { type: String, required: false, default: null },
    discordVoiceChannel2Id: { type: String, required: false, default: null },
    readyPlayers: [{ type: String, default: [] }],
    votes: {
        team1: [{ type: String, default: [] }],
        team2: [{ type: String, default: [] }],
        cancel: [{ type: String, default: [] }]
    }
}, {
    timestamps: true
});
exports.Match = (0, mongoose_1.model)('Match', MatchSchema);
//# sourceMappingURL=Match.js.map