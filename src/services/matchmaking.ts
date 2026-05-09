import { v4 as uuidv4 } from 'uuid';
import { IMatch, IQueue, MatchState, RatingValue } from '../types';
import { PlayerService } from './players';
import { RatingService } from './rating';
import { shuffled, randomElement, generateCombinations } from '../utils';
import { ordinal } from 'openskill';
import { MatchResult } from '../models/MatchResult';

export enum MatchmakingAlgorithm {
  RANDOM_TEAMS = 'random teams',
  FAIR_TEAMS = 'fair teams',
  FAIR_TOP_2 = 'fair top 2',
  FAIR_TOP_3 = 'fair top 3',
  FAIR_TOP_4 = 'fair top 4',
}

const FAIR_ALGORITHM_TOP_K: Partial<Record<MatchmakingAlgorithm, number>> = {
  [MatchmakingAlgorithm.FAIR_TEAMS]: 1,
  [MatchmakingAlgorithm.FAIR_TOP_2]: 2,
  [MatchmakingAlgorithm.FAIR_TOP_3]: 3,
  [MatchmakingAlgorithm.FAIR_TOP_4]: 4,
};

export class MatchmakingService {
  private playerService: PlayerService;
  private ratingService: RatingService;

  constructor(gamemodeId: string) {
    this.playerService = PlayerService.getInstance();
    this.ratingService = new RatingService(gamemodeId);
  }

  async processQueue(queue: IQueue): Promise<IMatch | null> {
    const playersInQueue = this.playerService.getPlayersInQueue(queue.id);

    if (playersInQueue.length < queue.playerCount) {
      return null;
    }

    const selectedPlayers = this.selectPlayersForMatch(playersInQueue, queue.playerCount);
    const teams = await this.createTeams(selectedPlayers, queue.matchmakingAlgorithm as MatchmakingAlgorithm);
    const map = await this.selectMap(queue.mapPool, queue.id, selectedPlayers);

    const match: IMatch = {
      id: uuidv4(),
      queueId: queue.id,
      gamemodeId: queue.gamemodeId,
      players: selectedPlayers,
      teams,
      map,
      state: MatchState.INITIAL,
      discordChannelId: null,
      discordVoiceChannel1Id: null,
      discordVoiceChannel2Id: null,
      readyPlayers: [],
      votes: {
        team1: [],
        team2: [],
        cancel: [],
      },
      createdAt: new Date(),
      startedAt: null,
      updatedAt: new Date(),
    };

    return match;
  }

  private selectPlayersForMatch(playersInQueue: string[], playerCount: number): string[] {
    return shuffled(playersInQueue).slice(0, playerCount);
  }

  private async createTeams(
    players: string[],
    algorithm: MatchmakingAlgorithm,
  ): Promise<{ team1: string[]; team2: string[] }> {
    const topK = FAIR_ALGORITHM_TOP_K[algorithm];
    if (topK !== undefined) {
      try {
        return await this.createTeamsFair(players, topK);
      } catch (error) {
        console.error('Error creating fair teams, falling back to random teams:', error);
      }
    }
    // random teams by default
    return this.createTeamsRandom(players);
  }

  private createTeamsRandom(players: string[]): { team1: string[]; team2: string[] } {
    const shuffledPlayers = shuffled(players);
    const teamSize = Math.ceil(players.length / 2); // this was floor, but ceil makes sense for our test queue for a single player

    return {
      team1: shuffledPlayers.slice(0, teamSize),
      team2: shuffledPlayers.slice(teamSize, teamSize * 2),
    };
  }

  private async createTeamsFair(
    players: string[],
    topK: number,
  ): Promise<{ team1: string[]; team2: string[] }> {
    if (players.length <= 2) {
      // For 2 or fewer players, just assign them randomly
      return this.createTeamsRandom(players);
    }

    // Fair team creation algorithm
    // Generate all possible team combinations
    const teamSize = Math.ceil(players.length / 2);

    const combinations: Array<{ team1: string[]; team2: string[]; probDiff: number }> = [];

    // Fetch all player ratings once
    const playerRatings = new Map<string, RatingValue>();
    for (const playerId of players) {
      const rating = await this.ratingService.getPlayerRating(playerId);
      playerRatings.set(playerId, rating);
    }

    // Fix the first player to team1 and generate combinations for the remaining slots
    // This avoids duplicate combinations that are just team swaps
    const firstPlayer = players[0];
    const remainingPlayers = players.slice(1);
    const remainingCombinations = generateCombinations(remainingPlayers, teamSize - 1);

    // Calculate rating differences for each combination
    for (const remainingTeam1 of remainingCombinations) {
      const team1 = [firstPlayer, ...remainingTeam1];
      const team2 = players.filter((player) => !team1.includes(player));

      const team1Ratings = team1.map((playerId) => playerRatings.get(playerId)!);
      const team2Ratings = team2.map((playerId) => playerRatings.get(playerId)!);

      const winProbs: number[] = await this.ratingService.predictWin([team1Ratings, team2Ratings]);

      const probDiff = Math.abs(winProbs[0] - winProbs[1]); // Closer to 0.5 is more fair, i.e. smaller difference

      combinations.push({
        team1: team1,
        team2: team2,
        probDiff: probDiff,
      });
    }

    // log the team combinations and their win probabilities
    console.log(combinations);

    if (combinations.length === 0) {
      console.log('No valid team combinations found, falling back to random teams.');
      // Fallback to random teams if something goes wrong
      return this.createTeamsRandom(players);
    }

    // Sort by fairness (smallest probability difference first) and pick randomly from the top K
    combinations.sort((a, b) => a.probDiff - b.probDiff);
    const topCombinations = combinations.slice(0, Math.max(1, topK));
    const selected = randomElement(topCombinations);

    console.log(
      `Selected one of the top ${topCombinations.length} fairest combinations (out of ${combinations.length}):`,
      selected,
    );

    // Randomly assign which team is team1 and which is team2
    const shouldSwap = Math.random() < 0.5;
    return shouldSwap
      ? { team1: selected.team2, team2: selected.team1 }
      : { team1: selected.team1, team2: selected.team2 };
  }

  private async selectMap(mapPool: string[], queueId: string, players: string[]): Promise<string> {
    // For each player, find their most recent completed match in this queue
    const lastMatches = await MatchResult.aggregate([
      { $match: { queueId, players: { $in: players } } },
      { $sort: { completedAt: -1 } },
      { $unwind: '$players' },
      { $match: { players: { $in: players } } },
      { $group: { _id: '$players', map: { $first: '$map' } } },
    ]);

    const playedMaps = new Set(lastMatches.map((r: { map: string }) => r.map));
    const filteredPool = mapPool.filter((m) => !playedMaps.has(m));

    return randomElement(filteredPool.length > 0 ? filteredPool : mapPool);
  }
}
