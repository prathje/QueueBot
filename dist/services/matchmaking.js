"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingService = void 0;
const uuid_1 = require("uuid");
const types_1 = require("../types");
const players_1 = require("./players");
const utils_1 = require("../utils");
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
    selectPlayersForMatch(playersInQueue, playerCount) {
        return (0, utils_1.shuffled)(playersInQueue).slice(0, playerCount);
    }
    createTeams(players, algorithm) {
        const shuffledPlayers = (0, utils_1.shuffled)(players);
        const teamSize = Math.ceil(players.length / 2); // this was floor, but ceil makes sense for our test queue for a single player
        return {
            team1: shuffledPlayers.slice(0, teamSize),
            team2: shuffledPlayers.slice(teamSize, teamSize * 2)
        };
    }
    selectMap(mapPool) {
        return (0, utils_1.randomElement)(mapPool);
    }
}
exports.MatchmakingService = MatchmakingService;
//# sourceMappingURL=matchmaking.js.map