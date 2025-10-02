"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RatingService = void 0;
const models_1 = require("../models");
const openskill_1 = require("openskill");
class RatingService {
    constructor(gamemodeId) {
        this.defaultRating = { mu: 25.0, sigma: 8.333 }; // OpenSkill default values
        this.gamemodeId = gamemodeId;
    }
    /**
     * Process match result and calculate rating changes for all players
     * TODO: We might want to lock this at some point, however, if two matches finish at the same time, the players should be different
     */
    async processMatchResult(matchResult) {
        console.log(`Processing rating changes for match ${matchResult.matchId} in gamemode ${this.gamemodeId}`);
        // Get current ratings for all players
        const playerRatings = new Map();
        for (const playerId of matchResult.players) {
            const currentRating = await this.getPlayerRating(playerId);
            playerRatings.set(playerId, currentRating);
        }
        // Calculate rating changes
        const newRatings = this.calculateRatingChanges(matchResult, playerRatings);
        // Save rating changes to database
        for (const [playerId, newRating] of newRatings.entries()) {
            const before = playerRatings.get(playerId);
            // Calculate ordinal values
            const ordinalBefore = this.calculateOrdinal(before);
            const ordinalAfter = this.calculateOrdinal(newRating);
            const ordinalDiff = ordinalAfter - ordinalBefore;
            await this.saveRatingChange({
                player: playerId,
                gamemode: this.gamemodeId,
                matchId: matchResult.matchId,
                date: matchResult.completedAt,
                before,
                after: newRating,
                ordinalBefore,
                ordinalAfter,
                ordinalDiff
            });
        }
        console.log(`Saved rating changes for ${newRatings.size} players in match ${matchResult.matchId}`);
    }
    /**
     * Get current rating for a player (latest rating or default if no history)
     */
    async getPlayerRating(playerId) {
        const latestRating = await models_1.Rating.findOne({
            player: playerId,
            gamemode: this.gamemodeId
        }).sort({ date: -1 });
        return latestRating?.after ?? this.defaultRating;
    }
    /**
     * Get rating history for a player
     */
    async getPlayerRatingHistory(playerId, limit = 10) {
        return await models_1.Rating.find({
            player: playerId,
            gamemode: this.gamemodeId
        })
            .sort({ date: -1 })
            .limit(limit)
            .lean();
    }
    /**
     * Get leaderboard for the gamemode
     */
    async getLeaderboard(limit = 50) {
        // Get latest rating for each player
        const pipeline = [
            { $match: { gamemode: this.gamemodeId } },
            { $sort: { player: 1, date: -1 } },
            { $group: {
                    _id: '$player',
                    rating: { $first: '$after' },
                    ordinal: { $first: '$ordinalAfter' },
                    ordinalDiff: { $first: '$ordinalDiff' },
                    matches: { $sum: 1 }
                }
            },
            { $sort: { ordinal: -1 } },
            { $limit: limit },
            { $project: {
                    player: '$_id',
                    rating: 1,
                    ordinal: 1,
                    ordinalDiff: 1,
                    matches: 1,
                    _id: 0
                }
            }
        ];
        return await models_1.Rating.aggregate(pipeline);
    }
    /**
     * Calculate rating changes based on match result using OpenSkill
     */
    calculateRatingChanges(matchResult, playerRatings) {
        const newRatings = new Map();
        // Prepare teams for OpenSkill
        const team1Ratings = matchResult.teams.team1.map(playerId => {
            const playerRating = playerRatings.get(playerId);
            return (0, openskill_1.rating)({ mu: playerRating.mu, sigma: playerRating.sigma });
        });
        const team2Ratings = matchResult.teams.team2.map(playerId => {
            const playerRating = playerRatings.get(playerId);
            return (0, openskill_1.rating)({ mu: playerRating.mu, sigma: playerRating.sigma });
        });
        // Calculate new ratings using OpenSkill convenience pattern
        const [[...newTeam1Ratings], [...newTeam2Ratings]] = (0, openskill_1.rate)([team1Ratings, team2Ratings], {
            rank: matchResult.winningTeam === 1 ? [1, 2] : [2, 1] // Winner gets rank 1, loser gets rank 2
        });
        // Map the results back to our format
        matchResult.teams.team1.forEach((playerId, index) => {
            const newRating = newTeam1Ratings[index];
            newRatings.set(playerId, { mu: newRating.mu, sigma: newRating.sigma });
        });
        matchResult.teams.team2.forEach((playerId, index) => {
            const newRating = newTeam2Ratings[index];
            newRatings.set(playerId, { mu: newRating.mu, sigma: newRating.sigma });
        });
        return newRatings;
    }
    /**
     * Calculate ordinal rating from mu and sigma values using OpenSkill
     */
    calculateOrdinal(ratingValue) {
        const skillRating = (0, openskill_1.rating)({ mu: ratingValue.mu, sigma: ratingValue.sigma });
        return (0, openskill_1.ordinal)(skillRating);
    }
    /**
     * Save rating change to database
     */
    async saveRatingChange(ratingData) {
        const rating = new models_1.Rating(ratingData);
        await rating.save();
    }
    /**
     * Get gamemode ID
     */
    getGamemodeId() {
        return this.gamemodeId;
    }
}
exports.RatingService = RatingService;
//# sourceMappingURL=rating.js.map