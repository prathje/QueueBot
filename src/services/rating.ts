import { MatchResult, Rating } from '../models';
import { IMatchResult, IRating, RatingValue } from '../types';
import { ordinal, predictWin, rate, rating } from 'openskill';

const RATING_DEFAULT = rating();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Display-only transform. Storage and matchmaking use raw OpenSkill values;
// these constants just make ratings look like a familiar MMR number and
// per-match changes feel more substantial to players.
export const RATING_DISPLAY_BASE = 1000;
export const RATING_DISPLAY_SCALE = 20;
export const RATING_DISPLAY_DECIMALS = 0;

// Daily target for displayed-rating decay of an above-average inactive player.
// Set to 0 to disable decay entirely; getLeaderboard then takes a faster
// Mongo-side aggregation path that uses the stored ordinals directly.
export const RATING_DECAY_PER_DAY: number = 5;

// Hide players from the leaderboard if their last match is older than this
// many days. Set to 0 to disable the filter (e.g. when decay alone is enough
// to push truly inactive players off the visible top of the board).
export const LEADERBOARD_ACTIVE_DAYS: number = 0;

// Split the displayed daily loss 50/50 between mu (regression toward the
// default mean) and sigma (uncertainty growth toward the base sigma):
//   displayed_loss/day = SCALE * |Δmu|             (mu half)
//                      + 3 * SCALE * Δsigma        (sigma half)
//                      = RATING_DECAY_PER_DAY
// For below-average players mu drifts up toward the mean, which adds positive
// displayed change that cancels the sigma loss — they don't get further
// punished for being idle.
const MU_DECAY_PER_MS = RATING_DECAY_PER_DAY / 2 / RATING_DISPLAY_SCALE / MS_PER_DAY;
const SIGMA_DECAY_PER_MS = RATING_DECAY_PER_DAY / 2 / (3 * RATING_DISPLAY_SCALE) / MS_PER_DAY;

/**
 * Drift a rating toward the displayed prior (ord = baseMu − 3·baseSigma) by
 * a fixed amount per day, regardless of which (mu, sigma) state the player
 * happens to be in. The displayed rating moves at exactly RATING_DECAY_PER_DAY
 * per day until it lands on the prior, then stops.
 *
 * Mechanism:
 *  - Above the prior (ord > baseOrd): drop ord. Mu drops toward baseMu (only
 *    if μ > baseMu) and sigma grows toward baseSigma. Drop is split 50/50 in
 *    ord-units; if one variable runs out of room, the other absorbs the rest.
 *  - Below the prior (ord < baseOrd): raise ord. Only mu can rise (growing
 *    sigma would push ord further below). Sigma stays put.
 *
 * The legacy muDecayPerMs and sigmaDecayPerMs parameters now act as a rate
 * preference: their sum (mu + 3·sigma) is the total ord-decay rate, and the
 * 50/50 split inside the function is independent of how that sum is broken
 * down. With the defaults (mu = 3·sigma) they describe both the sum and the
 * actual mu/sigma changes per day; with imbalanced rates only the sum
 * matters.
 */
export function applyRatingDecay(
  value: RatingValue,
  lastUpdate: Date,
  asOf: Date,
  baseMu: number = RATING_DEFAULT.mu,
  baseSigma: number = RATING_DEFAULT.sigma,
  muDecayPerMs: number = MU_DECAY_PER_MS,
  sigmaDecayPerMs: number = SIGMA_DECAY_PER_MS,
): RatingValue {
  const elapsedMs = Math.max(0, asOf.getTime() - lastUpdate.getTime());
  if (elapsedMs === 0) return { mu: value.mu, sigma: value.sigma };

  const ord = value.mu - 3 * value.sigma;
  const baseOrd = baseMu - 3 * baseSigma;
  const distance = ord - baseOrd;
  if (distance === 0) return { mu: value.mu, sigma: value.sigma };

  const ordRatePerMs = muDecayPerMs + 3 * sigmaDecayPerMs;
  if (ordRatePerMs <= 0) return { mu: value.mu, sigma: value.sigma };

  // Signed ord change to apply this step, clamped so we never overshoot the
  // prior. Direction is opposite to the sign of distance.
  const stepMagnitude = Math.min(Math.abs(distance), elapsedMs * ordRatePerMs);

  if (distance > 0) {
    // Above the prior: ord drops. Pull mu down (if μ > baseMu) and grow sigma.
    const muRoom = Math.max(0, value.mu - baseMu);
    const sigmaRoom = Math.max(0, baseSigma - value.sigma);

    let muDrop = stepMagnitude / 2;
    let sigmaGrow = stepMagnitude / 6;

    if (muDrop > muRoom) {
      sigmaGrow += (muDrop - muRoom) / 3;
      muDrop = muRoom;
    }
    if (sigmaGrow > sigmaRoom) {
      muDrop += (sigmaGrow - sigmaRoom) * 3;
      sigmaGrow = sigmaRoom;
    }

    return {
      mu: value.mu - muDrop,
      sigma: value.sigma + sigmaGrow,
    };
  }

  // Below the prior: ord rises via mu only; sigma stays put.
  const muRoom = Math.max(0, baseMu - value.mu);
  const muRise = Math.min(stepMagnitude, muRoom);
  return {
    mu: value.mu + muRise,
    sigma: value.sigma,
  };
}

