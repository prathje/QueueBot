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
                const ratingDisplay = `${entry.ordinal.toFixed(1)} - ${entry.matches} matches`;
                ranks.push(medal);
                players.push(`<@${entry.player}>`);
                ratings.push(ratingDisplay);
            });
            // Add three fields with all values joined by newlines
            embed.addFields({ name: 'Rank', value: ranks.join('\n'), inline: true }, { name: 'Player', value: players.join('\n'), inline: true }, { name: 'Rating', value: ratings.join('\n'), inline: true });
        }
        return embed;
    }
    async updateLeaderboard() {
        try {
            // Get top 50 players from leaderboard
            const leaderboard = await this.ratingService.getLeaderboard(50);
            // Build leaderboard embed
            const embed = this.buildLeaderboardEmbed(leaderboard);
            if (this.messageUpdater) {
                // Use MessageUpdater to throttle updates
                this.messageUpdater.update({ embeds: [embed] });
            }
            else {
                // Send the initial message
                if (this.leaderboardChannel) {
                    const message = await this.leaderboardChannel.send({ embeds: [embed] });
                    // Create MessageUpdater for this message
                    this.messageUpdater = new message_updater_1.MessageUpdater(message, 750);
                }
            }
        }
        catch (error) {
            console.error(`Error updating leaderboard for gamemode ${this.gamemodeDisplayName}:`, error);
        }
    }
}
exports.Leaderboard = Leaderboard;
//# sourceMappingURL=leaderboard.js.map