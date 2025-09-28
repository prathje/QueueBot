import {
  Client,
  Guild,
  TextChannel,
  VoiceChannel,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  Message,
  PermissionFlagsBits
} from 'discord.js';
import { IMatch, MatchState } from '../types';
import { Match } from '../models/Match';
import { MatchResult } from '../models/MatchResult';
import { PlayerService } from './players';

export class MatchHandler {
  private client: Client;
  private guild: Guild;
  private match: IMatch;
  private channel: TextChannel | null = null;
  private voiceChannel1: VoiceChannel | null = null;
  private voiceChannel2: VoiceChannel | null = null;
  private matchMessage: Message | null = null;
  private playerService: PlayerService;
  private readyTimeout: NodeJS.Timeout | null = null;
  private voteTimeout: NodeJS.Timeout | null = null;

  private static readonly READY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private static readonly VOTE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

  constructor(client: Client, guild: Guild, match: IMatch) {
    this.client = client;
    this.guild = guild;
    this.match = match;
    this.playerService = PlayerService.getInstance();
  }

  async initialize(): Promise<void> {
    await this.saveMatch();
    await this.createMatchChannel();
    await this.createVoiceChannels();
    await this.setupMatchMessage();
    this.setupInteractionHandlers();
    this.match.state = MatchState.CREATED;
    await this.updateMatch();
    await this.startReadyPhase();
  }

  private async saveMatch(): Promise<void> {
    try {
      const matchDoc = new Match({
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
    } catch (error) {
      console.error('Error saving match:', error);
      throw error;
    }
  }

  private async updateMatch(): Promise<void> {
    try {
      await Match.updateOne({ matchId: this.match.id }, {
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
    } catch (error) {
      console.error('Error updating match:', error);
    }
  }

  private async createMatchChannel(): Promise<void> {
    try {
      const channelName = `match-${this.match.id.slice(0, 8)}`;

      this.channel = await this.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: this.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: this.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
          },
          ...this.match.players.map(playerId => ({
            id: playerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          }))
        ]
      });

      this.match.discordChannelId = this.channel.id;
      console.log(`Created match channel: ${channelName}`);
    } catch (error) {
      console.error('Error creating match channel:', error);
      throw error;
    }
  }

