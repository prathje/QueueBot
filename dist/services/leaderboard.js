"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Leaderboard = void 0;
const discord_js_1 = require("discord.js");
const message_updater_1 = require("../utils/message_updater");
class Leaderboard {
    getNumberWithOrdinal(n) {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
    constructor(client, guild, ratingService, gamemodeId, gamemodeDisplayName) {
        this.leaderboardChannel = null;
        this.messageUpdater = null;
        this.interactionListener = null;
        this.client = client;
        this.guild = guild;
        this.ratingService = ratingService;
        this.gamemodeId = gamemodeId;
        this.gamemodeDisplayName = gamemodeDisplayName;
    }
    async initialize(category) {
        try {
            const channelName = `${this.gamemodeId}-leaderboard`;
            let leaderboardChannel = this.guild.channels.cache.find(ch => ch.name === channelName &&
                ch.type === discord_js_1.ChannelType.GuildText &&
                ch.parentId === category.id);
            if (!leaderboardChannel) {
                leaderboardChannel = await this.guild.channels.create({
                    name: channelName,
                    type: discord_js_1.ChannelType.GuildText,
                    parent: category.id,
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
                console.log(`Created leaderboard channel: ${channelName}`);
            }
            else {
                // Update permissions for existing leaderboard channel
                await leaderboardChannel.permissionOverwrites.set([
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
                console.log(`Updated permissions for existing leaderboard channel: ${channelName}`);
            }
            this.leaderboardChannel = leaderboardChannel;
            // Check for existing leaderboard message and initialize MessageUpdater
            await this.initializeMessageUpdater();
            // Setup interaction handlers
            this.setupInteractionHandlers();
            // Send initial leaderboard message
            await this.updateLeaderboard();
        }
        catch (error) {
            console.error(`Error ensuring leaderboard channel for gamemode ${this.gamemodeId}:`, error);
            throw error;
        }
    }
    async initializeMessageUpdater() {
        if (!this.leaderboardChannel)
            return;
        try {
            // Fetch recent messages from the leaderboard channel
            const messages = await this.leaderboardChannel.messages.fetch({ limit: 10 });
            // Look for an existing leaderboard message from this bot
            const existingMessage = messages.find(msg => msg.author.id === this.client.user?.id &&
                msg.embeds.length > 0 &&
                msg.embeds[0].title?.includes(`${this.gamemodeDisplayName} Leaderboard`));
            if (existingMessage) {
                // Reuse existing message
                this.messageUpdater = new message_updater_1.MessageUpdater(existingMessage, 750);
                console.log(`Found existing leaderboard message for ${this.gamemodeDisplayName}`);
            }
        }
        catch (error) {
            console.error(`Error checking for existing leaderboard message in ${this.gamemodeDisplayName}:`, error);
        }
    }
    buildLeaderboardEmbed(leaderboard) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`🏆 ${this.gamemodeDisplayName} Leaderboard`)
            .setColor(0x00FF00)
            .setTimestamp();
        if (leaderboard.length === 0) {
            embed.setDescription('No players have completed matches yet.');
        }
        else {
            // Build arrays for each column
            const ranks = [];
            const players = [];
            const ratings = [];
            leaderboard.forEach((entry, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : this.getNumberWithOrdinal(rank);
                // format (${entry.matches} matches) but if matches == 1 then "1 match"
                const matchText = entry.matches === 1 ? '1 match' : `${entry.matches} matches`;
                const ratingDisplay = `${entry.ordinal.toFixed(1)} (${matchText})`;
                ranks.push(medal);
                players.push(`<@${entry.player}>`);
                ratings.push(ratingDisplay);
            });
            // Add three fields with all values joined by newlines
            embed.addFields({ name: 'Rank', value: ranks.join('\n'), inline: true }, { name: 'Player', value: players.join('\n'), inline: true }, { name: 'Rating', value: ratings.join('\n'), inline: true });
        }
        return embed;
    }
    createRankButton() {
        const rankButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`show_rank_${this.gamemodeId}`)
            .setLabel('Show My Rank')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji('🔍');
        const historyButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`show_history_${this.gamemodeId}`)
            .setLabel('Show My History')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji('📈');
        return new discord_js_1.ActionRowBuilder().addComponents(rankButton, historyButton);
    }
    setupInteractionHandlers() {
        this.interactionListener = async (interaction) => {
            if (!interaction.isButton())
                return;
            const { customId } = interaction;
            // note that this does NOT run exclusively rn
            if (customId === `show_rank_${this.gamemodeId}`) {
                await this.handleShowRank(interaction);
            }
            else if (customId === `show_history_${this.gamemodeId}`) {
                await this.handleShowHistory(interaction);
            }
        };
        this.client.on('interactionCreate', this.interactionListener);
    }
    async handleShowRank(interaction) {
        try {
            const userId = interaction.user.id;
            const userRank = await this.getUserRank(userId);
            if (!userRank) {
                await interaction.reply({
                    content: `You haven't played any matches in ${this.gamemodeDisplayName} yet. Play some matches to get ranked!`,
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            const embed = this.createUserRankEmbed(userId, userRank.rank, userRank.entry);
            await interaction.reply({
                embeds: [embed],
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
        catch (error) {
            console.error('Error handling show rank interaction:', error);
            await interaction.reply({
                content: 'Sorry, there was an error retrieving your rank. Please try again later.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async handleShowHistory(interaction) {
        try {
            const userId = interaction.user.id;
            const history = await this.ratingService.getPlayerRatingHistory(userId, 10);
            if (!history || history.length === 0) {
                await interaction.reply({
                    content: `You haven't played any matches in ${this.gamemodeDisplayName} yet. Play some matches to see your rating history!`,
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            const embed = this.createUserHistoryEmbed(userId, history);
            await interaction.reply({
                embeds: [embed],
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
        catch (error) {
            console.error('Error handling show history interaction:', error);
            await interaction.reply({
                content: 'Sorry, there was an error retrieving your history. Please try again later.',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
    async updateLeaderboard() {
        try {
            // Get top 50 players from leaderboard
            const leaderboard = await this.ratingService.getLeaderboard(50);
            // Build leaderboard embed and button
            const embed = this.buildLeaderboardEmbed(leaderboard);
            const button = this.createRankButton();
            if (this.messageUpdater) {
                // Use MessageUpdater to throttle updates
                this.messageUpdater.update({ embeds: [embed], components: [button] });
            }
            else {
                // Send the initial message
                if (this.leaderboardChannel) {
                    const message = await this.leaderboardChannel.send({ embeds: [embed], components: [button] });
                    // Create MessageUpdater for this message
                    this.messageUpdater = new message_updater_1.MessageUpdater(message, 750);
                }
            }
        }
        catch (error) {
            console.error(`Error updating leaderboard for gamemode ${this.gamemodeDisplayName}:`, error);
        }
    }
    async getUserRank(userId) {
        try {
            // Get full leaderboard to find user's position
            const leaderboard = await this.ratingService.getLeaderboard(1000); // Get more entries to find user
            const userIndex = leaderboard.findIndex(entry => entry.player === userId);
            if (userIndex === -1) {
                return null; // User not found on leaderboard
            }
            return {
                rank: userIndex + 1,
                entry: leaderboard[userIndex]
            };
        }
        catch (error) {
            console.error(`Error getting user rank for ${userId}:`, error);
            return null;
        }
    }
    createUserRankEmbed(userId, rank, entry) {
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : this.getNumberWithOrdinal(rank);
        const ratingDisplay = `${entry.ordinal.toFixed(1)}`;
        return new discord_js_1.EmbedBuilder()
            .setTitle(`Your Rank in ${this.gamemodeDisplayName}`)
            .setColor(0x00FF00)
            .setDescription(`<@${userId}>, here's your current ranking:`)
            .addFields({ name: 'Rank', value: medal, inline: true }, { name: 'Rating', value: ratingDisplay, inline: true }, { name: 'Matches', value: `${entry.matches}`, inline: true })
            .setTimestamp();
    }
    createUserHistoryEmbed(userId, history) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Your Rating History in ${this.gamemodeDisplayName}`)
            .setColor(0x00FF00)
            .setDescription(`<@${userId}>, here are your last ${history.length} matches:`)
            .setTimestamp();
        // Build arrays for each column
        const dates = [];
        const diffs = [];
        history.forEach((entry) => {
            // Format as Discord timestamp (shows in user's local timezone)
            const date = new Date(entry.date);
            const timestamp = Math.floor(date.getTime() / 1000);
            const dateString = `<t:${timestamp}:R>`;
            // Format ordinal diff
            const diffString = entry.ordinalDiff >= 0 ? `+${entry.ordinalDiff.toFixed(1)}` : `${entry.ordinalDiff.toFixed(1)}`;
            dates.push(dateString);
            diffs.push(diffString);
        });
        // Add two fields with all values joined by newlines
        embed.addFields({ name: 'Date', value: dates.join('\n'), inline: true }, { name: 'Difference', value: diffs.join('\n'), inline: true });
        return embed;
    }
    async cleanup() {
        if (this.interactionListener) {
            this.client.removeListener('interactionCreate', this.interactionListener);
            this.interactionListener = null;
            console.log(`Cleaned up interaction listeners for leaderboard ${this.gamemodeDisplayName}`);
        }
        // Remove buttons from leaderboard message but keep the message
        if (this.messageUpdater) {
            try {
                // Get current leaderboard data
                const leaderboard = await this.ratingService.getLeaderboard(50);
                const embed = this.buildLeaderboardEmbed(leaderboard);
                // Update message with embed but no components (removes buttons)
                await this.messageUpdater.forceUpdate();
                this.messageUpdater.update({ embeds: [embed], components: [] });
                await this.messageUpdater.forceUpdate();
            }
            catch (error) {
                console.error(`Error removing buttons from leaderboard message: ${error}`);
            }
            this.messageUpdater.destroy();
            this.messageUpdater = null;
        }
    }
}
exports.Leaderboard = Leaderboard;
//# sourceMappingURL=leaderboard.js.map