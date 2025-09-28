import { IPlayer } from '../types';
export declare class PlayerService {
    private static instance;
    private players;
    private constructor();
    static getInstance(): PlayerService;
    getOrCreatePlayer(discordId: string, username: string): Promise<IPlayer>;
    getPlayer(discordId: string): Promise<IPlayer | null>;
    updatePlayer(player: IPlayer): Promise<void>;
    addPlayerToQueue(discordId: string, queueId: string): Promise<void>;
    removePlayerFromQueue(discordId: string, queueId: string): Promise<void>;
    removePlayerFromAllQueues(discordId: string): Promise<void>;
    setPlayerMatch(discordId: string, matchId: string | null): Promise<void>;
    isPlayerInQueue(discordId: string, queueId: string): boolean;
    isPlayerInMatch(discordId: string): boolean;
    getPlayersInQueue(queueId: string): string[];
    resetAllPlayers(): Promise<number>;
}
//# sourceMappingURL=players.d.ts.map