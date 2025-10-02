import { Client, CategoryChannel, Guild } from 'discord.js';
import { RatingService } from './rating';
export declare class Leaderboard {
    private client;
    private guild;
    private ratingService;
    private leaderboardChannel;
    private messageUpdater;
    private gamemodeDisplayName;
    private gamemodeId;
    constructor(client: Client, guild: Guild, ratingService: RatingService, gamemodeId: string, gamemodeDisplayName: string);
    initialize(category: CategoryChannel): Promise<void>;
    private sendInitialLeaderboard;
    private buildLeaderboardEmbed;
    updateLeaderboard(): Promise<void>;
}
//# sourceMappingURL=leaderboard.d.ts.map