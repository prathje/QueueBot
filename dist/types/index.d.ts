export interface IPlayer {
    discordId: string;
    username: string;
    currentQueues: string[];
    currentMatch?: string;
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
    discordChannelId?: string;
    discordVoiceChannel1Id?: string;
    discordVoiceChannel2Id?: string;
    readyPlayers: string[];
    votes: {
        team1: string[];
        team2: string[];
        cancel: string[];
    };
    createdAt: Date;
    updatedAt: Date;
}
export interface IMatchResult {
    matchId: string;
    queueId: string;
    gamemodeId: string;
    winningTeam: 1 | 2;
    map: string;
    players: string[];
    completedAt: Date;
}
export declare enum MatchState {
    INITIAL = "initial",
    CREATED = "created",
    READY_UP = "ready_up",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    CLOSED = "closed"
}
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
//# sourceMappingURL=index.d.ts.map