"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const discord_js_1 = require("discord.js");
const players_1 = require("./players");
const matchmaking_1 = require("./matchmaking");
const match_handler_1 = require("./match_handler");
const mutex_1 = require("../utils/mutex");
const message_updater_1 = require("../utils/message_updater");
const utils_1 = require("../utils");
class Queue {
    constructor(client, guild, category, config, matchmakingMutex, resultsChannel = null, onMatchResult) {
        this.channel = null;
        this.resultsChannel = null;
        this.onMatchResult = null;
        this.queueMessage = null;
        this.messageUpdater = null;
        this.activeMatches = new Map();
        this.interactionListener = null;
        this.disabled = false;
        this.client = client;
        this.guild = guild;
        this.category = category;
        this.config = config;
        this.matchmakingMutex = matchmakingMutex;
        this.resultsChannel = resultsChannel;
        this.onMatchResult = onMatchResult || null;
        this.playerService = players_1.PlayerService.getInstance();
        this.matchmakingService = new matchmaking_1.MatchmakingService();
    }
    async initialize() {
        await this.ensureChannel();
        await this.setupQueueMessage();
        this.setupInteractionHandlers();
        // Register this queue to receive updates when players are removed
        this.playerService.registerQueueUpdateCallback(this.config.id, () => this.updateQueueMessage());
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
                this.messageUpdater = new message_updater_1.MessageUpdater(existingMessage);
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
            this.messageUpdater = new message_updater_1.MessageUpdater(this.queueMessage);
        }
        catch (error) {
            console.error(`Error creating queue message for ${this.config.id}:`, error);
        }
    }
    async updateQueueMessage() {
        if (!this.messageUpdater)
            return;
        const embed = this.createQueueEmbed();
        const row = this.createQueueButtons();
        this.messageUpdater.update({
            embeds: [embed],
            components: [row]
        });
    }
    createQueueEmbed() {
        const playersInQueue = this.playerService.getPlayersInQueue(this.config.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${this.config.displayName} Queue`)
            .setDescription(`**Map Pool:** ${this.config.mapPool.join(', ')}`)
            .setTimestamp();
        if (this.disabled) {
            embed
                .addFields({ name: 'Status', value: '🚫 **Queue Disabled**', inline: true }, { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true })
                .setColor(0xFF6B6B); // Red color for disabled
        }
        else {
            embed
                .addFields({ name: 'Players in Queue', value: `${playersInQueue.length}/${this.config.playerCount}`, inline: true }, { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true })
                .setColor(0x00AE86); // Green color for enabled
        }
        return embed;
    }
    createQueueButtons() {
        const joinButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`join_queue_${this.config.id}`)
            .setLabel('Join Queue')
            .setStyle(discord_js_1.ButtonStyle.Success)
            .setDisabled(this.disabled);
        const leaveButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`leave_queue_${this.config.id}`)
            .setLabel('Leave Queue')
            .setStyle(discord_js_1.ButtonStyle.Danger)
            .setDisabled(this.disabled);
        const refreshButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`refresh_queue_${this.config.id}`)
            .setLabel('🔄 Refresh')
            .setStyle(discord_js_1.ButtonStyle.Secondary);
        return new discord_js_1.ActionRowBuilder()
            .addComponents(joinButton, leaveButton /*, refreshButton */);
    }
    setupInteractionHandlers() {
        const m = new mutex_1.Mutex();
        this.interactionListener = async (interaction) => {
            if (!interaction.isButton())
                return;
            const { customId } = interaction;
            if (customId === `join_queue_${this.config.id}`) {
                await m.runExclusive(() => this.handleJoinQueue(interaction));
            }
            else if (customId === `leave_queue_${this.config.id}`) {
                await m.runExclusive(() => this.handleLeaveQueue(interaction));
            }
            else if (customId === `refresh_queue_${this.config.id}`) {
                await m.runExclusive(() => this.handleRefreshQueue(interaction));
            }
        };
        this.client.on('interactionCreate', this.interactionListener);
    }
    cleanupInteractionHandlers() {
        if (this.interactionListener) {
            this.client.removeListener('interactionCreate', this.interactionListener);
            this.interactionListener = null;
            console.log(`Cleaned up interaction listeners for queue ${this.config.displayName}`);
        }
    }
    async handleJoinQueue(interaction) {
        try {
            const { user } = interaction;
            if (this.disabled) {
                await interaction.reply({
                    content: 'This queue is currently disabled.',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            const player = await this.playerService.getOrCreatePlayer(user.id, user.username);
            if (this.playerService.isPlayerInMatch(user.id)) {
                const player = await this.playerService.getPlayer(user.id);
                console.log(`Player ${user.username} (${user.id}) tried to join queue but is in match: ${player?.currentMatch}`);
                await interaction.reply({
                    content: 'You are already in a match!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            if (this.playerService.isPlayerInQueue(user.id, this.config.id)) {
                await interaction.reply({
                    content: 'You are already in this queue!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            await this.playerService.addPlayerToQueue(user.id, this.config.id);
            await interaction.reply({
                content: `You joined the ${this.config.displayName} queue!`,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            await this.updateQueueMessage();
            await this.checkForMatch();
        }
        catch (error) {
            console.error('Error handling join queue:', error);
            await interaction.reply({
                content: 'An error occurred while joining the queue.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async handleLeaveQueue(interaction) {
        try {
            const { user } = interaction;
            if (!this.playerService.isPlayerInQueue(user.id, this.config.id)) {
                await interaction.reply({
                    content: 'You are not in this queue!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            await this.playerService.removePlayerFromQueue(user.id, this.config.id);
            await interaction.reply({
                content: `You left the ${this.config.displayName} queue!`,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            await this.updateQueueMessage();
        }
        catch (error) {
            console.error('Error handling leave queue:', error);
            await interaction.reply({
                content: 'An error occurred while leaving the queue.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async handleRefreshQueue(interaction) {
        try {
            await interaction.reply({
                content: '🔄 Refreshed!',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            await this.updateQueueMessage();
        }
        catch (error) {
            console.error('Error handling queue refresh:', error);
            await interaction.reply({
                content: 'An error occurred while refreshing the queue.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async addSinglePlayerProgrammatically(playerId) {
        try {
            // Check if player is already in a match
            if (this.playerService.isPlayerInMatch(playerId)) {
                console.log(`Player ${playerId} tried to auto-join queue but is in match`);
                return false;
            }
            // Check if player is already in this queue
            if (this.playerService.isPlayerInQueue(playerId, this.config.id)) {
                console.log(`Player ${playerId} is already in queue ${this.config.id}`);
                return false;
            }
            // Add player to queue
            await this.playerService.addPlayerToQueue(playerId, this.config.id);
            console.log(`Player ${playerId} programmatically joined queue ${this.config.id}`);
            return true;
        }
        catch (error) {
            console.error(`Error adding player ${playerId} to queue programmatically:`, error);
            return false;
        }
    }
    async addPlayersToQueue(playerIds) {
        const successful = [];
        const failed = [];
        // Shuffle the player order to avoid any potential bias
        const shuffledPlayerIds = (0, utils_1.shuffled)(playerIds);
        console.log(`Processing batch autojoin for ${shuffledPlayerIds.length} players in queue ${this.config.id}`);
        // Add players one by one in shuffled order
        for (const playerId of shuffledPlayerIds) {
            const success = await this.addSinglePlayerProgrammatically(playerId);
            if (success) {
                successful.push(playerId);
            }
            else {
                failed.push(playerId);
            }
        }
        // Update queue display and check for matches only once after all additions
        if (successful.length > 0) {
            await this.updateQueueMessage();
            await this.checkForMatch();
            console.log(`Successfully added ${successful.length} players to queue ${this.config.id}, ${failed.length} failed`);
        }
        return { successful, failed };
    }
    async checkForMatch() {
        // Don't process matches if the queue is disabled
        if (this.disabled) {
            return;
        }
        await this.matchmakingMutex.runExclusive(async () => {
            const queueData = {
                ...this.config,
                players: this.playerService.getPlayersInQueue(this.config.id),
                discordChannelId: this.channel?.id,
                disabled: this.disabled
            };
            const match = await this.matchmakingService.processQueue(queueData);
            if (match) {
                console.log(`Match created: ${match.id}`);
                // queues get notified and the match gets saved in the db in here
                await this.playerService.onPlayersFoundMatch(match.players, match.id);
                const matchHandler = new match_handler_1.MatchHandler(this.client, this.guild, this.category, match, async (playerIds, queueId) => {
                    // Callback to handle players joining queue (for autojoin)
                    if (queueId === this.config.id) {
                        const result = await this.addPlayersToQueue(playerIds);
                        // Return true if any succeeded
                        return result.successful.length > 0;
                    }
                    return false;
                }, (matchId) => {
                    // Callback to handle match cleanup
                    this.removeMatch(matchId);
                }, this.resultsChannel, this.onMatchResult);
                await matchHandler.initialize();
                this.activeMatches.set(match.id, matchHandler);
                this.updateQueueMessage();
            }
        }).catch(error => {
            console.error('Error checking for match:', error);
        });
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
    async disable() {
        console.log(`Disabling queue: ${this.config.displayName}`);
        this.disabled = true;
        // Remove all players from the queue
        const playersInQueue = this.playerService.getPlayersInQueue(this.config.id);
        for (const playerId of playersInQueue) {
            await this.playerService.removePlayerFromQueue(playerId, this.config.id);
        }
        // Update the queue message to show disabled state
        await this.updateQueueMessage();
        console.log(`Queue ${this.config.displayName} disabled, removed ${playersInQueue.length} players`);
    }
    async enable() {
        console.log(`Enabling queue: ${this.config.displayName}`);
        this.disabled = false;
        // Update the queue message to show enabled state
        await this.updateQueueMessage();
        console.log(`Queue ${this.config.displayName} enabled`);
    }
    isDisabled() {
        return this.disabled;
    }
    async shutdown() {
        try {
            console.log(`Shutting down queue: ${this.config.displayName}`);
            // Unregister from player service updates
            this.playerService.unregisterQueueUpdateCallback(this.config.id);
            // Clean up event listeners
            this.cleanupInteractionHandlers();
            // Clean up message updater
            if (this.messageUpdater) {
                this.messageUpdater.destroy();
                this.messageUpdater = null;
            }
            // Cancel all active matches in this queue
            await this.cancelActiveMatches();
            if (this.queueMessage) {
                const shutdownEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${this.config.displayName} Queue`)
                    .setDescription(`**Map Pool:** ${this.config.mapPool.join(', ')}`)
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
    async cancelActiveMatches() {
        try {
            if (this.activeMatches.size === 0) {
                return;
            }
            console.log(`Cancelling ${this.activeMatches.size} active matches in queue ${this.config.displayName}`);
            const matchHandlers = Array.from(this.activeMatches.values());
            for (const matchHandler of matchHandlers) {
                try {
                    await matchHandler.forceCancel('Queue shutdown - bot is restarting');
                    this.removeMatch(matchHandler.getId());
                }
                catch (error) {
                    console.error(`Error cancelling match ${matchHandler.getId()}:`, error);
                }
            }
            console.log(`Cancelled all active matches in queue ${this.config.displayName}`);
        }
        catch (error) {
            console.error(`Error cancelling active matches in queue ${this.config.displayName}:`, error);
        }
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map