  private async createVoiceChannels(): Promise<void> {
    try {
      const baseChannelName = `Match ${this.match.id.slice(0, 8)}`;

      this.voiceChannel1 = await this.guild.channels.create({
        name: `${baseChannelName} - Team 1`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: this.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: this.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels]
          },
          ...this.match.teams.team1.map(playerId => ({
            id: playerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          }))
        ]
      });

      this.voiceChannel2 = await this.guild.channels.create({
        name: `${baseChannelName} - Team 2`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: this.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: this.client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels]
          },
          ...this.match.teams.team2.map(playerId => ({
            id: playerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          }))
        ]
      });

      this.match.discordVoiceChannel1Id = this.voiceChannel1.id;
      this.match.discordVoiceChannel2Id = this.voiceChannel2.id;

      console.log(`Created voice channels for match ${this.match.id}`);
    } catch (error) {
      console.error('Error creating voice channels:', error);
      throw error;
    }
  }

  private async setupMatchMessage(): Promise<void> {
    if (!this.channel) return;

    const embed = this.createMatchEmbed();
    const row = this.createMatchButtons();

    try {
      this.matchMessage = await this.channel.send({
        content: `Match found! <@${this.match.players.join('> <@')}>`,
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error('Error setting up match message:', error);
    }
  }

  private createMatchEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`Match ${this.match.id.slice(0, 8)}`)
      .setDescription(`Map: **${this.match.map}**`)
      .setColor(0x0099FF)
      .setTimestamp();

    if (this.match.state === MatchState.READY_UP) {
      embed.addFields(
        { name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true },
        { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true },
        { name: 'Ready Players', value: `${this.match.readyPlayers.length}/${this.match.players.length}`, inline: true }
      );
    } else if (this.match.state === MatchState.IN_PROGRESS) {
      const team1Votes = this.match.votes.team1.length;
      const team2Votes = this.match.votes.team2.length;
      const cancelVotes = this.match.votes.cancel.length;

      embed.addFields(
        { name: 'Team 1', value: this.match.teams.team1.map(id => `<@${id}>`).join('\n'), inline: true },
        { name: 'Team 2', value: this.match.teams.team2.map(id => `<@${id}>`).join('\n'), inline: true },
        { name: 'Votes', value: `Team 1: ${team1Votes}\nTeam 2: ${team2Votes}\nCancel: ${cancelVotes}`, inline: true }
      );
    }

    return embed;
  }

  private createMatchButtons(): ActionRowBuilder<ButtonBuilder> {
    if (this.match.state === MatchState.READY_UP) {
      return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ready_${this.match.id}`)
            .setLabel('Ready Up!')
            .setStyle(ButtonStyle.Success)
        );
    } else if (this.match.state === MatchState.IN_PROGRESS) {
      return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_team1_${this.match.id}`)
            .setLabel('Team 1 Wins')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`vote_team2_${this.match.id}`)
            .setLabel('Team 2 Wins')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`vote_cancel_${this.match.id}`)
            .setLabel('Cancel Match')
            .setStyle(ButtonStyle.Danger)
        );
    }

    return new ActionRowBuilder<ButtonBuilder>();
  }

  private setupInteractionHandlers(): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const { customId, user } = interaction;

      if (customId === `ready_${this.match.id}`) {
        await this.handleReady(interaction);
      } else if (customId === `vote_team1_${this.match.id}`) {
        await this.handleVote(interaction, 'team1');
      } else if (customId === `vote_team2_${this.match.id}`) {
        await this.handleVote(interaction, 'team2');
      } else if (customId === `vote_cancel_${this.match.id}`) {
        await this.handleVote(interaction, 'cancel');
      }
    });
  }

  private async startReadyPhase(): Promise<void> {
    this.match.state = MatchState.READY_UP;
    await this.updateMatch();
    await this.updateMatchMessage();

    this.readyTimeout = setTimeout(async () => {
      await this.cancelMatch('Ready timeout exceeded');
    }, MatchHandler.READY_TIMEOUT);
  }

  private async handleReady(interaction: ButtonInteraction): Promise<void> {
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
      } else {
        await this.updateMatch();
        await this.updateMatchMessage();
      }
    } catch (error) {
      console.error('Error handling ready:', error);
      await interaction.reply({
        content: 'An error occurred while readying up.',
        ephemeral: true
      });
    }
  }

  private async startMatch(): Promise<void> {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }

    this.match.state = MatchState.IN_PROGRESS;
    await this.updateMatch();
    await this.updateMatchMessage();

    if (this.channel) {
      await this.channel.send({
        content: '🎮 **Match started!** Good luck and have fun!',
        embeds: [new EmbedBuilder()
          .setDescription(`Voice channels have been created for your teams.`)
          .setColor(0x00FF00)]
      });
    }

    this.voteTimeout = setTimeout(async () => {
      await this.cancelMatch('Vote timeout exceeded');
    }, MatchHandler.VOTE_TIMEOUT);
  }

  private async handleVote(interaction: ButtonInteraction, voteType: 'team1' | 'team2' | 'cancel'): Promise<void> {
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
    } catch (error) {
      console.error('Error handling vote:', error);
      await interaction.reply({
        content: 'An error occurred while voting.',
        ephemeral: true
      });
    }
  }

  private async checkVoteResults(): Promise<void> {
    const totalPlayers = this.match.players.length;
    const majority = Math.ceil(totalPlayers / 2);

    const team1Votes = this.match.votes.team1.length;
    const team2Votes = this.match.votes.team2.length;
    const cancelVotes = this.match.votes.cancel.length;

    if (cancelVotes >= majority) {
      await this.cancelMatch('Match cancelled by player vote');
    } else if (team1Votes >= majority) {
      await this.completeMatch(1);
    } else if (team2Votes >= majority) {
      await this.completeMatch(2);
    } else {
      await this.updateMatch();
      await this.updateMatchMessage();
    }
  }

  private async completeMatch(winningTeam: 1 | 2): Promise<void> {
    if (this.voteTimeout) {
      clearTimeout(this.voteTimeout);
      this.voteTimeout = null;
    }

    this.match.state = MatchState.COMPLETED;
    await this.updateMatch();

    const matchResult = new MatchResult({
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
    } catch (error) {
      console.error('Error saving match result:', error);
    }

    if (this.channel) {
      await this.channel.send({
        content: `🏆 **Match completed!** Team ${winningTeam} wins!`,
        embeds: [new EmbedBuilder()
          .setDescription('GG! The match will be closed in 30 seconds.')
          .setColor(0xFFD700)]
      });
    }

    setTimeout(async () => {
      await this.closeMatch();
    }, 30000);
  }

  private async cancelMatch(reason: string): Promise<void> {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    if (this.voteTimeout) {
      clearTimeout(this.voteTimeout);
      this.voteTimeout = null;
    }

    this.match.state = MatchState.CANCELLED;
    await this.updateMatch();

    for (const playerId of this.match.players) {
      await this.playerService.setPlayerMatch(playerId, undefined);
    }

    if (this.channel) {
      await this.channel.send({
        content: `❌ **Match cancelled:** ${reason}`,
        embeds: [new EmbedBuilder()
          .setDescription('You can now join queues again. The match will be closed in 10 seconds.')
          .setColor(0xFF0000)]
      });
    }

    console.log(`Match ${this.match.id} cancelled: ${reason}`);

    setTimeout(async () => {
      await this.closeMatch();
    }, 10000);
  }

  private async closeMatch(): Promise<void> {
    this.match.state = MatchState.CLOSED;
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
    } catch (error) {
      console.error('Error deleting match channels:', error);
    }
  }

  private async updateMatchMessage(): Promise<void> {
    if (!this.matchMessage) return;

    const embed = this.createMatchEmbed();
    const row = this.createMatchButtons();

    try {
      await this.matchMessage.edit({
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error('Error updating match message:', error);
    }
  }

  getMatch(): IMatch {
    return this.match;
  }

  getId(): string {
    return this.match.id;
  }

  getState(): MatchState {
    return this.match.state;
  }

  async forceCancel(reason: string = 'Force cancelled by administrator'): Promise<void> {
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
    this.match.state = MatchState.CANCELLED;
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
      } catch (error) {
        console.error('Error sending force cancel message:', error);
      }
    }

    // Mark as closed
    this.match.state = MatchState.CLOSED;
    await this.updateMatch();
  }

  async forceDelete(): Promise<void> {
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
    } catch (error) {
      console.error('Error force deleting match channels:', error);
    }
  }
}