export interface IPlayer {
  discordId: string;
  username: string;
  currentQueues: string[];
  currentMatch: string | null;
}

export interface IGamemode {
  id: string;
  displayName: string;
  discordCategoryId?: string;
}

export interface IQueue {
  id: string;
  gamemodeId: string;
  displayName: string;
  mapPool: string[];
  playerCount: number;
  matchmakingAlgorithm: string;
  discordChannelId?: string;
  players: string[];
  disabled?: boolean;
}

export interface IMatch {
  id: string;
  queueId: string;
  gamemodeId: string;
  players: string[];
  teams: {
    team1: string[];
    team2: string[];
  };
  map: string;
  state: MatchState;
  discordChannelId: string | null;
  discordVoiceChannel1Id: string | null;
  discordVoiceChannel2Id: string | null;
  readyPlayers: string[];
  votes: {
    team1: string[];
    team2: string[];
    cancel: string[];
  };
  createdAt: Date;
  startedAt: Date | null;
  updatedAt: Date;
}

export interface IMatchResult {
  matchId: string;
  gamemodeId: string;
  queueId: string;
  winningTeam: 1 | 2;
  map: string;
  teams: {
    team1: string[];
    team2: string[];
  };
  players: string[];
  displayNames: { [discordId: string]: string };
  startedAt: Date;
  completedAt: Date;
}

export enum MatchState {
  INITIAL = 'initial',
  CREATED = 'created',
  READY_UP = 'ready_up',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  CLOSED = 'closed'
}

export enum TeamName {
  TEAM1 = 'Red',
  TEAM2 = 'Blue'
}

export const getTeamName = (teamNumber: 1 | 2): string => {
  return teamNumber === 1 ? TeamName.TEAM1 : TeamName.TEAM2;
};

export interface QueueConfig {
  id: string;
  displayName: string;
  mapPool: string[];
  playerCount: number;
  matchmakingAlgorithm: string;
}

export interface GamemodeConfig {
  id: string;
  displayName: string;
  queues: QueueConfig[];
}