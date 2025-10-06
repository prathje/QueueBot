"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchHandler = void 0;
const discord_js_1 = require("discord.js");
const types_1 = require("../types");
const Match_1 = require("../models/Match");
const MatchResult_1 = require("../models/MatchResult");
const players_1 = require("./players");
const mutex_1 = require("../utils/mutex");
const message_updater_1 = require("../utils/message_updater");
const environment_1 = require("../config/environment");
class MatchHandler {
    constructor(client, guild, category, match, onPlayersJoinQueue, onMatchClose, resultsChannel, onMatchResult) {
        this.channel = null;
        this.resultsChannel = null;
        this.voiceChannel1 = null;
        this.voiceChannel2 = null;
        this.matchMessage = null;
        this.messageUpdater = null;
        this.readyTimeout = null;
        this.voteTimeout = null;
        this.queueAutojoin = new Set();
        this.onPlayersJoinQueue = null;
        this.onMatchClose = null;
        this.onMatchResult = null;
        this.interactionListener = null;
        this.playerNotificationMessages = new Map();
        this.client = client;
        this.guild = guild;
        this.category = category;
        this.match = match;
        this.match.startedAt = null; // Initialize as null
        this.resultsChannel = resultsChannel || null;
        this.playerService = players_1.PlayerService.getInstance();
        this.onPlayersJoinQueue = onPlayersJoinQueue || null;
        this.onMatchClose = onMatchClose || null;
        this.onMatchResult = onMatchResult || null;
    }
    async initialize() {
        await this.saveMatch();
        await this.createMatchChannel();
        await this.createVoiceChannels();
        this.setupInteractionHandlers();
        this.match.state = types_1.MatchState.CREATED;
        await this.updateMatch();
        await this.startReadyPhase();
    }
    async saveMatch() {
        try {
            const matchDoc = new Match_1.Match({
                matchId: this.match.id,
                queueId: this.match.queueId,
                gamemodeId: this.match.gamemodeId,
                players: this.match.players,
                teams: this.match.teams,
                map: this.match.map,
                state: this.match.state,
                discordChannelId: this.match.discordChannelId,
                discordVoiceChannel1Id: this.match.discordVoiceChannel1Id,
                discordVoiceChannel2Id: this.match.discordVoiceChannel2Id,
                readyPlayers: this.match.readyPlayers,
                votes: this.match.votes,
                startedAt: this.match.startedAt,
            });
            await matchDoc.save();
        }
        catch (error) {
            console.error('Error saving match:', error);
            throw error;
        }
    }
    async updateMatch() {
        try {
            await Match_1.Match.updateOne({ matchId: this.match.id }, {
                queueId: this.match.queueId,
                gamemodeId: this.match.gamemodeId,
                players: this.match.players,
                teams: this.match.teams,
                map: this.match.map,
                state: this.match.state,
                discordChannelId: this.match.discordChannelId,
                discordVoiceChannel1Id: this.match.discordVoiceChannel1Id,
                discordVoiceChannel2Id: this.match.discordVoiceChannel2Id,
                readyPlayers: this.match.readyPlayers,
                votes: this.match.votes,
                startedAt: this.match.startedAt,
            });
        }
        catch (error) {
            console.error('Error updating match:', error);
        }
    }
    async createMatchChannel() {
        try {
            const channelName = `match-${this.match.id.slice(0, 8)}`;
            this.channel = await this.guild.channels.create({
                name: channelName,
                type: discord_js_1.ChannelType.GuildText,
                parent: this.category,
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect],
                    },
                    {
                        id: this.client.user.id,
                        allow: [
                            discord_js_1.PermissionFlagsBits.ViewChannel,
                            discord_js_1.PermissionFlagsBits.SendMessages,
                            discord_js_1.PermissionFlagsBits.ManageChannels,
                        ],
                    },
                    ...this.match.players.map((playerId) => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages],
                    })),
                ],
            });
            this.match.discordChannelId = this.channel.id;
            console.log(`Created match channel: ${channelName}`);
            // Send private messages to all players with match channel link
            await this.notifyPlayersOfMatchChannel();
        }
        catch (error) {
            console.error('Error creating match channel:', error);
            throw error;
        }
    }
    async createVoiceChannels() {
        try {
            const baseChannelName = `Match ${this.match.id.slice(0, 8)}`;
            this.voiceChannel1 = await this.guild.channels.create({
                name: `${baseChannelName} - ${types_1.TeamName.TEAM1}`,
                type: discord_js_1.ChannelType.GuildVoice,
                parent: this.category,
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect],
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.ManageChannels],
                    },
                    ...this.match.teams.team1.map((playerId) => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect],
                    })),
                ],
            });
            this.voiceChannel2 = await this.guild.channels.create({
                name: `${baseChannelName} - ${types_1.TeamName.TEAM2}`,
                type: discord_js_1.ChannelType.GuildVoice,
                parent: this.category,
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect],
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.ManageChannels],
                    },
                    ...this.match.teams.team2.map((playerId) => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect],
                    })),
                ],
            });
            this.match.discordVoiceChannel1Id = this.voiceChannel1.id;
            this.match.discordVoiceChannel2Id = this.voiceChannel2.id;
            console.log(`Created voice channels for match ${this.match.id}`);
        }
        catch (error) {
            console.error('Error creating voice channels:', error);
            throw error;
        }
    }
    async setupMatchMessage() {
        if (!this.channel)
            return;
        const embed = this.createMatchEmbed();
        const buttons = this.createMatchButtons();
        try {
            const messageOptions = {
                content: `Match found! <@${this.match.players.join('> <@')}>`,
                embeds: [embed],
            };
            if (buttons) {
                // Handle both single row and multiple rows
                if (Array.isArray(buttons)) {
                    messageOptions.components = buttons;
                }
                else {
                    messageOptions.components = [buttons];
                }
            }
            this.matchMessage = await this.channel.send(messageOptions);
        }
        catch (error) {
            console.error('Error setting up match message:', error);
        }
    }
    createMatchEmbed() {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Match ${this.match.id.slice(0, 8)}`)
            .setDescription(`Map: **${this.match.map}**`)
            .setColor(0x0099ff)
            .setTimestamp();
        if (this.match.state === types_1.MatchState.READY_UP) {
            embed.addFields({ name: types_1.TeamName.TEAM1, value: this.match.teams.team1.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: types_1.TeamName.TEAM2, value: this.match.teams.team2.map((id) => `<@${id}>`).join('\n'), inline: true }, {
                name: 'Ready Players',
                value: `${this.match.readyPlayers.length}/${this.match.players.length}`,
                inline: true,
            });
        }
        else if (this.match.state === types_1.MatchState.IN_PROGRESS) {
            const team1Votes = this.match.votes.team1.length;
            const team2Votes = this.match.votes.team2.length;
            const cancelVotes = this.match.votes.cancel.length;
            embed.addFields({ name: types_1.TeamName.TEAM1, value: this.match.teams.team1.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: types_1.TeamName.TEAM2, value: this.match.teams.team2.map((id) => `<@${id}>`).join('\n'), inline: true }, {
                name: 'Votes',
                value: `${types_1.TeamName.TEAM1}: ${team1Votes}\n${types_1.TeamName.TEAM2}: ${team2Votes}\nCancel: ${cancelVotes}`,
                inline: true,
            });
        }
        else if (this.match.state === types_1.MatchState.COMPLETED) {
            const team1Votes = this.match.votes.team1.length;
            const team2Votes = this.match.votes.team2.length;
            const winningTeam = team1Votes > team2Votes ? 1 : 2;
            embed
                .setColor(0xffd700)
                .addFields({ name: types_1.TeamName.TEAM1, value: this.match.teams.team1.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: types_1.TeamName.TEAM2, value: this.match.teams.team2.map((id) => `<@${id}>`).join('\n'), inline: true }, {
                name: '🏆 Result',
                value: `**${(0, types_1.getTeamName)(winningTeam)} Wins!**\n\nFinal Votes:\n${types_1.TeamName.TEAM1}: ${team1Votes}\n${types_1.TeamName.TEAM2}: ${team2Votes}`,
                inline: true,
            });
        }
        else if (this.match.state === types_1.MatchState.CANCELLED) {
            embed
                .setColor(0xff0000)
                .addFields({ name: types_1.TeamName.TEAM1, value: this.match.teams.team1.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: types_1.TeamName.TEAM2, value: this.match.teams.team2.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: '❌ Status', value: '**Match Cancelled**\n\nVoting is no longer available.', inline: true });
        }
        return embed;
    }
    createMatchButtons() {
        const refreshButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`refresh_match_${this.match.id}`)
            .setLabel('🔄 Refresh')
            .setStyle(discord_js_1.ButtonStyle.Secondary);
        if (this.match.state === types_1.MatchState.READY_UP) {
            return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`ready_${this.match.id}`).setLabel('Ready Up!').setStyle(discord_js_1.ButtonStyle.Success), refreshButton);
        }
        else if (this.match.state === types_1.MatchState.IN_PROGRESS) {
            const row1 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_team1_${this.match.id}`)
                .setLabel(`${types_1.TeamName.TEAM1} Wins`)
                .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_team2_${this.match.id}`)
                .setLabel(`${types_1.TeamName.TEAM2} Wins`)
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_cancel_${this.match.id}`)
                .setLabel('Cancel Match')
                .setStyle(discord_js_1.ButtonStyle.Secondary));
            const row2 = new discord_js_1.ActionRowBuilder().addComponents(refreshButton);
            return [row1, row2]; // Return multiple rows for voting phase
        }
        else if (this.match.state === types_1.MatchState.COMPLETED || this.match.state === types_1.MatchState.CANCELLED) {
            if (this.onPlayersJoinQueue) {
                // we only show autojoin if we have a callback to rejoin!
                return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId(`autojoin_queue_${this.match.id}`)
                    .setLabel('🔄 Auto-join Next Queue')
                    .setStyle(discord_js_1.ButtonStyle.Secondary), refreshButton);
            }
            else {
                return new discord_js_1.ActionRowBuilder().addComponents(refreshButton);
            }
        }
        return null;
    }
    setupInteractionHandlers() {
        const m = new mutex_1.Mutex();
        this.interactionListener = async (interaction) => {
            if (!interaction.isButton())
                return;
            const { customId } = interaction;
            if (customId === `ready_${this.match.id}`) {
                await m.runExclusive(() => this.handleReady(interaction));
            }
            else if (customId === `vote_team1_${this.match.id}`) {
                await m.runExclusive(() => this.handleVote(interaction, 'team1'));
            }
            else if (customId === `vote_team2_${this.match.id}`) {
                await m.runExclusive(() => this.handleVote(interaction, 'team2'));
            }
            else if (customId === `vote_cancel_${this.match.id}`) {
                await m.runExclusive(() => this.handleVote(interaction, 'cancel'));
            }
            else if (customId === `autojoin_queue_${this.match.id}`) {
                await m.runExclusive(() => this.handleAutojoinRegistration(interaction));
            }
            else if (customId === `refresh_match_${this.match.id}`) {
                await m.runExclusive(() => this.handleRefreshMatch(interaction));
            }
        };
        this.client.on('interactionCreate', this.interactionListener);
    }
    cleanupInteractionHandlers() {
        if (this.interactionListener) {
            this.client.removeListener('interactionCreate', this.interactionListener);
            this.interactionListener = null;
            console.log(`Cleaned up interaction listeners for match ${this.match.id}`);
        }
    }
    async handleAutojoinRegistration(interaction) {
        try {
            const { user } = interaction;
            // Check if user was in this match
            if (!this.match.players.includes(user.id)) {
                await interaction.reply({
                    content: 'You were not in this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            // Check if they're already registered for autojoin
            if (this.queueAutojoin.has(user.id)) {
                // Remove from autojoin
                this.queueAutojoin.delete(user.id);
                await interaction.reply({
                    content: '❌ Removed from auto-join list. You will not automatically rejoin the queue.',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
            }
            else {
                // Add to autojoin
                this.queueAutojoin.add(user.id);
                await interaction.reply({
                    content: '✅ Added to auto-join list! You will automatically rejoin the queue when this match closes.',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
            }
        }
        catch (error) {
            console.error('Error handling autojoin registration:', error);
            await interaction.reply({
                content: 'An error occurred while registering for auto-join.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
    }
    async handleRefreshMatch(interaction) {
        try {
            await this.updateMatchMessage();
            await interaction.reply({
                content: '🔄 Refreshed!',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        catch (error) {
            console.error('Error handling match refresh:', error);
            await interaction.reply({
                content: 'An error occurred while refreshing the match.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
    }
    async startReadyPhase() {
        this.match.state = types_1.MatchState.READY_UP;
        await this.updateMatch();
        await this.updateMatchMessage(); // create the message
        this.readyTimeout = setTimeout(async () => {
            await this.cancelMatch('Ready timeout exceeded');
        }, MatchHandler.READY_TIMEOUT);
    }
    async handleReady(interaction) {
        try {
            const { user } = interaction;
            if (!this.match.players.includes(user.id)) {
                await interaction.reply({
                    content: 'You are not in this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            if (this.match.readyPlayers.includes(user.id)) {
                await interaction.reply({
                    content: 'You are already ready!',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                await this.updateMatchMessage();
                return;
            }
            this.match.readyPlayers.push(user.id);
            await interaction.reply({
                content: 'You are ready!',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            if (this.match.readyPlayers.length === this.match.players.length) {
                await this.startMatch(); // this will update the match and the message
            }
            else {
                await this.updateMatch();
                await this.updateMatchMessage();
            }
        }
        catch (error) {
            console.error('Error handling ready:', error);
            await interaction.reply({
                content: 'An error occurred while readying up.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            await this.updateMatchMessage();
        }
    }
    async startMatch() {
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = null;
        }
        this.match.state = types_1.MatchState.IN_PROGRESS;
        this.match.startedAt = new Date();
        await this.updateMatch();
        await this.updateMatchMessage();
        if (this.channel) {
            await this.channel.send({
                content: '🎮 **Match started!** Good luck and have fun!',
                embeds: [
                /*new EmbedBuilder()
                .setDescription(`Voice channels have been created for your teams.`)
                .setColor(0x00FF00)*/
                ],
            });
        }
        this.voteTimeout = setTimeout(async () => {
            await this.cancelMatch('Vote timeout exceeded');
        }, MatchHandler.VOTE_TIMEOUT);
    }
    async handleVote(interaction, voteType) {
        try {
            const { user } = interaction;
            if (!this.match.players.includes(user.id)) {
                await interaction.reply({
                    content: 'You are not in this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            // Check if match is still accepting votes
            if (this.match.state !== types_1.MatchState.IN_PROGRESS) {
                await interaction.reply({
                    content: 'Voting is no longer available for this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                await this.updateMatchMessage();
                return;
            }
            // Remove user's previous vote if they had one
            this.match.votes.team1 = this.match.votes.team1.filter((id) => id !== user.id);
            this.match.votes.team2 = this.match.votes.team2.filter((id) => id !== user.id);
            this.match.votes.cancel = this.match.votes.cancel.filter((id) => id !== user.id);
            // Add new vote
            this.match.votes[voteType].push(user.id);
            const voteLabels = { team1: types_1.TeamName.TEAM1, team2: types_1.TeamName.TEAM2, cancel: 'Cancel' };
            await interaction.reply({
                content: `You voted for ${voteLabels[voteType]}!`,
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            await this.checkVoteResults();
        }
        catch (error) {
            console.error('Error handling vote:', error);
            await interaction.reply({
                content: 'An error occurred while voting.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
    }
    async checkVoteResults() {
        // Only process votes if match is still in progress
        if (this.match.state !== types_1.MatchState.IN_PROGRESS) {
            await this.updateMatchMessage();
            return;
        }
        const totalPlayers = this.match.players.length;
        const majority = totalPlayers / 2.0; // we need more than half
        const team1Votes = this.match.votes.team1.length;
        const team2Votes = this.match.votes.team2.length;
        const cancelVotes = this.match.votes.cancel.length;
        if (cancelVotes > majority) {
            await this.cancelMatch('Match cancelled by player vote');
        }
        else if (team1Votes > majority) {
            await this.completeMatch(1);
        }
        else if (team2Votes > majority) {
            await this.completeMatch(2);
        }
        else {
            await this.updateMatch();
            await this.updateMatchMessage();
        }
    }
    async completeMatch(winningTeam) {
        if (this.voteTimeout) {
            clearTimeout(this.voteTimeout);
            this.voteTimeout = null;
        }
        this.match.state = types_1.MatchState.COMPLETED;
        await this.updateMatch();
        await this.updateMatchMessage();
        // Collect display names for the MatchResult
        const displayNames = {};
        for (const playerId of this.match.players) {
            try {
                const user = await this.client.users.fetch(playerId);
                displayNames[playerId] = user.username;
                console.log(`Collected display name for ${playerId}: ${user.username}`);
            }
            catch (error) {
                console.warn(`Could not fetch username for user ${playerId}:`, error);
                displayNames[playerId] = playerId; // Fallback to Discord ID
                console.log(`Using fallback display name for ${playerId}: ${playerId}`);
            }
        }
        console.log('Final displayNames object:', displayNames);
        const matchResult = new MatchResult_1.MatchResult({
            matchId: this.match.id,
            queueId: this.match.queueId,
            gamemodeId: this.match.gamemodeId,
            winningTeam,
            map: this.match.map,
            teams: {
                team1: this.match.teams.team1,
                team2: this.match.teams.team2,
            },
            players: this.match.players,
            displayNames,
            startedAt: this.match.startedAt || new Date(), // Fallback to current time if somehow null
            completedAt: new Date(),
        });
        try {
            await matchResult.save();
            console.log(`Match ${this.match.id} completed, team ${winningTeam} wins`);
            console.log('Saved matchResult displayNames:', matchResult.displayNames);
            console.log('Saved matchResult toObject displayNames:', matchResult.toObject().displayNames);
        }
        catch (error) {
            console.error('Error saving match result:', error);
        }
        if (this.channel) {
            await this.channel.send({
                content: `🏆 **Match completed!** ${(0, types_1.getTeamName)(winningTeam)} wins!`,
                embeds: [new discord_js_1.EmbedBuilder().setDescription('GG! The match will be closed in 10 seconds.').setColor(0xffd700)],
            });
        }
        // Post match data to webhook
        await this.postMatchResultToWebhook(matchResult);
        // Call the onMatchResult callback with the result (only for completed matches)
        if (this.onMatchResult) {
            try {
                await this.onMatchResult(matchResult); // TODO: not sure if we want to await this or not
                console.log('onMatchResult callback received for completed match');
            }
            catch (error) {
                console.error('Error calling onMatchResult callback:', error);
            }
        }
        // Post to results channel
        await this.postToResultsChannel();
        setTimeout(async () => {
            await this.closeMatch();
        }, 10000);
    }
    async postMatchResultToWebhook(matchResult) {
        if (!environment_1.config.api.resultsWebhookUrl) {
            console.log('No RESULTS_WEBHOOK_URL configured, skipping match posting');
            return;
        }
        try {
            console.log('Raw webhook URL from config:', environment_1.config.api.resultsWebhookUrl);
            // Validate and parse the URL
            let webhookUrl = '';
            try {
                // Remove quotes if they exist in the environment variable
                webhookUrl = environment_1.config.api.resultsWebhookUrl.replace(/['"]/g, '');
                console.log('Cleaned webhook URL:', webhookUrl);
                // Validate URL format
                new URL(webhookUrl);
                console.log('URL validation passed');
            }
            catch (urlError) {
                console.error('Invalid webhook URL format:', webhookUrl || environment_1.config.api.resultsWebhookUrl);
                console.error('URL parsing error:', urlError);
                return;
            }
            // Send the MatchResult data directly to the webhook
            const matchResultObj = matchResult.toObject();
            // Remove MongoDB-specific fields
            const { _id, __v, ...cleanedData } = matchResultObj;
            const webhookData = {
                ...cleanedData,
                server: 'queue',
            };
            console.log('Webhook payload:', JSON.stringify(webhookData, null, 2));
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(webhookData),
            });
            if (response.ok) {
                console.log(`Successfully posted match ${matchResult.matchId} to webhook`);
            }
            else {
                console.error(`Failed to post match to webhook: ${response.status} ${response.statusText}`);
            }
        }
        catch (error) {
            console.error('Error posting match to webhook:', error);
        }
    }
    async cancelMatch(reason) {
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = null;
        }
        if (this.voteTimeout) {
            clearTimeout(this.voteTimeout);
            this.voteTimeout = null;
        }
        this.match.state = types_1.MatchState.CANCELLED;
        await this.updateMatch();
        await this.updateMatchMessage();
        if (this.channel) {
            await this.channel.send({
                content: `❌ **Match cancelled:** ${reason}`,
                embeds: [
                    new discord_js_1.EmbedBuilder()
                        .setDescription('You can join queues once this match closes. The match will be closed in 10 seconds.')
                        .setColor(0xff0000),
                ],
            });
        }
        console.log(`Match ${this.match.id} cancelled: ${reason}`);
        // Post to results channel for cancelled matches
        await this.postToResultsChannel();
        setTimeout(async () => {
            await this.closeMatch();
        }, 10000);
    }
    async closeMatch() {
        // Clear any timeouts
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = null;
        }
        if (this.voteTimeout) {
            clearTimeout(this.voteTimeout);
            this.voteTimeout = null;
        }
        // Clean up player notification messages before setting match state
        await this.updatePlayerNotifications();
        if (this.match.state === types_1.MatchState.CLOSED) {
            console.log(`Match ${this.match.id} is already closed`);
            return;
        }
        this.match.state = types_1.MatchState.CLOSED;
        await this.updateMatch();
        // Clean up event listeners first
        this.cleanupInteractionHandlers();
        // Clean up message updater
        if (this.messageUpdater) {
            this.messageUpdater.destroy();
            this.messageUpdater = null;
        }
        for (const playerId of this.match.players) {
            await this.playerService.setPlayerMatch(playerId, null);
        }
        try {
            if (this.channel) {
                await this.channel.delete();
                this.match.discordChannelId = null;
                this.channel = null;
            }
            if (this.voiceChannel1) {
                await this.voiceChannel1.delete();
                this.match.discordVoiceChannel1Id = null;
                this.voiceChannel1 = null;
            }
            if (this.voiceChannel2) {
                await this.voiceChannel2.delete();
                this.match.discordVoiceChannel2Id = null;
                this.voiceChannel2 = null;
            }
            console.log(`Match ${this.match.id} closed and channels deleted`);
            await this.updateMatch();
            // Notify queue to remove this match handler
            if (this.onMatchClose) {
                this.onMatchClose(this.match.id);
            }
        }
        catch (error) {
            console.error('Error deleting match channels:', error);
        }
        // Handle autojoin for registered players as a batch, we add them later so that the old channel is fully deleted first
        if (this.queueAutojoin.size > 0) {
            console.log(`Processing batch autojoin for ${this.queueAutojoin.size} players`);
            try {
                // Use queue callback to handle full join logic for all players at once
                if (this.onPlayersJoinQueue) {
                    const autojoinPlayers = Array.from(this.queueAutojoin);
                    const success = await this.onPlayersJoinQueue(autojoinPlayers, this.match.queueId);
                    if (success) {
                        console.log(`Successfully processed batch autojoin for ${autojoinPlayers.length} players to queue ${this.match.queueId}`);
                    }
                    else {
                        console.log(`Batch autojoin failed for players in queue ${this.match.queueId}`);
                    }
                }
            }
            catch (error) {
                console.error(`Failed to process batch autojoin for players in queue:`, error);
            }
        }
    }
    async updateMatchMessage() {
        if (!this.channel)
            return;
        const embed = this.createMatchEmbed();
        const buttons = this.createMatchButtons();
        const messageOptions = {
            content: `Match found! <@${this.match.players.join('> <@')}>`,
            embeds: [embed],
        };
        if (buttons) {
            // Handle both single row and multiple rows
            if (Array.isArray(buttons)) {
                messageOptions.components = buttons;
            }
            else {
                messageOptions.components = [buttons];
            }
        }
        else {
            messageOptions.components = [];
        }
        try {
            if (this.messageUpdater) {
                // Use debounced update
                this.messageUpdater.update(messageOptions);
            }
            else {
                // First message creation, this executes when the match is created
                this.matchMessage = await this.channel.send(messageOptions);
                this.messageUpdater = new message_updater_1.MessageUpdater(this.matchMessage);
            }
        }
        catch (error) {
            console.error('Error updating match message:', error);
        }
    }
    getMatch() {
        return this.match;
    }
    getId() {
        return this.match.id;
    }
    getState() {
        return this.match.state;
    }
    async forceCancel(reason = 'Force cancelled by administrator') {
        console.log(`Force cancelling match ${this.match.id}: ${reason}`);
        // Update match state
        this.match.state = types_1.MatchState.CANCELLED;
        await this.updateMatch();
        // Send notification if channel exists
        if (this.channel) {
            try {
                await this.channel.send({
                    content: `❌ **Match force cancelled:** ${reason}`,
                    embeds: [
                        {
                            description: 'This match was cancelled by an administrator. You can join queues once this match closes.',
                            color: 0xff0000,
                        },
                    ],
                });
            }
            catch (error) {
                console.error('Error sending force cancel message:', error);
            }
        }
        await this.closeMatch();
    }
    async notifyPlayersOfMatchChannel() {
        if (!this.channel) {
            console.error('Cannot notify players: match channel not created');
            return;
        }
        const channelLink = `https://discord.com/channels/${this.guild.id}/${this.channel.id}`;
        for (const playerId of this.match.players) {
            try {
                const user = await this.client.users.fetch(playerId);
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle('🎮 Match Found!')
                    .setDescription(`Your match is ready! Click the link above to join the match channel.`)
                    .addFields({ name: 'Match ID', value: this.match.id.slice(0, 8), inline: true }, { name: 'Map', value: this.match.map, inline: true }, { name: 'Players', value: `${this.match.players.length} players`, inline: true })
                    .setColor(0x00ff00)
                    .setTimestamp();
                const notificationMessage = await user.send({
                    content: `**Match Found:** ${channelLink}`,
                    embeds: [embed],
                });
                // Store the message reference for later deletion
                this.playerNotificationMessages.set(playerId, notificationMessage);
                console.log(`Sent match notification to ${user.username} (${playerId})`);
            }
            catch (error) {
                console.log(`Could not send match notification to player ${playerId}:`, error instanceof Error ? error.message : String(error));
            }
        }
    }
    async updatePlayerNotifications() {
        if (this.playerNotificationMessages.size === 0) {
            return;
        }
        console.log(`Updating ${this.playerNotificationMessages.size} player notification messages with match status`);
        for (const [playerId, message] of this.playerNotificationMessages) {
            try {
                await this.updatePlayerNotificationWithStatus(playerId, message);
                console.log(`Updated notification message for player ${playerId} with match status`);
            }
            catch (error) {
                console.log(`Could not update notification message for player ${playerId}:`, error instanceof Error ? error.message : String(error));
            }
        }
        this.playerNotificationMessages.clear();
    }
    async buildMatchNotificationMessage(playerId) {
        let statusTitle;
        let statusDescription;
        let statusColor;
        let result = '';
        if (this.match.state === types_1.MatchState.COMPLETED) {
            // Try to get the match result to determine the winner
            try {
                const matchResult = await MatchResult_1.MatchResult.findOne({ matchId: this.match.id });
                if (matchResult) {
                    if (playerId) {
                        // Player-specific message
                        const winnerTeam = matchResult.winningTeam === 1 ? this.match.teams.team1 : this.match.teams.team2;
                        const isWinner = winnerTeam.includes(playerId);
                        if (isWinner) {
                            statusTitle = 'Match Won! 🎉';
                            statusDescription = `Congratulations! You won the match!`;
                            statusColor = 0x00ff00; // Green
                        }
                        else {
                            statusTitle = 'Match Lost 😞';
                            statusDescription = `You lost the match. Better luck next time!`;
                            statusColor = 0xff0000; // Red
                        }
                    }
                    else {
                        // Results channel message
                        statusTitle = 'Match Completed 🏆';
                        statusDescription = `Match ${this.match.id.slice(0, 8)} has finished!`;
                        statusColor = 0xffd700; // Gold
                    }
                    result = `${(0, types_1.getTeamName)(matchResult.winningTeam)} won`;
                }
                else {
                    // Fallback if no match result found
                    if (playerId) {
                        statusTitle = 'Match Completed ✅';
                        statusDescription = `Your match has been completed.`;
                    }
                    else {
                        statusTitle = 'Match Completed ✅';
                        statusDescription = `Match ${this.match.id.slice(0, 8)} has finished!`;
                    }
                    statusColor = 0x0099ff; // Blue
                    result = 'Match completed';
                }
            }
            catch (error) {
                console.log(`Could not fetch match result for ${this.match.id}:`, error);
                if (playerId) {
                    statusTitle = '✅ Match Completed';
                    statusDescription = `Your match has been completed.`;
                }
                else {
                    statusTitle = '✅ Match Completed';
                    statusDescription = `Match ${this.match.id.slice(0, 8)} has finished!`;
                }
                statusColor = 0x0099ff; // Blue
                result = 'Match completed';
            }
        }
        else if (this.match.state === types_1.MatchState.CANCELLED) {
            if (playerId) {
                statusTitle = 'Match Cancelled ❌';
                statusDescription = `Your match was cancelled.`;
            }
            else {
                statusTitle = 'Match Cancelled ❌';
                statusDescription = `Match ${this.match.id.slice(0, 8)} was cancelled.`;
            }
            statusColor = 0xffa500; // Orange
            result = 'Match cancelled';
        }
        else {
            if (playerId) {
                statusTitle = 'Match Closed';
                statusDescription = `Your match has been closed.`;
            }
            else {
                statusTitle = 'Match Closed';
                statusDescription = `Match ${this.match.id.slice(0, 8)} has been closed.`;
            }
            statusColor = 0x808080; // Grey
            result = 'Match closed';
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(statusTitle)
            .setDescription(statusDescription)
            .addFields({ name: 'Match ID', value: this.match.id.slice(0, 8), inline: true }, { name: 'Map', value: this.match.map, inline: true }, { name: 'Result', value: result, inline: true }, { name: types_1.TeamName.TEAM1, value: this.match.teams.team1.map((id) => `<@${id}>`).join('\n'), inline: true }, { name: types_1.TeamName.TEAM2, value: this.match.teams.team2.map((id) => `<@${id}>`).join('\n'), inline: true })
            .setColor(statusColor)
            .setTimestamp();
        const content = playerId ? `**Match History**` : ``;
        return { content, embeds: [embed] };
    }
    async updatePlayerNotificationWithStatus(playerId, message) {
        const messageData = await this.buildMatchNotificationMessage(playerId);
        await message.edit(messageData);
    }
    async postToResultsChannel() {
        if (!this.resultsChannel) {
            return; // No results channel available
        }
        try {
            const messageData = await this.buildMatchNotificationMessage(null);
            await this.resultsChannel.send(messageData);
            console.log(`Posted match result to results channel for match ${this.match.id}`);
        }
        catch (error) {
            console.error(`Error posting result to results channel for match ${this.match.id}:`, error);
        }
    }
    static async cleanupMatchChannels(guild, match) {
        let deletedChannels = 0;
        try {
            // Delete text channel
            if (match.discordChannelId) {
                try {
                    const textChannel = await guild.channels.fetch(match.discordChannelId);
                    if (textChannel) {
                        await textChannel.delete();
                        deletedChannels++;
                        console.log(`Deleted text channel ${match.discordChannelId} for match ${match.matchId}`);
                    }
                }
                catch (error) {
                    console.log(`Text channel ${match.discordChannelId} no longer exists`);
                }
            }
            // Delete voice channel 1
            if (match.discordVoiceChannel1Id) {
                try {
                    const voiceChannel1 = await guild.channels.fetch(match.discordVoiceChannel1Id);
                    if (voiceChannel1) {
                        await voiceChannel1.delete();
                        deletedChannels++;
                        console.log(`Deleted voice channel 1 ${match.discordVoiceChannel1Id} for match ${match.matchId}`);
                    }
                }
                catch (error) {
                    console.log(`Voice channel 1 ${match.discordVoiceChannel1Id} no longer exists`);
                }
            }
            // Delete voice channel 2
            if (match.discordVoiceChannel2Id) {
                try {
                    const voiceChannel2 = await guild.channels.fetch(match.discordVoiceChannel2Id);
                    if (voiceChannel2) {
                        await voiceChannel2.delete();
                        deletedChannels++;
                        console.log(`Deleted voice channel 2 ${match.discordVoiceChannel2Id} for match ${match.matchId}`);
                    }
                }
                catch (error) {
                    console.log(`Voice channel 2 ${match.discordVoiceChannel2Id} no longer exists`);
                }
            }
        }
        catch (error) {
            console.error(`Error deleting channels for match ${match.matchId}:`, error);
        }
        return deletedChannels;
    }
}
exports.MatchHandler = MatchHandler;
MatchHandler.READY_TIMEOUT = 3 * 60 * 1000; // 3 minutes (there is no penalty for being slow to ready up rn)
MatchHandler.VOTE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
//# sourceMappingURL=match_handler.js.map