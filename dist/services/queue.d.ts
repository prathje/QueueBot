import { Client, Guild, CategoryChannel, TextChannel } from 'discord.js';
import { IQueue } from '../types';
import { MatchHandler } from './match_handler';
import { Mutex } from '../utils/mutex';
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
    private matchmakingMutex;
    private interactionListener;
    private disabled;
    constructor(client: Client, guild: Guild, category: CategoryChannel, config: QueueConfig, matchmakingMutex: Mutex);
    initialize(): Promise<void>;
    private ensureChannel;
    private setupQueueMessage;
    private createQueueMessage;
    private updateQueueMessage;
    private createQueueEmbed;
    private createQueueButtons;
    private setupInteractionHandlers;
    private cleanupInteractionHandlers;
    private handleJoinQueue;
    private handleLeaveQueue;
    private addSinglePlayerProgrammatically;
    private addPlayersToQueue;
    checkForMatch(): Promise<void>;
    getActiveMatches(): MatchHandler[];
    removeMatch(matchId: string): void;
    getId(): string;
    getDisplayName(): string;
    getChannel(): TextChannel | null;
    disable(): Promise<void>;
    enable(): Promise<void>;
    isDisabled(): boolean;
    shutdown(): Promise<void>;
    private cancelActiveMatches;
}
export {};
//# sourceMappingURL=queue.d.ts.map