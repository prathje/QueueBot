import { IMatch, IQueue } from '../types';
export declare class MatchmakingService {
    private playerService;
    constructor();
    processQueue(queue: IQueue): Promise<IMatch | null>;
    private selectPlayersForMatch;
    private createTeams;
    private selectMap;
}
//# sourceMappingURL=matchmaking.d.ts.map