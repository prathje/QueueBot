import { Client, CategoryChannel, Guild } from 'discord.js';
import { GamemodeConfig } from '../types';
import { Queue } from './queue';
import { Mutex } from '../utils/mutex';
export declare class Gamemode {
    private client;
    private guild;
    private config;
    private category;
    private queues;
    private matchmakingMutex;
    constructor(client: Client, guild: Guild, config: GamemodeConfig, matchmakingMutex: Mutex);
    initialize(): Promise<void>;
    private ensureCategory;
    private initializeQueues;
    getQueue(queueId: string): Queue | undefined;
    getQueueByChannelId(channelId: string): Queue | undefined;
    getAllQueues(): Queue[];
    getId(): string;
    getDisplayName(): string;
    getCategory(): CategoryChannel | null;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=gamemode.d.ts.map