import { Guild } from 'discord.js';
import { Match } from '../models/Match';
import { MatchHandler } from './match_handler';
import { PlayerService } from './players';
import { MatchState } from '../types';

export class StartupResetService {
  static async resetAllMatches(guild: Guild): Promise<void> {
    try {
      console.log('Resetting all active matches on startup...');

      // Find all active matches with their channel IDs
      const activeMatches = await Match.find({
        state: {
          $nin: [MatchState.CLOSED, MatchState.CANCELLED, MatchState.COMPLETED]
        }
      });

      console.log(`Found ${activeMatches.length} active matches to clean up`);

      // Delete Discord channels for each match using MatchHandler
      let deletedChannels = 0;
      for (const match of activeMatches) {
        const cleanedUp = await MatchHandler.cleanupMatchChannels(guild, {
          matchId: match.matchId,
          discordChannelId: match.discordChannelId,
          discordVoiceChannel1Id: match.discordVoiceChannel1Id,
          discordVoiceChannel2Id: match.discordVoiceChannel2Id
        });
        deletedChannels += cleanedUp;
      }

      // Cancel all non-closed matches in database
      const result = await Match.updateMany(
        {
          state: {
            $nin: [MatchState.CLOSED, MatchState.CANCELLED, MatchState.COMPLETED]
          }
        },
        {
          state: MatchState.CANCELLED
        }
      );

      console.log(`Cancelled ${result.modifiedCount} active matches and deleted ${deletedChannels} channels`);
    } catch (error) {
      console.error('Error resetting matches on startup:', error);
    }
  }

  static async resetAllPlayers(): Promise<void> {
    const playerService = PlayerService.getInstance();
    await playerService.resetAllPlayers();
  }

  static async performStartupReset(guild: Guild): Promise<void> {
    console.log('Performing startup reset...');
    await this.resetAllMatches(guild);
    await this.resetAllPlayers();
    console.log('Startup reset completed');
  }
}