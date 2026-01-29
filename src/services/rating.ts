import { MatchResult, Rating } from '../models';
import { IMatchResult, IRating, RatingValue } from '../types';
import { ordinal, predictWin, rate, rating } from 'openskill';

export class RatingService {
  private gamemodeId: string;
  private ratingDefault = rating(); // OpenSkill default values

  constructor(gamemodeId: string) {
    this.gamemodeId = gamemodeId;
  }

  /**
   * Process match result and calculate rating changes for all players
   * TODO: We might want to lock this at some point, however, if two matches finish at the same time, the players should be different
   */
  async processMatchResult(matchResult: IMatchResult): Promise<void> {
    //console.log(`Processing rating changes for match ${matchResult.matchId} in gamemode ${this.gamemodeId}`);

    // Get current ratings for all players
    const playerRatings = new Map<string, RatingValue>();
    for (const playerId of matchResult.players) {
      const currentRating = await this.getPlayerRating(playerId);
      playerRatings.set(playerId, currentRating);
    }

    // Calculate rating changes
    const newRatings = this.calculateRatingChanges(matchResult, playerRatings);

    // Save rating changes to database
    for (const [playerId, newRating] of newRatings.entries()) {
      const before = playerRatings.get(playerId)!;

      // Calculate ordinal values
      const ordinalBefore = ordinal(before);
      const ordinalAfter = ordinal(newRating);
      const ordinalDiff = ordinalAfter - ordinalBefore;

      const rating = new Rating({
        player: playerId,
        gamemode: this.gamemodeId,
        matchId: matchResult.matchId,
        date: matchResult.completedAt,
        before: before,
        after: newRating,
        ordinalBefore: ordinalBefore,
        ordinalAfter: ordinalAfter,
        ordinalDiff: ordinalDiff,
      });
      await rating.save();
    }

    //console.log(`Saved rating changes for ${newRatings.size} players in match ${matchResult.matchId}`);
  }

  /**
   * Get current rating for a player (latest rating or default if no history)
   */
  async getPlayerRating(playerId: string): Promise<RatingValue> {
    const latestRating = await Rating.findOne({
      player: playerId,
      gamemode: this.gamemodeId,
    }).sort({ date: -1 });

    return latestRating?.after ?? { mu: this.ratingDefault.mu, sigma: this.ratingDefault.sigma };
  }

  /**
   * Get rating history for a player
   */
  async getPlayerRatingHistory(playerId: string, limit: number = 10): Promise<IRating[]> {
    return await Rating.find({
      player: playerId,
      gamemode: this.gamemodeId,
    })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get leaderboard for the gamemode
   */
  async getLeaderboard(
    limit: number = 50,
  ): Promise<Array<{ player: string; rating: RatingValue; ordinal: number; ordinalDiff: number; matches: number }>> {
    // Get latest rating for each player (only include players active in the last 28 days)
    const cutoffDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const pipeline = [
      { $match: { gamemode: this.gamemodeId, date: { $gte: cutoffDate } } },
      { $sort: { player: 1 as const, date: -1 as const } },
      {
        $group: {
          _id: '$player',
          rating: { $first: '$after' },
          ordinal: { $first: '$ordinalAfter' },
          ordinalDiff: { $first: '$ordinalDiff' },
          matches: { $sum: 1 },
        },
      },
      { $sort: { ordinal: -1 as const } },
      { $limit: limit },
      {
        $project: {
          player: '$_id',
          rating: 1,
          ordinal: 1,
          ordinalDiff: 1,
          matches: 1,
          _id: 0,
        },
      },
    ];

    return await Rating.aggregate(pipeline as any);
  }

  /**
   * Calculate rating changes based on match result using OpenSkill
   */
  private calculateRatingChanges(
    matchResult: IMatchResult,
    playerRatings: Map<string, RatingValue>,
  ): Map<string, RatingValue> {
    const newRatings = new Map<string, RatingValue>();

    const team1Ids = matchResult.teams.team1;
    const team2Ids = matchResult.teams.team2;

    // Prepare teams for OpenSkill
    const team1Ratings = team1Ids.map((playerId) => {
      const playerRating = playerRatings.get(playerId)!;
      return rating({ mu: playerRating.mu, sigma: playerRating.sigma });
    });

    const team2Ratings = team2Ids.map((playerId) => {
      const playerRating = playerRatings.get(playerId)!;
      return rating({ mu: playerRating.mu, sigma: playerRating.sigma });
    });

    // Calculate new ratings using OpenSkill convenience pattern
    const [[...newTeam1Ratings], [...newTeam2Ratings]] = rate([team1Ratings, team2Ratings], {
      rank: matchResult.winningTeam === 1 ? [1, 2] : [2, 1], // Winner gets rank 1, loser gets rank 2
    });

    // Map the results back to our format
    team1Ids.forEach((playerId, index) => {
      const newRating = newTeam1Ratings[index];
      newRatings.set(playerId, { mu: newRating.mu, sigma: newRating.sigma });
    });

    team2Ids.forEach((playerId, index) => {
      const newRating = newTeam2Ratings[index];
      newRatings.set(playerId, { mu: newRating.mu, sigma: newRating.sigma });
    });

    return newRatings;
  }

  /**
   * Clear all ratings for this gamemode
   */
  async clearRatings(): Promise<void> {
    await Rating.deleteMany({ gamemode: this.gamemodeId });
    console.log(`Cleared all ratings for gamemode ${this.gamemodeId}`);
  }

  /**
   * Reset ratings by clearing existing ones and recomputing from historical match results
   */
  async resetRatings(): Promise<void> {
    console.log(`Resetting ratings for gamemode ${this.gamemodeId}...`);

    // Clear existing ratings
    await this.clearRatings();

    // Get all historical match results for this gamemode, ordered by completion time
    const historicalResults = await MatchResult.find({ gamemodeId: this.gamemodeId }).sort({ completedAt: 1 }).lean();

    console.log(`Found ${historicalResults.length} historical match results to reprocess`);

    // Reprocess each match result in chronological order
    for (const matchResult of historicalResults) {
      await this.processMatchResult(matchResult as IMatchResult);
    }

    console.log(`Rating reset complete for gamemode ${this.gamemodeId}`);
  }

  async predictWin(teamsWithPlayerRatings: RatingValue[][]): Promise<number[]> {
    // Convert RatingValue arrays to OpenSkill rating objects for each team
    const teams = teamsWithPlayerRatings.map((teamRatings) =>
      teamRatings.map((playerRating) => rating({ mu: playerRating.mu, sigma: playerRating.sigma })),
    );

    // Use OpenSkill's predict function to get win probabilities
    // predict returns an array of probabilities, one for each team
    return predictWin(teams);
  }
}
