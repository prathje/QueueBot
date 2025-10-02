import { IRating, IMatchResult, RatingValue } from '../types';
export declare class RatingService {
    private gamemodeId;
    private defaultRating;
    constructor(gamemodeId: string);
    /**
     * Process match result and calculate rating changes for all players
     * TODO: We might want to lock this at some point, however, if two matches finish at the same time, the players should be different
     */
    processMatchResult(matchResult: IMatchResult): Promise<void>;
    /**
     * Get current rating for a player (latest rating or default if no history)
     */
    getPlayerRating(playerId: string): Promise<RatingValue>;
    /**
     * Get rating history for a player
     */
    getPlayerRatingHistory(playerId: string, limit?: number): Promise<IRating[]>;
    /**
     * Get leaderboard for the gamemode
     */
    getLeaderboard(limit?: number): Promise<Array<{
        player: string;
        rating: RatingValue;
        ordinal: number;
        ordinalDiff: number;
        matches: number;
    }>>;
    /**
     * Calculate rating changes based on match result using OpenSkill
     */
    private calculateRatingChanges;
    /**
     * Calculate ordinal rating from mu and sigma values using OpenSkill
     */
    private calculateOrdinal;
    /**
     * Save rating change to database
     */
    private saveRatingChange;
    /**
     * Get gamemode ID
     */
    getGamemodeId(): string;
}
//# sourceMappingURL=rating.d.ts.map