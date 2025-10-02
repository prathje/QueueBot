"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Leaderboard = void 0;
const discord_js_1 = require("discord.js");
const message_updater_1 = require("../utils/message_updater");
class Leaderboard {
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
            await this.sendInitialLeaderboard();
        }
        catch (error) {
            console.error(`Error ensuring leaderboard channel for gamemode ${this.gamemodeId}:`, error);
            throw error;
        }
    }
    async sendInitialLeaderboard() {
        if (!this.leaderboardChannel)
            return;
        try {
            // Build initial leaderboard embed
            const embed = this.buildLeaderboardEmbed(await this.ratingService.getLeaderboard(50));
            // Send the initial message
            const message = await this.leaderboardChannel.send({ embeds: [embed] });
            // Create MessageUpdater for this message
            this.messageUpdater = new message_updater_1.MessageUpdater(message, 750);
        }
        catch (error) {
            console.error(`Error sending initial leaderboard for gamemode ${this.gamemodeId}:`, error);
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
            // Create leaderboard description with rankings
            const description = leaderboard.map((entry, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                const ordinalChange = entry.ordinalDiff >= 0 ? `+${entry.ordinalDiff.toFixed(1)}` : `${entry.ordinalDiff.toFixed(1)}`;
                return `${medal} <@${entry.player}> - ${entry.ordinal.toFixed(1)} (${ordinalChange}) - ${entry.matches} matches`;
            }).join('\n');
            embed.setDescription(description);
        }
        return embed;
    }
    async updateLeaderboard() {
        if (!this.messageUpdater) {
            console.error('MessageUpdater not initialized');
            return;
        }
        try {
            // Get top 50 players from leaderboard
            const leaderboard = await this.ratingService.getLeaderboard(50);
            // Build leaderboard embed
            const embed = this.buildLeaderboardEmbed(leaderboard);
            // Use MessageUpdater to throttle updates
            this.messageUpdater.update({ embeds: [embed] });
        }
        catch (error) {
            console.error(`Error updating leaderboard for gamemode ${this.gamemodeDisplayName}:`, error);
        }
    }
}
exports.Leaderboard = Leaderboard;
//# sourceMappingURL=leaderboard.js.map