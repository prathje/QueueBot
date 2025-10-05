import { IMatch, IQueue } from '../types';
export declare enum MatchmakingAlgorithm {
    RANDOM_TEAMS = "random teams",
    FAIR_TEAMS = "fair teams"
}
export declare class MatchmakingService {
    private playerService;
    private ratingService;
    constructor(gamemodeId: string);
    processQueue(queue: IQueue): Promise<IMatch | null>;
    private selectPlayersForMatch;
    private createTeams;
    private createTeamsRandom;
    private createTeamsFair;
    private selectMap;
}
//# sourceMappingURL=matchmaking.d.ts.map