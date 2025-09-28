import { v4 as uuidv4 } from 'uuid';
import { IMatch, IQueue, MatchState } from '../types';
import { PlayerService } from './players';

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
    const teams = this.createTeams(selectedPlayers, queue.matchmakingAlgorithm);
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
      updatedAt: new Date()
    };

    for (const playerId of selectedPlayers) {
      await this.playerService.removePlayerFromAllQueues(playerId);
      await this.playerService.setPlayerMatch(playerId, match.id);
    }

    return match;
  }

  private selectPlayersForMatch(playersInQueue: string[], playerCount: number): string[] {
    const shuffled = [...playersInQueue].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, playerCount);
  }

  private createTeams(players: string[], algorithm: string): { team1: string[]; team2: string[] } {
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    const teamSize = Math.floor(players.length / 2);

    return {
      team1: shuffledPlayers.slice(0, teamSize),
      team2: shuffledPlayers.slice(teamSize, teamSize * 2)
    };
  }

  private selectMap(mapPool: string[]): string {
    const randomIndex = Math.floor(Math.random() * mapPool.length);
    return mapPool[randomIndex];
  }
}