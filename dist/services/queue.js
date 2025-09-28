"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const discord_js_1 = require("discord.js");
const players_1 = require("./players");
const matchmaking_1 = require("./matchmaking");
const match_handler_1 = require("./match_handler");
class Queue {
    constructor(client, guild, category, config) {
        this.channel = null;
        this.queueMessage = null;
        this.activeMatches = new Map();
        this.client = client;
        this.guild = guild;
        this.category = category;
        this.config = config;
        this.playerService = players_1.PlayerService.getInstance();
        this.matchmakingService = new matchmaking_1.MatchmakingService();
    }
    async initialize() {
        await this.ensureChannel();
        await this.setupQueueMessage();
        this.setupInteractionHandlers();
    }
    async ensureChannel() {
        try {
            let channel = this.guild.channels.cache.find(ch => ch.name === this.config.displayName.toLowerCase().replace(/\s+/g, '-') &&
                ch.type === discord_js_1.ChannelType.GuildText &&
                ch.parentId === this.category.id);
            if (!channel) {
                channel = await this.guild.channels.create({
                    name: this.config.displayName.toLowerCase().replace(/\s+/g, '-'),
                    type: discord_js_1.ChannelType.GuildText,
                    parent: this.category.id
                });
                console.log(`Created queue channel: ${this.config.displayName}`);
            }
            this.channel = channel;
        }
        catch (error) {
            console.error(`Error ensuring channel for queue ${this.config.id}:`, error);
            throw error;
        }
    }
    async setupQueueMessage() {
        if (!this.channel)
            return;
        try {
            const messages = await this.channel.messages.fetch({ limit: 10 });
            const existingMessage = messages.find(msg => msg.author.id === this.client.user?.id &&
                msg.embeds.length > 0 &&
                msg.embeds[0].title?.includes('Queue'));
            if (existingMessage) {
                this.queueMessage = existingMessage;
                await this.updateQueueMessage();
            }
            else {
                await this.createQueueMessage();
            }
        }
        catch (error) {
            console.error(`Error setting up queue message for ${this.config.id}:`, error);
        }
    }
    async createQueueMessage() {
        if (!this.channel)
            return;
        const embed = this.createQueueEmbed();
        const row = this.createQueueButtons();
        try {
            this.queueMessage = await this.channel.send({
                embeds: [embed],
                components: [row]
            });
        }
        catch (error) {
            console.error(`Error creating queue message for ${this.config.id}:`, error);
        }
    }
    async updateQueueMessage() {
        if (!this.queueMessage)
            return;
        const embed = this.createQueueEmbed();
        const row = this.createQueueButtons();
        try {
            await this.queueMessage.edit({
                embeds: [embed],
                components: [row]
            });
        }
        catch (error) {
            console.error(`Error updating queue message for ${this.config.id}:`, error);
        }
    }
    createQueueEmbed() {
        const playersInQueue = this.playerService.getPlayersInQueue(this.config.id);
        return new discord_js_1.EmbedBuilder()
            .setTitle(`${this.config.displayName} Queue`)
            .setDescription(`Map Pool: ${this.config.mapPool.join(', ')}`)
            .addFields({ name: 'Players in Queue', value: `${playersInQueue.length}/${this.config.playerCount}`, inline: true }, { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true })
            .setColor(0x00AE86)
            .setTimestamp();
    }
    createQueueButtons() {
        return new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`join_queue_${this.config.id}`)
            .setLabel('Join Queue')
            .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
            .setCustomId(`leave_queue_${this.config.id}`)
            .setLabel('Leave Queue')
            .setStyle(discord_js_1.ButtonStyle.Danger));
    }
    setupInteractionHandlers() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton())
                return;
            const { customId, user } = interaction;
            if (customId === `join_queue_${this.config.id}`) {
                await this.handleJoinQueue(interaction);
            }
            else if (customId === `leave_queue_${this.config.id}`) {
                await this.handleLeaveQueue(interaction);
            }
        });
    }
    async handleJoinQueue(interaction) {
        try {
            const { user } = interaction;
            const player = await this.playerService.getOrCreatePlayer(user.id, user.username);
            if (this.playerService.isPlayerInMatch(user.id)) {
                await interaction.reply({
                    content: 'You are already in a match!',
                    ephemeral: true
                });
                return;
            }
            if (this.playerService.isPlayerInQueue(user.id, this.config.id)) {
                await interaction.reply({
                    content: 'You are already in this queue!',
                    ephemeral: true
                });
                return;
            }
            await this.playerService.addPlayerToQueue(user.id, this.config.id);
            await interaction.reply({
                content: `You joined the ${this.config.displayName} queue!`,
                ephemeral: true
            });
            await this.updateQueueMessage();
            await this.checkForMatch();
        }
        catch (error) {
            console.error('Error handling join queue:', error);
            await interaction.reply({
                content: 'An error occurred while joining the queue.',
                ephemeral: true
            });
        }
    }
    async handleLeaveQueue(interaction) {
        try {
            const { user } = interaction;
            if (!this.playerService.isPlayerInQueue(user.id, this.config.id)) {
                await interaction.reply({
                    content: 'You are not in this queue!',
                    ephemeral: true
                });
                return;
            }
            await this.playerService.removePlayerFromQueue(user.id, this.config.id);
            await interaction.reply({
                content: `You left the ${this.config.displayName} queue!`,
                ephemeral: true
            });
            await this.updateQueueMessage();
        }
        catch (error) {
            console.error('Error handling leave queue:', error);
            await interaction.reply({
                content: 'An error occurred while leaving the queue.',
                ephemeral: true
            });
        }
    }
    async checkForMatch() {
        try {
            const queueData = {
                ...this.config,
                players: this.playerService.getPlayersInQueue(this.config.id),
                discordChannelId: this.channel?.id
            };
            const match = await this.matchmakingService.processQueue(queueData);
            if (match) {
                console.log(`Match created: ${match.id}`);
                const matchHandler = new match_handler_1.MatchHandler(this.client, this.guild, match);
                await matchHandler.initialize();
                this.activeMatches.set(match.id, matchHandler);
                await this.updateQueueMessage();
            }
        }
        catch (error) {
            console.error('Error checking for match:', error);
        }
    }
    getActiveMatches() {
        return Array.from(this.activeMatches.values());
    }
    removeMatch(matchId) {
        this.activeMatches.delete(matchId);
    }
    getId() {
        return this.config.id;
    }
    getDisplayName() {
        return this.config.displayName;
    }
    getChannel() {
        return this.channel;
    }
    async shutdown() {
        try {
            console.log(`Shutting down queue: ${this.config.displayName}`);
            if (this.queueMessage) {
                const shutdownEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${this.config.displayName} Queue`)
                    .setDescription(`Map Pool: ${this.config.mapPool.join(', ')}`)
                    .addFields({ name: 'Status', value: '💤 Queue is currently sleeping', inline: true }, { name: 'Info', value: 'Bot is restarting or shutting down', inline: true })
                    .setColor(0xFF6B6B)
                    .setTimestamp();
                // Create disabled buttons
                const disabledRow = new discord_js_1.ActionRowBuilder()
                    .addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId('disabled_join')
                    .setLabel('Join Queue')
                    .setStyle(discord_js_1.ButtonStyle.Secondary)
                    .setDisabled(true), new discord_js_1.ButtonBuilder()
                    .setCustomId('disabled_leave')
                    .setLabel('Leave Queue')
                    .setStyle(discord_js_1.ButtonStyle.Secondary)
                    .setDisabled(true));
                await this.queueMessage.edit({
                    embeds: [shutdownEmbed],
                    components: [disabledRow]
                });
                console.log(`Queue ${this.config.displayName} marked as sleeping`);
            }
        }
        catch (error) {
            console.error(`Error shutting down queue ${this.config.displayName}:`, error);
        }
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map