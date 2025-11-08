import { Client, Guild, CategoryChannel, TextChannel } from 'discord.js';
import { IQueue, IMatchResult } from '../types';
import { MatchmakingAlgorithm } from './matchmaking';
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
    private resultsChannel;
    private onMatchResult;
    private queueMessage;
    private messageUpdater;
    private playerService;
    private matchmakingService;
    private activeMatches;
    private matchmakingMutex;
    private interactionListener;
    private disabled;
    private pingRole;
    constructor(client: Client, guild: Guild, category: CategoryChannel, config: QueueConfig, matchmakingMutex: Mutex, resultsChannel: (TextChannel | null) | undefined, onMatchResult: ((matchResult: IMatchResult) => Promise<void>) | null, pingRole?: string | null);
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
    private handleRefreshQueue;
    private handlePingRoleAdd;
    private handlePingRoleRemove;
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
    setAlgorithm(algorithm: MatchmakingAlgorithm): Promise<void>;
    addMap(mapName: string): Promise<boolean>;
    removeMap(mapName: string): Promise<boolean>;
    shutdown(): Promise<void>;
    private cancelActiveMatches;
}
export {};
//# sourceMappingURL=queue.d.ts.map