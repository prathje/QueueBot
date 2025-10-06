import { IMatchResult, IRating, RatingValue } from '../types';
export declare class RatingService {
    private gamemodeId;
    private ratingDefault;
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
     * Clear all ratings for this gamemode
     */
    clearRatings(): Promise<void>;
    /**
     * Reset ratings by clearing existing ones and recomputing from historical match results
     */
    resetRatings(): Promise<void>;
    predictWin(teamsWithPlayerRatings: RatingValue[][]): Promise<number[]>;
}
//# sourceMappingURL=rating.d.ts.map