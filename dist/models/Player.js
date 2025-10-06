"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
const mongoose_1 = require("mongoose");
const PlayerSchema = new mongoose_1.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    currentQueues: [{ type: String, default: [] }],
    currentMatch: { type: String, required: false, default: null },
}, {
    timestamps: true,
});
exports.Player = (0, mongoose_1.model)('Player', PlayerSchema);
//# sourceMappingURL=Player.js.map