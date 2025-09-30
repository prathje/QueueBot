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
  Message,
  MessageFlags
} from 'discord.js';
import { IQueue } from '../types';
import { PlayerService } from './players';
import { MatchmakingService } from './matchmaking';
import { MatchHandler } from './match_handler';
import { Mutex } from '../utils/mutex';
import { shuffled } from '../utils';

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
  private matchmakingMutex: Mutex;
  private interactionListener: ((interaction: any) => Promise<void>) | null = null;
  private disabled: boolean = false;

  constructor(client: Client, guild: Guild, category: CategoryChannel, config: QueueConfig, matchmakingMutex: Mutex) {
    this.client = client;
    this.guild = guild;
    this.category = category;
    this.config = config;
    this.matchmakingMutex = matchmakingMutex;
    this.playerService = PlayerService.getInstance();
    this.matchmakingService = new MatchmakingService();
  }

  async initialize(): Promise<void> {
    await this.ensureChannel();
    await this.setupQueueMessage();
    this.setupInteractionHandlers();

    // Register this queue to receive updates when players are removed
    this.playerService.registerQueueUpdateCallback(this.config.id, () => this.updateQueueMessage());
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

    const embed = new EmbedBuilder()
      .setTitle(`${this.config.displayName} Queue`)
      .setDescription(`**Map Pool:** ${this.config.mapPool.join(', ')}`)
      .setTimestamp();

    if (this.disabled) {
      embed
        .addFields(
          { name: 'Status', value: '🚫 **Queue Disabled**', inline: true },
          { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true }
        )
        .setColor(0xFF6B6B); // Red color for disabled
    } else {
      embed
        .addFields(
          { name: 'Players in Queue', value: `${playersInQueue.length}/${this.config.playerCount}`, inline: true },
          { name: 'Algorithm', value: this.config.matchmakingAlgorithm, inline: true }
        )
        .setColor(0x00AE86); // Green color for enabled
    }

    return embed;
  }

  private createQueueButtons(): ActionRowBuilder<ButtonBuilder> {
    const joinButton = new ButtonBuilder()
      .setCustomId(`join_queue_${this.config.id}`)
      .setLabel('Join Queue')
      .setStyle(ButtonStyle.Success)
      .setDisabled(this.disabled);

    const leaveButton = new ButtonBuilder()
      .setCustomId(`leave_queue_${this.config.id}`)
      .setLabel('Leave Queue')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(this.disabled);

    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(joinButton, leaveButton);
  }

  private setupInteractionHandlers(): void {

    const m = new Mutex();

    this.interactionListener = async (interaction) => {
      if (!interaction.isButton()) return;

      const { customId } = interaction;

      if (customId === `join_queue_${this.config.id}`) {
        await m.runExclusive(() => this.handleJoinQueue(interaction));
      } else if (customId === `leave_queue_${this.config.id}`) {
        await m.runExclusive(() => this.handleLeaveQueue(interaction));
      }
    };

    this.client.on('interactionCreate', this.interactionListener);
  }

  private cleanupInteractionHandlers(): void {
    if (this.interactionListener) {
      this.client.removeListener('interactionCreate', this.interactionListener);
      this.interactionListener = null;
      console.log(`Cleaned up interaction listeners for queue ${this.config.displayName}`);
    }
  }

  private async handleJoinQueue(interaction: ButtonInteraction): Promise<void> {
    try {
      const { user } = interaction;

      if (this.disabled) {
        await interaction.reply({
          content: 'This queue is currently disabled.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const player = await this.playerService.getOrCreatePlayer(user.id, user.username);

      if (this.playerService.isPlayerInMatch(user.id)) {
        const player = await this.playerService.getPlayer(user.id);
        console.log(`Player ${user.username} (${user.id}) tried to join queue but is in match: ${player?.currentMatch}`);
        await interaction.reply({
          content: 'You are already in a match!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (this.playerService.isPlayerInQueue(user.id, this.config.id)) {
        await interaction.reply({
          content: 'You are already in this queue!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await this.playerService.addPlayerToQueue(user.id, this.config.id);
      await interaction.reply({
        content: `You joined the ${this.config.displayName} queue!`,
        flags: MessageFlags.Ephemeral
      });

      await this.updateQueueMessage();
      await this.checkForMatch();

    } catch (error) {
      console.error('Error handling join queue:', error);
      await interaction.reply({
        content: 'An error occurred while joining the queue.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleLeaveQueue(interaction: ButtonInteraction): Promise<void> {
    try {
      const { user } = interaction;

      if (!this.playerService.isPlayerInQueue(user.id, this.config.id)) {
        await interaction.reply({
          content: 'You are not in this queue!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await this.playerService.removePlayerFromQueue(user.id, this.config.id);
      await interaction.reply({
        content: `You left the ${this.config.displayName} queue!`,
        flags: MessageFlags.Ephemeral
      });

      await this.updateQueueMessage();

    } catch (error) {
      console.error('Error handling leave queue:', error);
      await interaction.reply({
        content: 'An error occurred while leaving the queue.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async addSinglePlayerProgrammatically(playerId: string): Promise<boolean> {
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
    } catch (error) {
      console.error(`Error adding player ${playerId} to queue programmatically:`, error);
      return false;
    }
  }

  private async addPlayersToQueue(playerIds: string[]): Promise<{ successful: string[], failed: string[] }> {
    const successful: string[] = [];
    const failed: string[] = [];

    // Shuffle the player order to avoid any potential bias
    const shuffledPlayerIds = shuffled(playerIds);

    console.log(`Processing batch autojoin for ${shuffledPlayerIds.length} players in queue ${this.config.id}`);

    // Add players one by one in shuffled order
    for (const playerId of shuffledPlayerIds) {
      const success = await this.addSinglePlayerProgrammatically(playerId);
      if (success) {
        successful.push(playerId);
      } else {
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

  async checkForMatch(): Promise<void> {
    // Don't process matches if the queue is disabled
    if (this.disabled) {
      return;
    }

    await this.matchmakingMutex.runExclusive(async () => {
      const queueData: IQueue = {
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

        const matchHandler = new MatchHandler(
          this.client,
          this.guild,
          match,
          async (playerIds: string[], queueId: string) => {
            // Callback to handle players joining queue (for autojoin)
            if (queueId === this.config.id) {
              const result = await this.addPlayersToQueue(playerIds);
              // Return true if any succeeded
              return result.successful.length > 0;
            }
            return false;
          },
          (matchId: string) => {
            // Callback to handle match cleanup
            this.removeMatch(matchId);
          }
        );
        await matchHandler.initialize();
        this.activeMatches.set(match.id, matchHandler);
      }
    }).catch(error => {
      console.error('Error checking for match:', error);
    });
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

  async disable(): Promise<void> {
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

  async enable(): Promise<void> {
    console.log(`Enabling queue: ${this.config.displayName}`);
    this.disabled = false;

    // Update the queue message to show enabled state
    await this.updateQueueMessage();
    console.log(`Queue ${this.config.displayName} enabled`);
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  async shutdown(): Promise<void> {
    try {
      console.log(`Shutting down queue: ${this.config.displayName}`);

      // Unregister from player service updates
      this.playerService.unregisterQueueUpdateCallback(this.config.id);

      // Clean up event listeners
      this.cleanupInteractionHandlers();

      // Cancel all active matches in this queue
      await this.cancelActiveMatches();

      if (this.queueMessage) {
        const shutdownEmbed = new EmbedBuilder()
          .setTitle(`${this.config.displayName} Queue`)
          .setDescription(`**Map Pool:** ${this.config.mapPool.join(', ')}`)
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

  private async cancelActiveMatches(): Promise<void> {
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
        } catch (error) {
          console.error(`Error cancelling match ${matchHandler.getId()}:`, error);
        }
      }

      console.log(`Cancelled all active matches in queue ${this.config.displayName}`);
    } catch (error) {
      console.error(`Error cancelling active matches in queue ${this.config.displayName}:`, error);
    }
  }
}