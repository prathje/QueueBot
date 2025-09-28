"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchHandler = void 0;
const discord_js_1 = require("discord.js");
const types_1 = require("../types");
const Match_1 = require("../models/Match");
const MatchResult_1 = require("../models/MatchResult");
const players_1 = require("./players");
const utils_1 = require("../utils");
class MatchHandler {
    constructor(client, guild, match) {
        this.channel = null;
        this.voiceChannel1 = null;
        this.voiceChannel2 = null;
        this.matchMessage = null;
        this.readyTimeout = null;
        this.voteTimeout = null;
        this.queueAutojoin = new Set();
        this.client = client;
        this.guild = guild;
        this.match = match;
        this.playerService = players_1.PlayerService.getInstance();
    }
    async initialize() {
        await this.saveMatch();
        await this.createMatchChannel();
        await this.createVoiceChannels();
        await this.setupMatchMessage();
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
                votes: this.match.votes
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
                votes: this.match.votes
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
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ManageChannels]
                    },
                    ...this.match.players.map(playerId => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages]
                    }))
                ]
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
                name: `${baseChannelName} - Team 1`,
                type: discord_js_1.ChannelType.GuildVoice,
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.ManageChannels]
                    },
                    ...this.match.teams.team1.map(playerId => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect]
                    }))
                ]
            });
            this.voiceChannel2 = await this.guild.channels.create({
                name: `${baseChannelName} - Team 2`,
                type: discord_js_1.ChannelType.GuildVoice,
                permissionOverwrites: [
                    {
                        id: this.guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user.id,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.ManageChannels]
                    },
                    ...this.match.teams.team2.map(playerId => ({
                        id: playerId,
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect]
                    }))
                ]
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
        const row = this.createMatchButtons();
        try {
            const messageOptions = {
                content: `Match found! <@${this.match.players.join('> <@')}>`,
                embeds: [embed]
            };
            if (row) {
                messageOptions.components = [row];
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
            .setColor(0x0099FF)
            .setTimestamp();
        if (this.match.state === types_1.MatchState.READY_UP) {
            embed.addFields({ name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Ready Players', value: `${this.match.readyPlayers.length}/${this.match.players.length}`, inline: true });
        }
        else if (this.match.state === types_1.MatchState.IN_PROGRESS) {
            const team1Votes = this.match.votes.team1.length;
            const team2Votes = this.match.votes.team2.length;
            const cancelVotes = this.match.votes.cancel.length;
            embed.addFields({ name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Votes', value: `Team 1: ${team1Votes}\nTeam 2: ${team2Votes}\nCancel: ${cancelVotes}`, inline: true });
        }
        else if (this.match.state === types_1.MatchState.COMPLETED) {
            const team1Votes = this.match.votes.team1.length;
            const team2Votes = this.match.votes.team2.length;
            const winningTeam = team1Votes > team2Votes ? 1 : 2;
            embed
                .setColor(0xFFD700)
                .addFields({ name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true }, { name: '🏆 Result', value: `**Team ${winningTeam} Wins!**\n\nFinal Votes:\nTeam 1: ${team1Votes}\nTeam 2: ${team2Votes}`, inline: true });
        }
        else if (this.match.state === types_1.MatchState.CANCELLED) {
            embed
                .setColor(0xFF0000)
                .addFields({ name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true }, { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true }, { name: '❌ Status', value: '**Match Cancelled**\n\nVoting is no longer available.', inline: true });
        }
        return embed;
    }
    createMatchButtons() {
        if (this.match.state === types_1.MatchState.READY_UP) {
            return new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`ready_${this.match.id}`)
                .setLabel('Ready Up!')
                .setStyle(discord_js_1.ButtonStyle.Success));
        }
        else if (this.match.state === types_1.MatchState.IN_PROGRESS) {
            return new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_team1_${this.match.id}`)
                .setLabel('Team 1 Wins')
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_team2_${this.match.id}`)
                .setLabel('Team 2 Wins')
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                .setCustomId(`vote_cancel_${this.match.id}`)
                .setLabel('Cancel Match')
                .setStyle(discord_js_1.ButtonStyle.Danger));
        }
        else if (this.match.state === types_1.MatchState.COMPLETED || this.match.state === types_1.MatchState.CANCELLED) {
            return new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`autojoin_queue_${this.match.id}`)
                .setLabel('🔄 Auto-join Next Queue')
                .setStyle(discord_js_1.ButtonStyle.Secondary));
        }
        return null;
    }
    setupInteractionHandlers() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton())
                return;
            const { customId, user } = interaction;
            if (customId === `ready_${this.match.id}`) {
                await this.handleReady(interaction);
            }
            else if (customId === `vote_team1_${this.match.id}`) {
                await this.handleVote(interaction, 'team1');
            }
            else if (customId === `vote_team2_${this.match.id}`) {
                await this.handleVote(interaction, 'team2');
            }
            else if (customId === `vote_cancel_${this.match.id}`) {
                await this.handleVote(interaction, 'cancel');
            }
            else if (customId === `autojoin_queue_${this.match.id}`) {
                await this.handleAutojoinRegistration(interaction);
            }
        });
    }
    async handleAutojoinRegistration(interaction) {
        try {
            const { user } = interaction;
            // Check if user was in this match
            if (!this.match.players.includes(user.id)) {
                await interaction.reply({
                    content: 'You were not in this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            // Check if they're already registered for autojoin
            if (this.queueAutojoin.has(user.id)) {
                // Remove from autojoin
                this.queueAutojoin.delete(user.id);
                await interaction.reply({
                    content: '❌ Removed from auto-join list. You will not automatically rejoin the queue.',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
            }
            else {
                // Add to autojoin
                this.queueAutojoin.add(user.id);
                await interaction.reply({
                    content: '✅ Added to auto-join list! You will automatically rejoin the queue when this match closes.',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
            }
        }
        catch (error) {
            console.error('Error handling autojoin registration:', error);
            await interaction.reply({
                content: 'An error occurred while registering for auto-join.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async startReadyPhase() {
        this.match.state = types_1.MatchState.READY_UP;
        await this.updateMatch();
        await this.updateMatchMessage();
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
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            if (this.match.readyPlayers.includes(user.id)) {
                await interaction.reply({
                    content: 'You are already ready!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            this.match.readyPlayers.push(user.id);
            await interaction.reply({
                content: 'You are ready!',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            await this.updateMatchMessage();
            await this.updateMatch();
            if (this.match.readyPlayers.length === this.match.players.length) {
                await this.startMatch();
            }
        }
        catch (error) {
            console.error('Error handling ready:', error);
            await interaction.reply({
                content: 'An error occurred while readying up.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async startMatch() {
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = null;
        }
        this.match.state = types_1.MatchState.IN_PROGRESS;
        await this.updateMatch();
        await this.updateMatchMessage();
        if (this.channel) {
            await this.channel.send({
                content: '🎮 **Match started!** Good luck and have fun!',
                embeds: [ /*new EmbedBuilder()
                  .setDescription(`Voice channels have been created for your teams.`)
                  .setColor(0x00FF00)*/]
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
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            // Check if match is still accepting votes
            if (this.match.state !== types_1.MatchState.IN_PROGRESS) {
                await interaction.reply({
                    content: 'Voting is no longer available for this match!',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            // Remove user's previous vote if they had one
            this.match.votes.team1 = this.match.votes.team1.filter(id => id !== user.id);
            this.match.votes.team2 = this.match.votes.team2.filter(id => id !== user.id);
            this.match.votes.cancel = this.match.votes.cancel.filter(id => id !== user.id);
            // Add new vote
            this.match.votes[voteType].push(user.id);
            const voteLabels = { team1: 'Team 1', team2: 'Team 2', cancel: 'Cancel' };
            await interaction.reply({
                content: `You voted for ${voteLabels[voteType]}!`,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            await this.checkVoteResults();
        }
        catch (error) {
            console.error('Error handling vote:', error);
            await interaction.reply({
                content: 'An error occurred while voting.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async checkVoteResults() {
        // Only process votes if match is still in progress
        if (this.match.state !== types_1.MatchState.IN_PROGRESS) {
            return;
        }
        const totalPlayers = this.match.players.length;
        const majority = Math.ceil(totalPlayers / 2);
        const team1Votes = this.match.votes.team1.length;
        const team2Votes = this.match.votes.team2.length;
        const cancelVotes = this.match.votes.cancel.length;
        if (cancelVotes >= majority) {
            await this.cancelMatch('Match cancelled by player vote');
        }
        else if (team1Votes >= majority) {
            await this.completeMatch(1);
        }
        else if (team2Votes >= majority) {
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
        const matchResult = new MatchResult_1.MatchResult({
            matchId: this.match.id,
            queueId: this.match.queueId,
            gamemodeId: this.match.gamemodeId,
            winningTeam,
            map: this.match.map,
            teams: {
                team1: this.match.teams.team1,
                team2: this.match.teams.team2
            },
            players: this.match.players,
            completedAt: new Date()
        });
        try {
            await matchResult.save();
            console.log(`Match ${this.match.id} completed, team ${winningTeam} wins`);
        }
        catch (error) {
            console.error('Error saving match result:', error);
        }
        if (this.channel) {
            await this.channel.send({
                content: `🏆 **Match completed!** Team ${winningTeam} wins!`,
                embeds: [new discord_js_1.EmbedBuilder()
                        .setDescription('GG! The match will be closed in 30 seconds.')
                        .setColor(0xFFD700)]
            });
        }
        setTimeout(async () => {
            await this.closeMatch();
        }, 30000);
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
        for (const playerId of this.match.players) {
            await this.playerService.setPlayerMatch(playerId, null);
        }
        if (this.channel) {
            await this.channel.send({
                content: `❌ **Match cancelled:** ${reason}`,
                embeds: [new discord_js_1.EmbedBuilder()
                        .setDescription('You can now join queues again. The match will be closed in 10 seconds.')
                        .setColor(0xFF0000)]
            });
        }
        console.log(`Match ${this.match.id} cancelled: ${reason}`);
        setTimeout(async () => {
            await this.closeMatch();
        }, 10000);
    }
    async closeMatch() {
        this.match.state = types_1.MatchState.CLOSED;
        await this.updateMatch();
        for (const playerId of this.match.players) {
            await this.playerService.setPlayerMatch(playerId, null);
        }
        // Handle autojoin for registered players in random order
        if (this.queueAutojoin.size > 0) {
            console.log(`Processing autojoin for ${this.queueAutojoin.size} players`);
            // Add players back to queue in random order
            const shuffledPlayers = (0, utils_1.shuffled)(Array.from(this.queueAutojoin));
            for (const playerId of shuffledPlayers) {
                try {
                    await this.playerService.addPlayerToQueue(playerId, this.match.queueId);
                    console.log(`Auto-rejoined player ${playerId} to queue ${this.match.queueId}`);
                }
                catch (error) {
                    console.error(`Failed to auto-rejoin player ${playerId} to queue:`, error);
                }
            }
        }
        try {
            if (this.channel) {
                await this.channel.delete();
            }
            if (this.voiceChannel1) {
                await this.voiceChannel1.delete();
            }
            if (this.voiceChannel2) {
                await this.voiceChannel2.delete();
            }
            console.log(`Match ${this.match.id} closed and channels deleted`);
        }
        catch (error) {
            console.error('Error deleting match channels:', error);
        }
    }
    async updateMatchMessage() {
        if (!this.matchMessage)
            return;
        const embed = this.createMatchEmbed();
        const row = this.createMatchButtons();
        try {
            const editOptions = {
                embeds: [embed]
            };
            if (row) {
                editOptions.components = [row];
            }
            else {
                editOptions.components = [];
            }
            await this.matchMessage.edit(editOptions);
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
        // Clear any timeouts
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = null;
        }
        if (this.voteTimeout) {
            clearTimeout(this.voteTimeout);
            this.voteTimeout = null;
        }
        // Update match state
        this.match.state = types_1.MatchState.CANCELLED;
        await this.updateMatch();
        // Free players
        for (const playerId of this.match.players) {
            await this.playerService.setPlayerMatch(playerId, null);
        }
        // Send notification if channel exists
        if (this.channel) {
            try {
                await this.channel.send({
                    content: `❌ **Match force cancelled:** ${reason}`,
                    embeds: [{
                            description: 'This match was cancelled by an administrator. You can now join queues again.',
                            color: 0xFF0000
                        }]
                });
            }
            catch (error) {
                console.error('Error sending force cancel message:', error);
            }
        }
        // Mark as closed
        this.match.state = types_1.MatchState.CLOSED;
        await this.updateMatch();
    }
    async forceDelete() {
        try {
            if (this.channel) {
                await this.channel.delete();
            }
            if (this.voiceChannel1) {
                await this.voiceChannel1.delete();
            }
            if (this.voiceChannel2) {
                await this.voiceChannel2.delete();
            }
            console.log(`Force deleted channels for match ${this.match.id}`);
        }
        catch (error) {
            console.error('Error force deleting match channels:', error);
        }
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
                    .setDescription(`Your match is ready! Click the link below to join the match channel.`)
                    .addFields({ name: 'Match ID', value: this.match.id.slice(0, 8), inline: true }, { name: 'Map', value: this.match.map, inline: true }, { name: 'Players', value: `${this.match.players.length} players`, inline: true })
                    .setColor(0x00FF00)
                    .setTimestamp();
                await user.send({
                    content: `🔔 **Match Ready!**\n\n📍 **Match Channel:** ${channelLink}\n\nGood luck and have fun! 🎯`,
                    embeds: [embed]
                });
                console.log(`Sent match notification to ${user.username} (${playerId})`);
            }
            catch (error) {
                console.log(`Could not send match notification to player ${playerId}:`, error instanceof Error ? error.message : String(error));
            }
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
MatchHandler.READY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
MatchHandler.VOTE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
//# sourceMappingURL=match_handler.js.map