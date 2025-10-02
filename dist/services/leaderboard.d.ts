import { Client, EmbedBuilder, CategoryChannel, Guild } from 'discord.js';
import { RatingService } from './rating';
export declare class Leaderboard {
    private client;
    private guild;
    private ratingService;
    private leaderboardChannel;
    private messageUpdater;
    private gamemodeDisplayName;
    private gamemodeId;
    private interactionListener;
    private getNumberWithOrdinal;
    constructor(client: Client, guild: Guild, ratingService: RatingService, gamemodeId: string, gamemodeDisplayName: string);
    initialize(category: CategoryChannel): Promise<void>;
    private initializeMessageUpdater;
    private buildLeaderboardEmbed;
    private createRankButton;
    private setupInteractionHandlers;
    private handleShowRank;
    private handleShowHistory;
    updateLeaderboard(): Promise<void>;
    getUserRank(userId: string): Promise<{
        rank: number;
        entry: any;
    } | null>;
    createUserRankEmbed(userId: string, rank: number, entry: any): EmbedBuilder;
    createUserHistoryEmbed(userId: string, history: any[]): EmbedBuilder;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=leaderboard.d.ts.map