export class RatingService {
  private gamemodeId: string;
  private ratingDefault = RATING_DEFAULT; // OpenSkill default values

  constructor(gamemodeId: string) {
    this.gamemodeId = gamemodeId;
  }

  /**
   * Process match result and calculate rating changes for all players
   * TODO: We might want to lock this at some point, however, if two matches finish at the same time, the players should be different
   */
  async processMatchResult(matchResult: IMatchResult): Promise<void> {
    //console.log(`Processing rating changes for match ${matchResult.matchId} in gamemode ${this.gamemodeId}`);

    // Get current ratings for all players, decayed to the match completion time
    // so the "before" we feed OpenSkill (and store in the rating doc) reflects
    // any inactivity since the player's previous match.
    const playerRatings = new Map<string, RatingValue>();
    for (const playerId of matchResult.players) {
      const currentRating = await this.getPlayerRating(playerId, matchResult.completedAt);
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
   * Get current rating for a player (latest rating or default if no history),
   * with sigma decay applied based on time elapsed since the last update.
   */
  async getPlayerRating(playerId: string, asOf: Date = new Date()): Promise<RatingValue> {
    const latestRating = await Rating.findOne({
      player: playerId,
      gamemode: this.gamemodeId,
    }).sort({ date: -1 });

    if (!latestRating) {
      return { mu: this.ratingDefault.mu, sigma: this.ratingDefault.sigma };
    }

    return applyRatingDecay(latestRating.after, latestRating.date, asOf);
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
   * Full rating history for a player, ascending by date — for charting where
   * we want every event plus the decay segments between them.
   */
  async getPlayerRatingHistoryAscending(playerId: string): Promise<IRating[]> {
    return await Rating.find({
      player: playerId,
      gamemode: this.gamemodeId,
    })
      .sort({ date: 1 })
      .lean();
  }

  /**
   * Get leaderboard for the gamemode
   */
  async getLeaderboard(
    limit: number = 50,
  ): Promise<Array<{ player: string; rating: RatingValue; ordinal: number; ordinalDiff: number; matches: number }>> {
    // Get latest rating and total match count for each player. Optionally
    // filter out players whose last match is older than LEADERBOARD_ACTIVE_DAYS;
    // when set to 0 we include everyone (decay alone keeps inactive players down).
    const now = new Date();
    const filterByActivity = LEADERBOARD_ACTIVE_DAYS > 0;
    const cutoffDate = new Date(now.getTime() - LEADERBOARD_ACTIVE_DAYS * MS_PER_DAY);

    // When decay is disabled the stored ordinalAfter is still authoritative, so
    // we let Mongo do the sort + limit. With decay enabled we have to fetch
    // candidate players and re-sort in JS because decay can re-rank them.
    if (RATING_DECAY_PER_DAY === 0) {
      const pipeline: any[] = [
        { $match: { gamemode: this.gamemodeId } },
        { $sort: { player: 1 as const, date: -1 as const } },
        {
          $group: {
            _id: '$player',
            rating: { $first: '$after' },
            ordinal: { $first: '$ordinalAfter' },
            ordinalDiff: { $first: '$ordinalDiff' },
            lastPlayed: { $first: '$date' },
            matches: { $sum: 1 },
          },
        },
      ];
      if (filterByActivity) {
        pipeline.push({ $match: { lastPlayed: { $gte: cutoffDate } } });
      }
      pipeline.push(
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
      );

      return await Rating.aggregate(pipeline);
    }

    const pipeline: any[] = [
      { $match: { gamemode: this.gamemodeId } },
      { $sort: { player: 1 as const, date: -1 as const } },
      {
        $group: {
          _id: '$player',
          rating: { $first: '$after' },
          ordinalDiff: { $first: '$ordinalDiff' },
          lastPlayed: { $first: '$date' },
          matches: { $sum: 1 },
        },
      },
    ];
    if (filterByActivity) {
      pipeline.push({ $match: { lastPlayed: { $gte: cutoffDate } } });
    }

    const rawEntries: Array<{
      _id: string;
      rating: RatingValue;
      ordinalDiff: number;
      lastPlayed: Date;
      matches: number;
    }> = await Rating.aggregate(pipeline as any);

    // Apply sigma decay against "now" so inactive players slide down the leaderboard,
    // then sort and slice in memory (decay can re-rank players).
    return rawEntries
      .map((entry) => {
        const decayedRating = applyRatingDecay(entry.rating, entry.lastPlayed, now);
        return {
          player: entry._id,
          rating: decayedRating,
          ordinal: ordinal(decayedRating),
          ordinalDiff: entry.ordinalDiff,
          matches: entry.matches,
        };
      })
      .sort((a, b) => b.ordinal - a.ordinal)
      .slice(0, limit);
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
