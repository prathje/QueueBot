"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gamemode = void 0;
const discord_js_1 = require("discord.js");
const queue_1 = require("./queue");
const rating_1 = require("./rating");
const leaderboard_1 = require("./leaderboard");
class Gamemode {
    constructor(client, guild, config, matchmakingMutex) {
        this.category = null;
        this.resultsChannel = null;
        this.queues = new Map();
        this.client = client;
        this.guild = guild;
        this.config = config;
        this.matchmakingMutex = matchmakingMutex;
        this.ratingService = new rating_1.RatingService(config.id);
        this.leaderboardService = new leaderboard_1.Leaderboard(client, guild, this.ratingService, config.id, config.displayName);
    }
    async initialize() {
        await this.ensureCategory();
        await this.ensureResultsChannel();
        await this.resetRating(); // reset rating before initializing leaderboard
        await this.leaderboardService.initialize(this.category);
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
    async ensureResultsChannel() {
        if (!this.category) {
            throw new Error('Category must be created before results channel');
        }
        try {
            const channelName = `${this.config.id}-results`;
            let resultsChannel = this.guild.channels.cache.find(ch => ch.name === channelName &&
                ch.type === discord_js_1.ChannelType.GuildText &&
                ch.parentId === this.category?.id);
            if (!resultsChannel) {
                resultsChannel = await this.guild.channels.create({
                    name: channelName,
                    type: discord_js_1.ChannelType.GuildText,
                    parent: this.category.id,
                    permissionOverwrites: [
                        {
                            id: this.guild.roles.everyone.id,
                            allow: [discord_js_1.PermissionFlagsBits.ViewChannel],
                            deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.CreatePublicThreads, discord_js_1.PermissionFlagsBits.CreatePrivateThreads]
                        },
                        {
                            id: this.client.user.id,
                            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ManageChannels, discord_js_1.PermissionFlagsBits.ManageMessages]
                        }
                    ]
                });
                console.log(`Created results channel: ${channelName}`);
            }
            else {
                // Update permissions for existing results channel
                await resultsChannel.permissionOverwrites.set([
                    {
                        id: this.guild.roles.everyone.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel],
                        deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.CreatePublicThreads, discord_js_1.PermissionFlagsBits.CreatePrivateThreads]
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ManageChannels, discord_js_1.PermissionFlagsBits.ManageMessages]
                    }
                ]);
                console.log(`Updated permissions for existing results channel: ${channelName}`);
            }
            this.resultsChannel = resultsChannel;
        }
        catch (error) {
            console.error(`Error ensuring results channel for gamemode ${this.config.id}:`, error);
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
                }, this.matchmakingMutex, this.resultsChannel, this.onMatchResult.bind(this));
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
    getQueueByChannelId(channelId) {
        for (const queue of this.queues.values()) {
            if (queue.getChannel()?.id === channelId) {
                return queue;
            }
        }
        return undefined;
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
    getResultsChannel() {
        return this.resultsChannel;
    }
    getRatingService() {
        return this.ratingService;
    }
    async resetRating() {
        console.log(`Resetting ratings for gamemode: ${this.config.displayName}`);
        await this.ratingService.resetRatings();
    }
    async onMatchResult(matchResult) {
        console.log(`onMatchResult callback received for gamemode ${this.config.id}, match ${matchResult.matchId.slice(0, 8)}`);
        try {
            // Process rating changes for all players in the match
            await this.ratingService.processMatchResult(matchResult);
            // Update leaderboard after rating changes
            await this.leaderboardService.updateLeaderboard();
            console.log(`Rating changes processed successfully for match ${matchResult.matchId.slice(0, 8)}`);
        }
        catch (error) {
            console.error(`Error processing rating changes for match ${matchResult.matchId}:`, error);
        }
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