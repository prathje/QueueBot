import {
  Client,
  Guild,
  CategoryChannel,
  TextChannel,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  Message
} from 'discord.js';
import { IQueue } from '../types';
import { PlayerService } from './players';
import { MatchmakingService } from './matchmaking';
import { MatchHandler } from './match_handler';

interface QueueConfig extends Omit<IQueue, 'players' | 'discordChannelId'> {}

export class Queue {
  private client: Client;
  private guild: Guild;
  private category: CategoryChannel;
  private config: QueueConfig;
  private channel: TextChannel | null = null;
  private queueMessage: Message | null = null;
  private playerService: PlayerService;
  private matchmakingService: MatchmakingService;
  private activeMatches: Map<string, MatchHandler> = new Map();

  constructor(client: Client, guild: Guild, category: CategoryChannel, config: QueueConfig) {
    this.client = client;
    this.guild = guild;
    this.category = category;
    this.config = config;
    this.playerService = PlayerService.getInstance();
    this.matchmakingService = new MatchmakingService();
  }

  async initialize(): Promise<void> {
    await this.ensureChannel();
    await this.setupQueueMessage();
    this.setupInteractionHandlers();
  }

  private async ensureChannel(): Promise<void> {
    try {
      let channel = this.guild.channels.cache.find(
        ch => ch.name === this.config.displayName.toLowerCase().replace(/\s+/g, '-') &&
              ch.type === ChannelType.GuildText &&
              ch.parentId === this.category.id
      ) as TextChannel;

      if (!channel) {
        channel = await this.guild.channels.create({
          name: this.config.displayName.toLowerCase().replace(/\s+/g, '-'),
          type: ChannelType.GuildText,
          parent: this.category.id
        });
        console.log(`Created queue channel: ${this.config.displayName}`);
      }

      this.channel = channel;
    } catch (error) {
      console.error(`Error ensuring channel for queue ${this.config.id}:`, error);
      throw error;
    }
  }

  private async setupQueueMessage(): Promise<void> {
    if (!this.channel) return;

    try {
      const messages = await this.channel.messages.fetch({ limit: 10 });
      const existingMessage = messages.find(msg =>
        msg.author.id === this.client.user?.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title?.includes('Queue')
      );

      if (existingMessage) {
        this.queueMessage = existingMessage;
        await this.updateQueueMessage();
      } else {
        await this.createQueueMessage();
      }
    } catch (error) {
      console.error(`Error setting up queue message for ${this.config.id}:`, error);
    }
  }

  private async createQueueMessage(): Promise<void> {
    if (!this.channel) return;

    const embed = this.createQueueEmbed();
    const row = this.createQueueButtons();

    try {
      this.queueMessage = await this.channel.send({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error(`Error creating queue message for ${this.config.id}:`, error);
    }
  }

  private async updateQueueMessage(): Promise<void> {
    if (!this.queueMessage) return;

    const embed = this.createQueueEmbed();
    const row = this.createQueueButtons();

    try {
      await this.queueMessage.edit({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error(`Error updating queue message for ${this.config.id}:`, error);
    }
  }

  private createQueueEmbed(): EmbedBuilder {
    const playersInQueue = this.playerService.getPlayersInQueue(this.config.id);

    return new EmbedBuilder()
      .setTitle(`${this.config.displayName} Queue`)
      .setDescription(`Map Pool: ${this.config.mapPool.join(', ')}`)
      .addFields(
        { name: 'Players in Queue', value: `${playersInQueue.length}/${this.config.playerCount}`, inline: true },
        { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true }
      )
      .setColor(0x00AE86)
      .setTimestamp();
  }

  private createQueueButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`join_queue_${this.config.id}`)
          .setLabel('Join Queue')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`leave_queue_${this.config.id}`)
          .setLabel('Leave Queue')
          .setStyle(ButtonStyle.Danger)
      );
  }

  private setupInteractionHandlers(): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const { customId, user } = interaction;

      if (customId === `join_queue_${this.config.id}`) {
        await this.handleJoinQueue(interaction);
      } else if (customId === `leave_queue_${this.config.id}`) {
        await this.handleLeaveQueue(interaction);
      }
    });
  }

  private async handleJoinQueue(interaction: ButtonInteraction): Promise<void> {
    try {
      const { user } = interaction;
      const player = await this.playerService.getOrCreatePlayer(user.id, user.username);

      if (this.playerService.isPlayerInMatch(user.id)) {
        const player = await this.playerService.getPlayer(user.id);
        console.log(`Player ${user.username} (${user.id}) tried to join queue but is in match: ${player?.currentMatch}`);
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

    } catch (error) {
      console.error('Error handling join queue:', error);
      await interaction.reply({
        content: 'An error occurred while joining the queue.',
        ephemeral: true
      });
    }
  }

  private async handleLeaveQueue(interaction: ButtonInteraction): Promise<void> {
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

    } catch (error) {
      console.error('Error handling leave queue:', error);
      await interaction.reply({
        content: 'An error occurred while leaving the queue.',
        ephemeral: true
      });
    }
  }

  private async checkForMatch(): Promise<void> {
    try {
      const queueData: IQueue = {
        ...this.config,
        players: this.playerService.getPlayersInQueue(this.config.id),
        discordChannelId: this.channel?.id
      };

      const match = await this.matchmakingService.processQueue(queueData);

      if (match) {
        console.log(`Match created: ${match.id}`);
        const matchHandler = new MatchHandler(this.client, this.guild, match);
        await matchHandler.initialize();
        this.activeMatches.set(match.id, matchHandler);

        await this.updateQueueMessage();
      }
    } catch (error) {
      console.error('Error checking for match:', error);
    }
  }

  getActiveMatches(): MatchHandler[] {
    return Array.from(this.activeMatches.values());
  }

  removeMatch(matchId: string): void {
    this.activeMatches.delete(matchId);
  }

  getId(): string {
    return this.config.id;
  }

  getDisplayName(): string {
    return this.config.displayName;
  }

  getChannel(): TextChannel | null {
    return this.channel;
  }

  async shutdown(): Promise<void> {
    try {
      console.log(`Shutting down queue: ${this.config.displayName}`);

      if (this.queueMessage) {
        const shutdownEmbed = new EmbedBuilder()
          .setTitle(`${this.config.displayName} Queue`)
          .setDescription(`Map Pool: ${this.config.mapPool.join(', ')}`)
          .addFields(
            { name: 'Status', value: '💤 Queue is currently sleeping', inline: true },
            { name: 'Info', value: 'Bot is restarting or shutting down', inline: true }
          )
          .setColor(0xFF6B6B)
          .setTimestamp();

        // Create disabled buttons
        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('disabled_join')
              .setLabel('Join Queue')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('disabled_leave')
              .setLabel('Leave Queue')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        await this.queueMessage.edit({
          embeds: [shutdownEmbed],
          components: [disabledRow]
        });

        console.log(`Queue ${this.config.displayName} marked as sleeping`);
      }
    } catch (error) {
      console.error(`Error shutting down queue ${this.config.displayName}:`, error);
    }
  }
}