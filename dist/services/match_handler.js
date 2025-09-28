"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchHandler = void 0;
const discord_js_1 = require("discord.js");
const types_1 = require("../types");
const Match_1 = require("../models/Match");
const MatchResult_1 = require("../models/MatchResult");
const players_1 = require("./players");
class MatchHandler {
    constructor(client, guild, match) {
        this.channel = null;
        this.voiceChannel1 = null;
        this.voiceChannel2 = null;
        this.matchMessage = null;
        this.readyTimeout = null;
        this.voteTimeout = null;
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
            this.matchMessage = await this.channel.send({
                content: `Match found! <@${this.match.players.join('> <@')}>`,
                embeds: [embed],
                components: [row]
            });
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
        return new discord_js_1.ActionRowBuilder();
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
        });
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
                    ephemeral: true
                });
                return;
            }
            if (this.match.readyPlayers.includes(user.id)) {
                await interaction.reply({
                    content: 'You are already ready!',
                    ephemeral: true
                });
                return;
            }
            this.match.readyPlayers.push(user.id);
            await interaction.reply({
                content: 'You are ready!',
                ephemeral: true
            });
            if (this.match.readyPlayers.length === this.match.players.length) {
                await this.startMatch();
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
                ephemeral: true
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
                embeds: [new discord_js_1.EmbedBuilder()
                        .setDescription(`Voice channels have been created for your teams.`)
                        .setColor(0x00FF00)]
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
                    ephemeral: true
                });
                return;
            }
            const hasVoted = this.match.votes.team1.includes(user.id) ||
                this.match.votes.team2.includes(user.id) ||
                this.match.votes.cancel.includes(user.id);
            if (hasVoted) {
                await interaction.reply({
                    content: 'You have already voted!',
                    ephemeral: true
                });
                return;
            }
            this.match.votes[voteType].push(user.id);
            const voteLabels = { team1: 'Team 1', team2: 'Team 2', cancel: 'Cancel' };
            await interaction.reply({
                content: `You voted for ${voteLabels[voteType]}!`,
                ephemeral: true
            });
            await this.checkVoteResults();
        }
        catch (error) {
            console.error('Error handling vote:', error);
            await interaction.reply({
                content: 'An error occurred while voting.',
                ephemeral: true
            });
        }
    }
    async checkVoteResults() {
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
        const matchResult = new MatchResult_1.MatchResult({
            matchId: this.match.id,
            queueId: this.match.queueId,
            gamemodeId: this.match.gamemodeId,
            winningTeam,
            map: this.match.map,
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
        for (const playerId of this.match.players) {
            await this.playerService.setPlayerMatch(playerId, undefined);
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
            await this.playerService.setPlayerMatch(playerId, undefined);
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
            await this.matchMessage.edit({
                embeds: [embed],
                components: [row]
            });
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
            await this.playerService.setPlayerMatch(playerId, undefined);
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