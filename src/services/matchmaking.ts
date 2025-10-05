import { v4 as uuidv4 } from 'uuid';
import {IMatch, IQueue, MatchState, RatingValue} from '../types';
import { PlayerService } from './players';
import { RatingService } from './rating';
import { shuffled, randomElement, generateCombinations } from '../utils';
import { ordinal } from 'openskill';

export enum MatchmakingAlgorithm {
  RANDOM_TEAMS = 'random teams',
  FAIR_TEAMS = 'fair teams'
}

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
    const map = this.selectMap(queue.mapPool);

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
        cancel: []
      },
      createdAt: new Date(),
      startedAt: null,
      updatedAt: new Date()
    };

    return match;
  }

  private selectPlayersForMatch(playersInQueue: string[], playerCount: number): string[] {
    return shuffled(playersInQueue).slice(0, playerCount);
  }

  private async createTeams(players: string[], algorithm: MatchmakingAlgorithm): Promise<{ team1: string[]; team2: string[] }> {

    if (algorithm === MatchmakingAlgorithm.FAIR_TEAMS) {
      try {
        return await this.createTeamsFair(players);
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
      team2: shuffledPlayers.slice(teamSize, teamSize * 2)
    };
  }

  private async createTeamsFair(players: string[]): Promise<{ team1: string[]; team2: string[] }> {

    if (players.length <= 2) {
        // For 2 or fewer players, just assign them randomly
        return this.createTeamsRandom(players);
    }

    // Fair team creation algorithm
    // Generate all possible team combinations
    const teamSize = Math.ceil(players.length / 2);

    let combinations: Array<{ team1: string[]; team2: string[]; probDiff: number }> = [];

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

    let bestCombination: { team1: string[]; team2: string[]; probDiff: number } | null = null;

    // Calculate rating differences for each combination
    for (const remainingTeam1 of remainingCombinations) {
      const team1 = [firstPlayer, ...remainingTeam1];
      const team2 = players.filter(player => !team1.includes(player));

      const team1Ratings = team1.map(playerId => playerRatings.get(playerId)!);
      const team2Ratings = team2.map(playerId => playerRatings.get(playerId)!);

      const winProbs: number[] = await this.ratingService.predictWin([team1Ratings, team2Ratings]);

      const probDiff = Math.abs(winProbs[0] - winProbs[1]); // Closer to 0.5 is more fair, i.e. smaller difference

      const combination = {
        team1: team1,
        team2: team2,
        probDiff: probDiff
      };

      if (!bestCombination || combination.probDiff < bestCombination.probDiff) {
          bestCombination = combination;
      }

      combinations.push(combination);
    }

    // log the team combinations and their win probabilities
    console.log(combinations);

    if (!bestCombination) {
        console.log("No valid team combinations found, falling back to random teams.");
        // Fallback to random teams if something goes wrong
        return this.createTeamsRandom(players);
    }

    console.log("Selected teams with minimal win probability difference:", bestCombination);

    // Randomly assign which team is team1 and which is team2
    const shouldSwap = Math.random() < 0.5;
    return shouldSwap
      ? { team1: bestCombination.team2, team2: bestCombination.team1 }
      : { team1: bestCombination.team1, team2: bestCombination.team2 };
  }

  private selectMap(mapPool: string[]): string {
    return randomElement(mapPool);
  }
}