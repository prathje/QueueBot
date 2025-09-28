"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerService = void 0;
const Player_1 = require("../models/Player");
class PlayerService {
    constructor() {
        this.players = new Map();
    }
    static getInstance() {
        if (!PlayerService.instance) {
            PlayerService.instance = new PlayerService();
        }
        return PlayerService.instance;
    }
    async getOrCreatePlayer(discordId, username) {
        let player = this.players.get(discordId);
        if (!player) {
            try {
                const dbPlayer = await Player_1.Player.findOne({ discordId });
                if (dbPlayer) {
                    player = {
                        discordId: dbPlayer.discordId,
                        username: dbPlayer.username,
                        currentQueues: dbPlayer.currentQueues || [],
                        currentMatch: dbPlayer.currentMatch || undefined
                    };
                }
                else {
                    const newPlayer = new Player_1.Player({
                        discordId,
                        username,
                        currentQueues: [],
                        currentMatch: undefined
                    });
                    await newPlayer.save();
                    player = {
                        discordId,
                        username,
                        currentQueues: [],
                        currentMatch: undefined
                    };
                }
                this.players.set(discordId, player);
            }
            catch (error) {
                console.error('Error getting or creating player:', error);
                throw error;
            }
        }
        if (player.username !== username) {
            player.username = username;
            await this.updatePlayer(player);
        }
        return player;
    }
    async getPlayer(discordId) {
        let player = this.players.get(discordId);
        if (!player) {
            try {
                const dbPlayer = await Player_1.Player.findOne({ discordId });
                if (dbPlayer) {
                    player = dbPlayer.toObject();
                    this.players.set(discordId, player);
                }
            }
            catch (error) {
                console.error('Error getting player:', error);
                return null;
            }
        }
        return player || null;
    }
    async updatePlayer(player) {
        try {
            await Player_1.Player.updateOne({ discordId: player.discordId }, {
                username: player.username,
                currentQueues: player.currentQueues,
                currentMatch: player.currentMatch
            });
            this.players.set(player.discordId, player);
        }
        catch (error) {
            console.error('Error updating player:', error);
            throw error;
        }
    }
    async addPlayerToQueue(discordId, queueId) {
        const player = await this.getPlayer(discordId);
        if (!player) {
            throw new Error('Player not found');
        }
        if (!player.currentQueues.includes(queueId)) {
            player.currentQueues.push(queueId);
            await this.updatePlayer(player);
        }
    }
    async removePlayerFromQueue(discordId, queueId) {
        const player = await this.getPlayer(discordId);
        if (!player) {
            throw new Error('Player not found');
        }
        player.currentQueues = player.currentQueues.filter(q => q !== queueId);
        await this.updatePlayer(player);
    }
    async removePlayerFromAllQueues(discordId) {
        const player = await this.getPlayer(discordId);
        if (!player) {
            throw new Error('Player not found');
        }
        player.currentQueues = [];
        await this.updatePlayer(player);
    }
    async setPlayerMatch(discordId, matchId) {
        const player = await this.getPlayer(discordId);
        if (!player) {
            throw new Error('Player not found');
        }
        player.currentMatch = matchId;
        await this.updatePlayer(player);
    }
    isPlayerInQueue(discordId, queueId) {
        const player = this.players.get(discordId);
        return player ? player.currentQueues.includes(queueId) : false;
    }
    isPlayerInMatch(discordId) {
        const player = this.players.get(discordId);
        return player ? !!player.currentMatch : false;
    }
    getPlayersInQueue(queueId) {
        const playersInQueue = [];
        for (const [discordId, player] of this.players) {
            if (player.currentQueues.includes(queueId)) {
                playersInQueue.push(discordId);
            }
        }
        return playersInQueue;
    }
    async resetAllPlayers() {
        try {
            console.log('Resetting all player states...');
            // Clear in-memory cache first
            this.players.clear();
            // Clear all player queues and matches in database
            const result = await Player_1.Player.updateMany({}, {
                $set: {
                    currentQueues: [],
                    currentMatch: undefined
                }
            });
            console.log(`Reset ${result.modifiedCount} player states and cleared cache`);
            return result.modifiedCount;
        }
        catch (error) {
            console.error('Error resetting players:', error);
            return 0;
        }
    }
}
exports.PlayerService = PlayerService;
//# sourceMappingURL=players.js.map