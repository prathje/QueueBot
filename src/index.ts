import { Client, GatewayIntentBits, Guild, ChatInputCommandInteraction } from 'discord.js';
import { config, validateEnvironment } from './config/environment';
import { connectToDatabase } from './config/database';
import { Gamemode } from './services/gamemode';
import { StartupResetService } from './services/startup_reset';
import { Mutex } from './utils/mutex';
import { GamemodeConfig } from './types';
import { deployCommands } from './commands/deploy';
import { MatchmakingAlgorithm } from './services/matchmaking';

class TeeWorldsLeagueBot {
  private client: Client;
  private guild: Guild | null = null;
  private gamemodes: Map<string, Gamemode> = new Map();
  private globalMatchmakingMutex: Mutex = new Mutex();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
      ]
    });

    // Increase max listeners to prevent memory leak warnings
    this.client.setMaxListeners(0);

    setInterval(() => {
      const listenerCount = this.client.listenerCount('interactionCreate');
      console.log(`Current interactionCreate listeners: ${listenerCount}`);
    }, 60*60*1000); // Log every hour

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', async (client) => {
      console.log(`Bot logged in as ${client.user.tag}!`);
      await this.initializeBot();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.handleSlashCommand(interaction);
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await this.shutdown();
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await this.shutdown();
    });
  }

  private async initializeBot(): Promise<void> {
    try {
      this.guild = await this.client.guilds.fetch(config.discord.guildId);
      if (!this.guild) {
        throw new Error(`Guild with ID ${config.discord.guildId} not found`);
      }

      console.log(`Connected to guild: ${this.guild.name}`);

      // Deploy slash commands using the client's application ID
      if (!this.client.application?.id) {
        throw new Error('Could not get application ID from client');
      }
      await deployCommands(this.client.application.id);

      // Reset all matches and players on startup
      await StartupResetService.performStartupReset(this.guild);

      await this.initializeGamemodes();
    } catch (error) {
      console.error('Error initializing bot:', error);
      process.exit(1);
    }
  }

  private async initializeGamemodes(): Promise<void> {
    const gamemodeConfigs: GamemodeConfig[] = [
      {
        id: 'gctf',
        displayName: 'gCTF - Grenade Capture the Flag',
        queues: [
          {
            id: 'gctf_2v2',
            displayName: 'gCTF 2v2',
            mapPool: ['ctf3', 'ctf4_old', 'ctf_cryochasm', 'ctf_5_limited', 'ctf_duskwood', 'ctf_tantum', 'ctf_mine', 'ctf_planet', 'ctf_ambiance'],
            playerCount: 4,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          },
          {
            id: 'gctf_3v3',
            displayName: 'gCTF 3v3',
            mapPool: ['ctf2', 'ctf_5_limited', 'ctf_duskwood', 'ctf_mars', 'ctf_moon', 'ctf_chryochasm', 'ctf_exeliar', 'ctf_gartum'],
            playerCount: 6,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          }
        ]
      },
      {
        id: 'ctf',
        displayName: 'Vanilla CTF',
        queues: [
          {
            id: 'ctf_2v2',
            displayName: 'CTF 2v2',
            mapPool: ['ctf1_left', 'ctf_aurochs'],
            playerCount: 4,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          },
          {
            id: 'ctf_3v3',
            displayName: 'CTF 3v3',
            mapPool: ['ctf3'],
            playerCount: 6,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          },
          {
            id: 'ctf_4v4',
            displayName: 'CTF 4v4',
            mapPool: ['ctf_infiltrate'],
            playerCount: 8,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          },
          {
            id: 'ctf_5v5',
            displayName: 'CTF 5v5',
            mapPool: ['ctf2'],
            playerCount: 10,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          }
        ]
      },
      {
        id: 'dm',
        displayName: 'Vanilla DM',
        queues: [
          {
            id: 'dm_1v1',
            displayName: 'DM 1v1',
            mapPool: ['dm1'],
            playerCount: 2,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          }
        ]
      },
      {
        id: 'test',
        displayName: 'Test',
        queues: [
          {
            id: 'test-1',
            displayName: 'Test 1 Player',
            mapPool: ['ctf_test'],
            playerCount: 1,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          },
          {
            id: 'test-2',
            displayName: 'Test 2 Players',
            mapPool: ['ctf_test'],
            playerCount: 2,
            matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS
          }
        ]
      }
    ];

    for (const gamemodeConfig of gamemodeConfigs) {
      try {
        const gamemode = new Gamemode(this.client, this.guild!, gamemodeConfig, this.globalMatchmakingMutex);
        await gamemode.initialize();
        this.gamemodes.set(gamemodeConfig.id, gamemode);
        console.log(`Initialized gamemode: ${gamemodeConfig.displayName}`);
      } catch (error) {
        console.error(`Error initializing gamemode ${gamemodeConfig.id}:`, error);
      }
    }

    console.log('All gamemodes initialized successfully!');
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const { commandName, channelId } = interaction;

      if (commandName === 'queue_disable' || commandName === 'queue_enable') {
        // Find the queue that matches this channel
        let targetQueue = null;
        for (const gamemode of this.gamemodes.values()) {
          const queue = gamemode.getQueueByChannelId(channelId!);
          if (queue) {
            targetQueue = queue;
            break;
          }
        }

        if (!targetQueue) {
          await interaction.reply({
            content: 'This command can only be used in a queue channel.',
            ephemeral: true
          });
          return;
        }

        if (commandName === 'queue_disable') {
          await targetQueue.disable();
          await interaction.reply({
            content: `Queue **${targetQueue.getDisplayName()}** has been disabled. All players have been removed.`,
            ephemeral: true
          });
        } else {
          await targetQueue.enable();
          await interaction.reply({
            content: `Queue **${targetQueue.getDisplayName()}** has been enabled.`,
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error('Error handling slash command:', error);
      await interaction.reply({
        content: 'An error occurred while executing the command.',
        ephemeral: true
      });
    }
  }

  async start(): Promise<void> {
    try {
      validateEnvironment();
      await connectToDatabase();
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('Error starting bot:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    try {
      console.log('Shutting down bot...');

      // Shutdown all gamemodes and queues (this will cancel active matches)
      console.log('Shutting down queues and cancelling active matches...');
      for (const gamemode of this.gamemodes.values()) {
        await gamemode.shutdown();
      }

      // Give a moment for the queue messages to be updated
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.client.destroy();
      console.log('Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

}

const bot = new TeeWorldsLeagueBot();
bot.start().catch(console.error);