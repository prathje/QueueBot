"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gamemode = void 0;
const discord_js_1 = require("discord.js");
const queue_1 = require("./queue");
class Gamemode {
    constructor(client, guild, config, matchmakingMutex) {
        this.category = null;
        this.queues = new Map();
        this.client = client;
        this.guild = guild;
        this.config = config;
        this.matchmakingMutex = matchmakingMutex;
    }
    async initialize() {
        await this.ensureCategory();
        await this.initializeQueues();
    }
    async ensureCategory() {
        try {
            let category = this.guild.channels.cache.find(channel => channel.name === this.config.displayName && channel.type === discord_js_1.ChannelType.GuildCategory);
            if (!category) {
                category = await this.guild.channels.create({
                    name: this.config.displayName,
                    type: discord_js_1.ChannelType.GuildCategory
                });
                console.log(`Created category: ${this.config.displayName}`);
            }
            this.category = category;
        }
        catch (error) {
            console.error(`Error ensuring category for gamemode ${this.config.id}:`, error);
            throw error;
        }
    }
    async initializeQueues() {
        if (!this.category) {
            throw new Error('Category must be created before initializing queues');
        }
        for (const queueConfig of this.config.queues) {
            try {
                const queue = new queue_1.Queue(this.client, this.guild, this.category, {
                    ...queueConfig,
                    gamemodeId: this.config.id
                }, this.matchmakingMutex);
                await queue.initialize();
                this.queues.set(queueConfig.id, queue);
                console.log(`Initialized queue: ${queueConfig.displayName}`);
            }
            catch (error) {
                console.error(`Error initializing queue ${queueConfig.id}:`, error);
            }
        }
    }
    getQueue(queueId) {
        return this.queues.get(queueId);
    }
    getAllQueues() {
        return Array.from(this.queues.values());
    }
    getId() {
        return this.config.id;
    }
    getDisplayName() {
        return this.config.displayName;
    }
    getCategory() {
        return this.category;
    }
    async shutdown() {
        console.log(`Shutting down gamemode: ${this.config.displayName}`);
        for (const queue of this.queues.values()) {
            await queue.shutdown();
        }
        console.log(`Gamemode ${this.config.displayName} shutdown complete`);
    }
}
exports.Gamemode = Gamemode;
//# sourceMappingURL=gamemode.js.map