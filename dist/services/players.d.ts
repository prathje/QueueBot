import { IPlayer } from '../types';
export declare class PlayerService {
    private static instance;
    private players;
    private queueUpdateCallbacks;
    private constructor();
    static getInstance(): PlayerService;
    getOrCreatePlayer(discordId: string, username: string): Promise<IPlayer>;
    getPlayer(discordId: string): Promise<IPlayer | null>;
    updatePlayer(player: IPlayer): Promise<void>;
    addPlayerToQueue(discordId: string, queueId: string): Promise<void>;
    removePlayerFromQueue(discordId: string, queueId: string): Promise<void>;
    onPlayersFoundMatch(discordIds: string[], matchId: string): Promise<void>;
    setPlayerMatch(discordId: string, matchId: string | null): Promise<void>;
    isPlayerInQueue(discordId: string, queueId: string): boolean;
    isPlayerInMatch(discordId: string): boolean;
    getPlayersInQueue(queueId: string): string[];
    registerQueueUpdateCallback(queueId: string, callback: () => Promise<void>): void;
    unregisterQueueUpdateCallback(queueId: string): void;
    private notifyQueuesUpdate;
    resetAllPlayers(): Promise<number>;
}
//# sourceMappingURL=players.d.ts.map