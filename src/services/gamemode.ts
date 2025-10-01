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

    const queuePromises = this.config.queues.map(async (queueConfig) => {
      try {
        const queue = new Queue(this.client, this.guild, this.category!, {
          ...queueConfig,
          gamemodeId: this.config.id
        }, this.matchmakingMutex);
        await queue.initialize();
        this.queues.set(queueConfig.id, queue);
        console.log(`Initialized queue: ${queueConfig.displayName}`);
        return { success: true, queueId: queueConfig.id };
      } catch (error) {
        console.error(`Error initializing queue ${queueConfig.id}:`, error);
        return { success: false, queueId: queueConfig.id, error };
      }
    });

    const results = await Promise.all(queuePromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Queue initialization complete: ${successful} successful, ${failed} failed`);
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

  async shutdown(): Promise<void> {
    console.log(`Shutting down gamemode: ${this.config.displayName}`);

    const shutdownPromises = Array.from(this.queues.values()).map(queue => queue.shutdown());
    await Promise.all(shutdownPromises);

    console.log(`Gamemode ${this.config.displayName} shutdown complete`);
  }
}