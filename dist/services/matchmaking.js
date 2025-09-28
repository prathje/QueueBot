"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingService = void 0;
const uuid_1 = require("uuid");
const types_1 = require("../types");
const players_1 = require("./players");
class MatchmakingService {
    constructor() {
        this.playerService = players_1.PlayerService.getInstance();
    }
    async processQueue(queue) {
        const playersInQueue = this.playerService.getPlayersInQueue(queue.id);
        if (playersInQueue.length < queue.playerCount) {
            return null;
        }
        const selectedPlayers = this.selectPlayersForMatch(playersInQueue, queue.playerCount);
        const teams = this.createTeams(selectedPlayers, queue.matchmakingAlgorithm);
        const map = this.selectMap(queue.mapPool);
        const match = {
            id: (0, uuid_1.v4)(),
            queueId: queue.id,
            gamemodeId: queue.gamemodeId,
            players: selectedPlayers,
            teams,
            map,
            state: types_1.MatchState.INITIAL,
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
    selectPlayersForMatch(playersInQueue, playerCount) {
        const shuffled = [...playersInQueue].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, playerCount);
    }
    createTeams(players, algorithm) {
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        const teamSize = Math.floor(players.length / 2);
        return {
            team1: shuffledPlayers.slice(0, teamSize),
            team2: shuffledPlayers.slice(teamSize, teamSize * 2)
        };
    }
    selectMap(mapPool) {
        const randomIndex = Math.floor(Math.random() * mapPool.length);
        return mapPool[randomIndex];
    }
}
exports.MatchmakingService = MatchmakingService;
//# sourceMappingURL=matchmaking.js.map