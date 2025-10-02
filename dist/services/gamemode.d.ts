import { Client, CategoryChannel, Guild, TextChannel } from 'discord.js';
import { GamemodeConfig, IMatchResult } from '../types';
import { Queue } from './queue';
import { RatingService } from './rating';
import { Mutex } from '../utils/mutex';
export declare class Gamemode {
    private client;
    private guild;
    private config;
    private category;
    private resultsChannel;
    private queues;
    private matchmakingMutex;
    private ratingService;
    private leaderboardService;
    constructor(client: Client, guild: Guild, config: GamemodeConfig, matchmakingMutex: Mutex);
    initialize(): Promise<void>;
    private ensureCategory;
    private ensureResultsChannel;
    private initializeQueues;
    getQueue(queueId: string): Queue | undefined;
    getQueueByChannelId(channelId: string): Queue | undefined;
    getAllQueues(): Queue[];
    getId(): string;
    getDisplayName(): string;
    getCategory(): CategoryChannel | null;
    getResultsChannel(): TextChannel | null;
    getRatingService(): RatingService;
    resetRating(): Promise<void>;
    onMatchResult(matchResult: IMatchResult): Promise<void>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=gamemode.d.ts.map