"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupResetService = void 0;
const Match_1 = require("../models/Match");
const match_handler_1 = require("./match_handler");
const players_1 = require("./players");
const types_1 = require("../types");
class StartupResetService {
    static async resetAllMatches(guild) {
        try {
            console.log('Resetting all active matches on startup...');
            // Find all active matches with their channel IDs
            const activeMatches = await Match_1.Match.find({
                state: {
                    $nin: [types_1.MatchState.CLOSED, types_1.MatchState.CANCELLED, types_1.MatchState.COMPLETED]
                }
            });
            console.log(`Found ${activeMatches.length} active matches to clean up`);
            // Delete Discord channels for each match using MatchHandler
            let deletedChannels = 0;
            for (const match of activeMatches) {
                const cleanedUp = await match_handler_1.MatchHandler.cleanupMatchChannels(guild, {
                    matchId: match.matchId,
                    discordChannelId: match.discordChannelId,
                    discordVoiceChannel1Id: match.discordVoiceChannel1Id,
                    discordVoiceChannel2Id: match.discordVoiceChannel2Id
                });
                deletedChannels += cleanedUp;
            }
            // Cancel all non-closed matches in database
            const result = await Match_1.Match.updateMany({
                state: {
                    $nin: [types_1.MatchState.CLOSED, types_1.MatchState.CANCELLED, types_1.MatchState.COMPLETED]
                }
            }, {
                state: types_1.MatchState.CANCELLED
            });
            console.log(`Cancelled ${result.modifiedCount} active matches and deleted ${deletedChannels} channels`);
        }
        catch (error) {
            console.error('Error resetting matches on startup:', error);
        }
    }
    static async resetAllPlayers() {
        const playerService = players_1.PlayerService.getInstance();
        await playerService.resetAllPlayers();
    }
    static async performStartupReset(guild) {
        console.log('Performing startup reset...');
        // Reset players first to clear any match associations
        await this.resetAllPlayers();
        // Then reset matches and clean up channels
        await this.resetAllMatches(guild);
        console.log('Startup reset completed');
    }
}
exports.StartupResetService = StartupResetService;
//# sourceMappingURL=startup_reset.js.map