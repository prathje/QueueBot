"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rating = void 0;
const mongoose_1 = require("mongoose");
const RatingValueSchema = new mongoose_1.Schema({
    mu: { type: Number, required: true },
    sigma: { type: Number, required: true }
}, { _id: false });
const RatingSchema = new mongoose_1.Schema({
    player: { type: String, required: true },
    gamemode: { type: String, required: true },
    matchId: { type: String, required: true },
    date: { type: Date, default: Date.now },
    before: { type: RatingValueSchema, required: true },
    after: { type: RatingValueSchema, required: true },
    ordinalBefore: { type: Number, required: true },
    ordinalAfter: { type: Number, required: true },
    ordinalDiff: { type: Number, required: true }
});
// Index for efficient queries
RatingSchema.index({ player: 1, gamemode: 1 });
RatingSchema.index({ matchId: 1 });
RatingSchema.index({ date: -1 });
exports.Rating = (0, mongoose_1.model)('Rating', RatingSchema);
//# sourceMappingURL=Rating.js.map