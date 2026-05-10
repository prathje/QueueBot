import {
  Client,
  TextChannel,
  EmbedBuilder,
  CategoryChannel,
  ChannelType,
  Guild,
  PermissionFlagsBits,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import {
  RatingService,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_SCALE,
  RATING_DISPLAY_DECIMALS,
} from './rating';
import { renderRatingHistoryChart } from './rating_chart';
import { MessageUpdater } from '../utils/message_updater';
import { IRating, RatingValue } from '../types';
import { ordinal } from 'openskill';

function formatRating(value: number): string {
  return (RATING_DISPLAY_BASE + value * RATING_DISPLAY_SCALE).toFixed(RATING_DISPLAY_DECIMALS);
}

function formatRatingDiff(value: number): string {
  const scaled = value * RATING_DISPLAY_SCALE;
  // Round once and re-stringify to avoid a "-0" sign when a tiny negative
  // value rounds to zero at low decimal precision.
  const rounded = Number(scaled.toFixed(RATING_DISPLAY_DECIMALS));
  const formatted = rounded.toFixed(RATING_DISPLAY_DECIMALS);
  return rounded >= 0 ? `+${formatted}` : formatted;
}

function formatWinrateBadge(wins: number, matches: number): string {
  if (matches === 0) return '(0 matches)';
  const pct = Math.round((wins / matches) * 100);
  return `(${pct}% • ${matches})`;
}

// Discord embed fields cap at 1024 chars; each `<@id> 55% • 114` line is
// ~32 chars, so we trim long tiers with a "+N more" tail rather than risk a
// send error.
function formatTierPlayers(
  entries: Array<{ player: string; matches: number; wins: number }>,
): string {
  if (entries.length === 0) return '_empty_';
  const FIELD_LIMIT = 1000;
  const lines: string[] = [];
  let length = 0;
  let truncatedAt = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const line = `<@${e.player}> ${formatWinrateBadge(e.wins, e.matches)}`;
    const nextLength = length + (lines.length === 0 ? line.length : line.length + 1);
    if (nextLength > FIELD_LIMIT) {
      truncatedAt = i;
      break;
    }
    lines.push(line);
    length = nextLength;
  }
  let result = lines.join('\n');
  if (truncatedAt >= 0) {
    result += `\n_+${entries.length - truncatedAt} more_`;
  }
  return result;
}

export class Leaderboard {
  private client: Client;
  private guild: Guild;
  private ratingService: RatingService;
  private leaderboardChannel: TextChannel | null = null;
  private messageUpdater: MessageUpdater | null = null;
  private gamemodeDisplayName: string;
  private gamemodeId: string;
  private interactionListener: ((interaction: any) => Promise<void>) | null = null;

  private getNumberWithOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  constructor(
    client: Client,
    guild: Guild,
    ratingService: RatingService,
    gamemodeId: string,
    gamemodeDisplayName: string,
  ) {
    this.client = client;
    this.guild = guild;
    this.ratingService = ratingService;
    this.gamemodeId = gamemodeId;
    this.gamemodeDisplayName = gamemodeDisplayName;
  }

