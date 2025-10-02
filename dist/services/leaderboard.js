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
            // Send initial leaderboard message
            await this.updateLeaderboard();
        }
        catch (error) {
            console.error(`Error ensuring leaderboard channel for gamemode ${this.gamemodeId}:`, error);
            throw error;
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
            // Add header fields
            embed.addFields({ name: 'Rank', value: '\u200B', inline: true }, { name: 'Player', value: '\u200B', inline: true }, { name: 'Rating', value: '\u200B', inline: true });
            // Add player fields
            leaderboard.forEach((entry, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : this.getNumberWithOrdinal(rank);
                const ordinalChange = entry.ordinalDiff >= 0 ? `+${entry.ordinalDiff.toFixed(1)}` : `${entry.ordinalDiff.toFixed(1)}`;
                const ratingDisplay = `${entry.ordinal.toFixed(1)} (${ordinalChange}) - ${entry.matches} matches`;
                embed.addFields({ name: '\u200B', value: medal, inline: true }, { name: '\u200B', value: `<@${entry.player}>`, inline: true }, { name: '\u200B', value: ratingDisplay, inline: true });
            });
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