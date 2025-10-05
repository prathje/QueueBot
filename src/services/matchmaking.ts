import { v4 as uuidv4 } from 'uuid';
import { IMatch, IQueue, MatchState } from '../types';
import { PlayerService } from './players';
import { shuffled, randomElement } from '../utils';

export enum MatchmakingAlgorithm {
  RANDOM_TEAMS = 'random teams',
  FAIR_TEAMS = 'fair teams'
}

export class MatchmakingService {
  private playerService: PlayerService;

  constructor() {
    this.playerService = PlayerService.getInstance();
  }

  async processQueue(queue: IQueue): Promise<IMatch | null> {
    const playersInQueue = this.playerService.getPlayersInQueue(queue.id);

    if (playersInQueue.length < queue.playerCount) {
      return null;
    }

    const selectedPlayers = this.selectPlayersForMatch(playersInQueue, queue.playerCount);
    const teams = this.createTeams(selectedPlayers, queue.matchmakingAlgorithm as MatchmakingAlgorithm);
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

  private createTeams(players: string[], algorithm: MatchmakingAlgorithm): { team1: string[]; team2: string[] } {

    if (algorithm === MatchmakingAlgorithm.FAIR_TEAMS) {
      return this.createTeamsFair(players);
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

  private createTeamsFair(players: string[]): { team1: string[]; team2: string[] } {
    // Placeholder for a fair team creation algorithm
  }

  private selectMap(mapPool: string[]): string {
    return randomElement(mapPool);
  }
}