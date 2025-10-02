import { Client, CategoryChannel, ChannelType, Guild, TextChannel, PermissionFlagsBits } from 'discord.js';
import { IGamemode, GamemodeConfig, IMatchResult } from '../types';
import { Queue } from './queue';
import { RatingService } from './rating';
import { Leaderboard } from './leaderboard';
import { Mutex } from '../utils/mutex';

export class Gamemode {
  private client: Client;
  private guild: Guild;
  private config: GamemodeConfig;
  private category: CategoryChannel | null = null;
  private resultsChannel: TextChannel | null = null;
  private queues: Map<string, Queue> = new Map();
  private matchmakingMutex: Mutex;
  private ratingService: RatingService;
  private leaderboardService: Leaderboard;

  constructor(client: Client, guild: Guild, config: GamemodeConfig, matchmakingMutex: Mutex) {
    this.client = client;
    this.guild = guild;
    this.config = config;
    this.matchmakingMutex = matchmakingMutex;
    this.ratingService = new RatingService(config.id);
    this.leaderboardService = new Leaderboard(client, guild, this.ratingService, config.id, config.displayName);
  }

  async initialize(): Promise<void> {
    await this.ensureCategory();
    await this.ensureResultsChannel();
    await this.resetRating(); // reset rating before initializing leaderboard
    await this.leaderboardService.initialize(this.category!);
    await this.initializeQueues();
  }



  private async ensureCategory(): Promise<void> {
    try {
      let category = this.guild.channels.cache.find(
        channel => channel.name === this.config.displayName && channel.type === ChannelType.GuildCategory
      ) as CategoryChannel;

      if (!category) {
        category = await this.guild.channels.create({
          name: this.config.displayName,
          type: ChannelType.GuildCategory
        });
        console.log(`Created category: ${this.config.displayName}`);
      }

      this.category = category;
    } catch (error) {
      console.error(`Error ensuring category for gamemode ${this.config.id}:`, error);
      throw error;
    }
  }

  private async ensureResultsChannel(): Promise<void> {
    if (!this.category) {
      throw new Error('Category must be created before results channel');
    }

    try {
      const channelName = `${this.config.id}-results`;

      let resultsChannel = this.guild.channels.cache.find(
        ch => ch.name === channelName &&
              ch.type === ChannelType.GuildText &&
              ch.parentId === this.category?.id
      ) as TextChannel;

      if (!resultsChannel) {
        resultsChannel = await this.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: this.category.id,
          permissionOverwrites: [
            {
              id: this.guild.roles.everyone.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
            },
            {
              id: this.client.user!.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
            }
          ]
        });
        console.log(`Created results channel: ${channelName}`);
      } else {
        // Update permissions for existing results channel
        await resultsChannel.permissionOverwrites.set([
          {
            id: this.guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
          },
          {
            id: this.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
          }
        ]);
        console.log(`Updated permissions for existing results channel: ${channelName}`);
      }

      this.resultsChannel = resultsChannel;
    } catch (error) {
      console.error(`Error ensuring results channel for gamemode ${this.config.id}:`, error);
      throw error;
    }
  }


  private async initializeQueues(): Promise<void> {
    if (!this.category) {
      throw new Error('Category must be created before initializing queues');
    }

    for (const queueConfig of this.config.queues) {
      try {
        const queue = new Queue(this.client, this.guild, this.category, {
          ...queueConfig,
          gamemodeId: this.config.id
        }, this.matchmakingMutex, this.resultsChannel, this.onMatchResult.bind(this));
        await queue.initialize();
        this.queues.set(queueConfig.id, queue);
        console.log(`Initialized queue: ${queueConfig.displayName}`);
      } catch (error) {
        console.error(`Error initializing queue ${queueConfig.id}:`, error);
      }
    }
  }

  getQueue(queueId: string): Queue | undefined {
    return this.queues.get(queueId);
  }

  getQueueByChannelId(channelId: string): Queue | undefined {
    for (const queue of this.queues.values()) {
      if (queue.getChannel()?.id === channelId) {
        return queue;
      }
    }
    return undefined;
  }

  getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  getId(): string {
    return this.config.id;
  }

  getDisplayName(): string {
    return this.config.displayName;
  }

  getCategory(): CategoryChannel | null {
    return this.category;
  }

  getResultsChannel(): TextChannel | null {
    return this.resultsChannel;
  }

  getRatingService(): RatingService {
    return this.ratingService;
  }

  async resetRating(): Promise<void> {
    console.log(`Resetting ratings for gamemode: ${this.config.displayName}`);
    await this.ratingService.resetRatings();
  }


  async onMatchResult(matchResult: IMatchResult): Promise<void> {
    console.log(`onMatchResult callback received for gamemode ${this.config.id}, match ${matchResult.matchId.slice(0, 8)}`);

    try {
      // Process rating changes for all players in the match
      await this.ratingService.processMatchResult(matchResult);

      // Update leaderboard after rating changes
      await this.leaderboardService.updateLeaderboard();

      console.log(`Rating changes processed successfully for match ${matchResult.matchId.slice(0, 8)}`);
    } catch (error) {
      console.error(`Error processing rating changes for match ${matchResult.matchId}:`, error);
    }
  }

  async shutdown(): Promise<void> {
    console.log(`Shutting down gamemode: ${this.config.displayName}`);

    for (const queue of this.queues.values()) {
      await queue.shutdown();
    }

    console.log(`Gamemode ${this.config.displayName} shutdown complete`);
  }
}