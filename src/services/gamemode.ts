import { Client, CategoryChannel, ChannelType, Guild } from 'discord.js';
import { IGamemode, GamemodeConfig } from '../types';
import { Queue } from './queue';
import { Mutex } from '../utils/mutex';

export class Gamemode {
  private client: Client;
  private guild: Guild;
  private config: GamemodeConfig;
  private category: CategoryChannel | null = null;
  private queues: Map<string, Queue> = new Map();
  private matchmakingMutex: Mutex;

  constructor(client: Client, guild: Guild, config: GamemodeConfig, matchmakingMutex: Mutex) {
    this.client = client;
    this.guild = guild;
    this.config = config;
    this.matchmakingMutex = matchmakingMutex;
  }

  async initialize(): Promise<void> {
    await this.ensureCategory();
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

  private async initializeQueues(): Promise<void> {
    if (!this.category) {
      throw new Error('Category must be created before initializing queues');
    }

    for (const queueConfig of this.config.queues) {
      try {
        const queue = new Queue(this.client, this.guild, this.category, {
          ...queueConfig,
          gamemodeId: this.config.id
        }, this.matchmakingMutex);
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

  async shutdown(): Promise<void> {
    console.log(`Shutting down gamemode: ${this.config.displayName}`);

    for (const queue of this.queues.values()) {
      await queue.shutdown();
    }

    console.log(`Gamemode ${this.config.displayName} shutdown complete`);
  }
}