  async initialize(category: CategoryChannel): Promise<void> {
    try {
      const channelName = `${this.gamemodeId}-leaderboard`;

      let leaderboardChannel = this.guild.channels.cache.find(
        (ch) => ch.name === channelName && ch.type === ChannelType.GuildText && ch.parentId === category.id,
      ) as TextChannel;

      if (!leaderboardChannel) {
        leaderboardChannel = await this.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: this.guild.roles.everyone.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.CreatePublicThreads,
                PermissionFlagsBits.CreatePrivateThreads,
              ],
            },
            {
              id: this.client.user!.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
              ],
            },
          ],
        });
        console.log(`Created leaderboard channel: ${channelName}`);
      } else {
        // Update permissions for existing leaderboard channel
        await leaderboardChannel.permissionOverwrites.set([
          {
            id: this.guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads,
            ],
          },
          {
            id: this.client.user!.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
            ],
          },
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
    } catch (error) {
      console.error(`Error ensuring leaderboard channel for gamemode ${this.gamemodeId}:`, error);
      throw error;
    }
  }

  private async initializeMessageUpdater(): Promise<void> {
    if (!this.leaderboardChannel) return;

    try {
      // Fetch recent messages from the leaderboard channel
      const messages = await this.leaderboardChannel.messages.fetch({ limit: 10 });

      // Look for an existing leaderboard message from this bot
      const existingMessage = messages.find(
        (msg) =>
          msg.author.id === this.client.user?.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title?.includes(`${this.gamemodeDisplayName} Leaderboard`),
      );

      if (existingMessage) {
        // Reuse existing message
        this.messageUpdater = new MessageUpdater(existingMessage, 750);
        console.log(`Found existing leaderboard message for ${this.gamemodeDisplayName}`);
      }
    } catch (error) {
      console.error(`Error checking for existing leaderboard message in ${this.gamemodeDisplayName}:`, error);
    }
  }

  private buildLeaderboardEmbed(
    leaderboard: Array<{
      player: string;
      rating: any;
      ordinal: number;
      ordinalDiff: number;
      matches: number;
      wins: number;
    }>,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${this.gamemodeDisplayName} Leaderboard`)
      .setColor(0x00ff00)
      .setTimestamp();

    if (leaderboard.length === 0) {
      embed.setDescription('No players have completed matches yet.');
    } else {
      // Build arrays for each column
      const ranks: string[] = [];
      const players: string[] = [];
      const ratings: string[] = [];

      leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : this.getNumberWithOrdinal(rank);
        const ratingDisplay = `${formatRating(entry.ordinal)} ${formatWinrateBadge(entry.wins, entry.matches)}`;

        ranks.push(medal);
        players.push(`<@${entry.player}>`);
        ratings.push(ratingDisplay);
      });

      // Add three fields with all values joined by newlines
      embed.addFields(
        { name: 'Rank', value: ranks.join('\n'), inline: true },
        { name: 'Player', value: players.join('\n'), inline: true },
        { name: 'Rating', value: ratings.join('\n'), inline: true },
      );
    }

    return embed;
  }

  private createRankButton(): ActionRowBuilder<ButtonBuilder> {
    const rankButton = new ButtonBuilder()
      .setCustomId(`show_rank_${this.gamemodeId}`)
      .setLabel('Show My Rank')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔍');

    const historyButton = new ButtonBuilder()
      .setCustomId(`show_history_${this.gamemodeId}`)
      .setLabel('Show My History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📈');

    const tierlistButton = new ButtonBuilder()
      .setCustomId(`show_tierlist_${this.gamemodeId}`)
      .setLabel('Show Tierlist')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏷️');

    return new ActionRowBuilder<ButtonBuilder>().addComponents(rankButton, historyButton, tierlistButton);
  }

  private setupInteractionHandlers(): void {
    this.interactionListener = async (interaction) => {
      if (!interaction.isButton()) return;
      const { customId } = interaction;
      // note that this does NOT run exclusively rn
      if (customId === `show_rank_${this.gamemodeId}`) {
        await this.handleShowRank(interaction);
      } else if (customId === `show_history_${this.gamemodeId}`) {
        await this.handleShowHistory(interaction);
      } else if (customId === `show_tierlist_${this.gamemodeId}`) {
        await this.handleShowTierlist(interaction);
      }
    };

    this.client.on('interactionCreate', this.interactionListener);
  }

  private async handleShowRank(interaction: ButtonInteraction): Promise<void> {
    try {
      const userId = interaction.user.id;
      const userRank = await this.getUserRank(userId);

      if (!userRank) {
        await interaction.reply({
          content: `You haven't played any matches in ${this.gamemodeDisplayName} yet. Play some matches to get ranked!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = this.createUserRankEmbed(userId, userRank.rank, userRank.entry);

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error handling show rank interaction:', error);
      await interaction.reply({
        content: 'Sorry, there was an error retrieving your rank. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async handleShowHistory(interaction: ButtonInteraction): Promise<void> {
    try {
      const userId = interaction.user.id;
      const history = await this.ratingService.getPlayerRatingHistory(userId, 10);

      if (!history || history.length === 0) {
        await interaction.reply({
          content: `You haven't played any matches in ${this.gamemodeDisplayName} yet. Play some matches to see your rating history!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const currentRating = await this.ratingService.getPlayerRating(userId);
      const mainEmbed = this.createUserHistoryEmbed(userId, history, currentRating);

      const now = new Date();
      const fullHistory = await this.ratingService.getPlayerRatingHistoryAscending(userId);

      const lastWeekFile = await this.buildChartAttachment(
        fullHistory,
        now,
        { since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), showEvents: true },
        'last_week.png',
      );
      const overallFile = await this.buildChartAttachment(
        fullHistory,
        now,
        { showEvents: false },
        'overall.png',
      );

      const embeds = [mainEmbed];
      const files: AttachmentBuilder[] = [];

      if (lastWeekFile) {
        mainEmbed.setImage('attachment://last_week.png');
        files.push(lastWeekFile);
      }
      if (overallFile) {
        const overallEmbed = new EmbedBuilder()
          .setTitle('All-time')
          .setColor(0x00ff00)
          .setImage('attachment://overall.png');
        embeds.push(overallEmbed);
        files.push(overallFile);
      }

      await interaction.reply({
        embeds,
        files,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error handling show history interaction:', error);
      await interaction.reply({
        content: 'Sorry, there was an error retrieving your history. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async handleShowTierlist(interaction: ButtonInteraction): Promise<void> {
    try {
      const entries = await this.ratingService.getTierlistEntries();
      const embed = this.buildTierlistEmbed(entries);
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error handling show tierlist interaction:', error);
      await interaction.reply({
        content: 'Sorry, there was an error building the tierlist. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private buildTierlistEmbed(
    entries: Array<{ player: string; ordinal: number; sigma: number; matches: number; wins: number }>,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`🏷️ ${this.gamemodeDisplayName} Tierlist`)
      .setColor(0x5865f2)
      .setTimestamp();

    if (entries.length === 0) {
      embed.setDescription('No players have completed matches yet.');
      return embed;
    }

    // Players whose rating isn't settled (sigma still high) — split off so
    // they don't pollute the percentile ranking with noisy ordinals.
    const PROVISIONAL_SIGMA = 5;
    const provisional = entries.filter((e) => e.sigma > PROVISIONAL_SIGMA);
    const confirmed = entries.filter((e) => e.sigma <= PROVISIONAL_SIGMA);

    // Percentile cuts: S top 5%, A 5–15%, B 15–35%, C 35–65%, D 65–100%.
    type TierEntry = { player: string; matches: number; wins: number };
    const tiers: Array<{ label: string; emoji: string; players: TierEntry[] }> = [
      { label: 'S', emoji: '🟥', players: [] },
      { label: 'A', emoji: '🟧', players: [] },
      { label: 'B', emoji: '🟨', players: [] },
      { label: 'C', emoji: '🟩', players: [] },
      { label: 'D', emoji: '🟦', players: [] },
    ];
    const cuts = [0.05, 0.15, 0.35, 0.65, 1.0];

    confirmed.forEach((entry, idx) => {
      const pct = (idx + 1) / confirmed.length;
      const tierIdx = cuts.findIndex((c) => pct <= c);
      tiers[Math.max(0, tierIdx)].players.push(entry);
    });

    embed.setDescription(
      `Tier cutoffs by ordinal percentile (raw, no decay applied). ` +
        `Players with σ > ${PROVISIONAL_SIGMA} are counted as **Provisional**.`,
    );

    for (const tier of tiers) {
      embed.addFields({
        name: `${tier.emoji} Tier ${tier.label} (${tier.players.length})`,
        value: formatTierPlayers(tier.players),
        inline: false,
      });
    }
    if (provisional.length > 0) {
      embed.addFields({
        name: `❓ Provisional (${provisional.length})`,
        value: '_Players whose rating isn\'t settled yet — keep playing!_',
        inline: false,
      });
    }

    return embed;
  }

  private async buildChartAttachment(
    history: IRating[],
    asOf: Date,
    options: Parameters<typeof renderRatingHistoryChart>[2],
    fileName: string,
  ): Promise<AttachmentBuilder | null> {
    try {
      const buffer = await renderRatingHistoryChart(history, asOf, options);
      if (!buffer) return null;
      return new AttachmentBuilder(buffer, { name: fileName });
    } catch (error) {
      console.error(`Error rendering rating history chart (${fileName}):`, error);
      return null;
    }
  }

  async updateLeaderboard(): Promise<void> {
    try {
      // Get top 30 players from leaderboard
      const leaderboard = await this.ratingService.getLeaderboard(30);

      // Build leaderboard embed and button
      const embed = this.buildLeaderboardEmbed(leaderboard);
      const button = this.createRankButton();

      if (this.messageUpdater) {
        // Use MessageUpdater to throttle updates
        this.messageUpdater.update({ embeds: [embed], components: [button] });
      } else {
        // Send the initial message
        if (this.leaderboardChannel) {
          const message = await this.leaderboardChannel.send({ embeds: [embed], components: [button] });
          // Create MessageUpdater for this message
          this.messageUpdater = new MessageUpdater(message, 750);
        }
      }
    } catch (error) {
      console.error(`Error updating leaderboard for gamemode ${this.gamemodeDisplayName}:`, error);
    }
  }

  async getUserRank(userId: string): Promise<{ rank: number; entry: any } | null> {
    try {
      // Get full leaderboard to find user's position
      const leaderboard = await this.ratingService.getLeaderboard(1000); // Get more entries to find user, TODO: This is not nice!

      const userIndex = leaderboard.findIndex((entry) => entry.player === userId);

      if (userIndex === -1) {
        return null; // User not found on leaderboard
      }

      return {
        rank: userIndex + 1,
        entry: leaderboard[userIndex],
      };
    } catch (error) {
      console.error(`Error getting user rank for ${userId}:`, error);
      return null;
    }
  }

  createUserRankEmbed(userId: string, rank: number, entry: any): EmbedBuilder {
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : this.getNumberWithOrdinal(rank);
    const ratingDisplay = formatRating(entry.ordinal);
    const winrate = entry.matches > 0 ? Math.round((entry.wins / entry.matches) * 100) : 0;
    const matchesDisplay =
      entry.matches > 0 ? `${entry.matches} (${winrate}% won)` : `${entry.matches}`;

    return new EmbedBuilder()
      .setTitle(`Your Rank in ${this.gamemodeDisplayName}`)
      .setColor(0x00ff00)
      .setDescription(`<@${userId}>, here's your current ranking:`)
      .addFields(
        { name: 'Rank', value: medal, inline: true },
        { name: 'Rating', value: ratingDisplay, inline: true },
        { name: 'Matches', value: matchesDisplay, inline: true },
      )
      .setTimestamp();
  }

  createUserHistoryEmbed(userId: string, history: any[], currentRating: RatingValue): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`Your Rating History in ${this.gamemodeDisplayName}`)
      .setColor(0x00ff00)
      .setDescription(`<@${userId}>, here are your last ${history.length} matches:`)
      .setTimestamp();

    // Show the player's current decayed rating at the top so they can see where
    // they stand right now, not just the per-match deltas below.
    embed.addFields({
      name: 'Current Rating',
      value: formatRating(ordinal(currentRating)),
      inline: false,
    });

    // Build arrays for each column
    const dates: string[] = [];
    const diffs: string[] = [];

    history.forEach((entry) => {
      // Format as Discord timestamp (shows in user's local timezone)
      const date = new Date(entry.date);
      const timestamp = Math.floor(date.getTime() / 1000);
      const dateString = `<t:${timestamp}:R>`;

      dates.push(dateString);
      diffs.push(formatRatingDiff(entry.ordinalDiff));
    });

    // Add two fields with all values joined by newlines
    embed.addFields(
      { name: 'Date', value: dates.join('\n'), inline: true },
      { name: 'Difference', value: diffs.join('\n'), inline: true },
    );

    return embed;
  }

  async cleanup(): Promise<void> {
    // Remove buttons from leaderboard message but keep the message
    if (this.messageUpdater) {
      try {
        // Get current leaderboard data
        const leaderboard = await this.ratingService.getLeaderboard(30);
        const embed = this.buildLeaderboardEmbed(leaderboard);

        // Update message with embed but no components (removes buttons)
        this.messageUpdater.update({ embeds: [embed], components: [] });
        await this.messageUpdater.forceUpdate();
      } catch (error) {
        console.error(`Error removing buttons from leaderboard message: ${error}`);
      }

      this.messageUpdater.destroy();
      this.messageUpdater = null;
    }

    if (this.interactionListener) {
      this.client.removeListener('interactionCreate', this.interactionListener);
      this.interactionListener = null;
      console.log(`Cleaned up interaction listeners for leaderboard ${this.gamemodeDisplayName}`);
    }
  }
}
