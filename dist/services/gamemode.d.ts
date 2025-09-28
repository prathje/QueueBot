import { Client, CategoryChannel, Guild } from 'discord.js';
import { GamemodeConfig } from '../types';
import { Queue } from './queue';
export declare class Gamemode {
    private client;
    private guild;
    private config;
    private category;
    private queues;
    constructor(client: Client, guild: Guild, config: GamemodeConfig);
    initialize(): Promise<void>;
    private ensureCategory;
    private initializeQueues;
    getQueue(queueId: string): Queue | undefined;
    getAllQueues(): Queue[];
    getId(): string;
    getDisplayName(): string;
    getCategory(): CategoryChannel | null;
}
//# sourceMappingURL=gamemode.d.ts.map