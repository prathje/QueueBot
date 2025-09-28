import { Client, Guild, CategoryChannel, TextChannel } from 'discord.js';
import { IQueue } from '../types';
import { MatchHandler } from './match_handler';
interface QueueConfig extends Omit<IQueue, 'players' | 'discordChannelId'> {
}
export declare class Queue {
    private client;
    private guild;
    private category;
    private config;
    private channel;
    private queueMessage;
    private playerService;
    private matchmakingService;
    private activeMatches;
    constructor(client: Client, guild: Guild, category: CategoryChannel, config: QueueConfig);
    initialize(): Promise<void>;
    private ensureChannel;
    private setupQueueMessage;
    private createQueueMessage;
    private updateQueueMessage;
    private createQueueEmbed;
    private createQueueButtons;
    private setupInteractionHandlers;
    private handleJoinQueue;
    private handleLeaveQueue;
    private checkForMatch;
    getActiveMatches(): MatchHandler[];
    removeMatch(matchId: string): void;
    getId(): string;
    getDisplayName(): string;
    getChannel(): TextChannel | null;
    shutdown(): Promise<void>;
}
export {};
//# sourceMappingURL=queue.d.ts.map