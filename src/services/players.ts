import { Player } from '../models/Player';
import { IPlayer } from '../types';

export class PlayerService {
  private static instance: PlayerService;
  private players: Map<string, IPlayer> = new Map();
  private queueUpdateCallbacks: Map<string, () => Promise<void>> = new Map();

  private constructor() {}

  public static getInstance(): PlayerService {
    if (!PlayerService.instance) {
      PlayerService.instance = new PlayerService();
    }
    return PlayerService.instance;
  }

  async getOrCreatePlayer(discordId: string, username: string): Promise<IPlayer> {
    let player = this.players.get(discordId);

    if (!player) {
      try {
        const dbPlayer = await Player.findOne({ discordId });
        if (dbPlayer) {
          player = {
            discordId: dbPlayer.discordId,
            username: dbPlayer.username,
            currentQueues: dbPlayer.currentQueues || [],
            currentMatch: dbPlayer.currentMatch || null
          };
        } else {
          const newPlayer = new Player({
            discordId,
            username,
            currentQueues: [],
            currentMatch: null
          });
          await newPlayer.save();
          player = {
            discordId,
            username,
            currentQueues: [],
            currentMatch: null
          };
        }
        this.players.set(discordId, player);
      } catch (error) {
        console.error('Error getting or creating player:', error);
        throw error;
      }
    }

    if (player.username !== username) {
      player.username = username;
      await this.updatePlayer(player);
    }

    return player;
  }

  async getPlayer(discordId: string): Promise<IPlayer | null> {
    let player = this.players.get(discordId);

    if (!player) {
      try {
        const dbPlayer = await Player.findOne({ discordId });
        if (dbPlayer) {
          player = dbPlayer.toObject();
          this.players.set(discordId, player);
        }
      } catch (error) {
        console.error('Error getting player:', error);
        return null;
      }
    }

    return player || null;
  }

  async updatePlayer(player: IPlayer): Promise<void> {
    try {
      await Player.updateOne(
        { discordId: player.discordId },
        {
          username: player.username,
          currentQueues: player.currentQueues,
          currentMatch: player.currentMatch
        }
      );
      this.players.set(player.discordId, player);
    } catch (error) {
      console.error('Error updating player:', error);
      throw error;
    }
  }

  async addPlayerToQueue(discordId: string, queueId: string): Promise<void> {
    const player = await this.getPlayer(discordId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (!player.currentQueues.includes(queueId)) {
      player.currentQueues.push(queueId);
      await this.updatePlayer(player);
    }
  }

  async removePlayerFromQueue(discordId: string, queueId: string): Promise<void> {
    const player = await this.getPlayer(discordId);
    if (!player) {
      throw new Error('Player not found');
    }

    const wasInQueue = player.currentQueues.includes(queueId);
    player.currentQueues = player.currentQueues.filter(q => q !== queueId);
    await this.updatePlayer(player);

    // Notify the specific queue to update its display if player was actually in it
    if (wasInQueue) {
      await this.notifyQueuesUpdate([queueId]);
    }
  }

  async onPlayersFoundMatch(discordIds: string[], matchId: string): Promise<void> {
    // Collect all affected queues to notify after updates
    const affectedQueues = new Set<string>();

    for (const discordId of discordIds) {
        const player = await this.getPlayer(discordId);
        if (player) {
            player.currentQueues.forEach(queueId => affectedQueues.add(queueId));
            player.currentQueues = [];
            player.currentMatch = matchId;
            await this.updatePlayer(player);
        }
    }

    // Notify affected queues to update their displays
    await this.notifyQueuesUpdate(Array.from(affectedQueues));
  }

  async setPlayerMatch(discordId: string, matchId: string | null): Promise<void> {
    const player = await this.getPlayer(discordId);
    if (!player) {
      throw new Error('Player not found');
    }

    player.currentMatch = matchId;

    await this.updatePlayer(player);
  }

  isPlayerInQueue(discordId: string, queueId: string): boolean {
    const player = this.players.get(discordId);
    return player ? player.currentQueues.includes(queueId) : false;
  }

  isPlayerInMatch(discordId: string): boolean {
    const player = this.players.get(discordId);
    return player ? !!player.currentMatch : false;
  }

  getPlayersInQueue(queueId: string): string[] {
    const playersInQueue: string[] = [];
    for (const [discordId, player] of this.players) {
      if (player.currentQueues.includes(queueId)) {
        playersInQueue.push(discordId);
      }
    }
    return playersInQueue;
  }

  registerQueueUpdateCallback(queueId: string, callback: () => Promise<void>): void {
    this.queueUpdateCallbacks.set(queueId, callback);
  }

  unregisterQueueUpdateCallback(queueId: string): void {
    this.queueUpdateCallbacks.delete(queueId);
  }

  private async notifyQueuesUpdate(queueIds: string[]): Promise<void> {
    for (const queueId of queueIds) {
      const callback = this.queueUpdateCallbacks.get(queueId);
      if (callback) {
        try {
          await callback();
        } catch (error) {
          console.error(`Error updating queue ${queueId}:`, error);
        }
      }
    }
  }

  async resetAllPlayers(): Promise<number> {
    try {
      console.log('Resetting all player states...');

      // Clear in-memory cache first
      this.players.clear();

      // Clear all player queues and matches in database
      const result = await Player.updateMany(
        {},
        {
          $set: {
            currentQueues: [],
            currentMatch: null
          }
        }
      );

      console.log(`Reset ${result.modifiedCount} player states and cleared cache`);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error resetting players:', error);
      return 0;
    }
  }
}