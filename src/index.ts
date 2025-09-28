import { Client, GatewayIntentBits, Guild } from 'discord.js';
import { config, validateEnvironment } from './config/environment';
import { connectToDatabase } from './config/database';
import { Gamemode } from './services/gamemode';
import { StartupResetService } from './services/startup_reset';
import { Mutex } from './utils/mutex';
import { GamemodeConfig } from './types';

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

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', async (client) => {
      console.log(`Bot logged in as ${client.user.tag}!`);
      await this.initializeBot();
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
            mapPool: ['ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5'],
            playerCount: 4,
            matchmakingAlgorithm: 'random teams'
          },
          {
            id: 'gctf_3v3',
            displayName: 'gCTF 3v3',
            mapPool: ['ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5'],
            playerCount: 6,
            matchmakingAlgorithm: 'random teams'
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
            mapPool: ['ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5'],
            playerCount: 4,
            matchmakingAlgorithm: 'random teams'
          },
          {
            id: 'ctf_3v3',
            displayName: 'CTF 3v3',
            mapPool: ['ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5'],
            playerCount: 6,
            matchmakingAlgorithm: 'random teams'
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
            mapPool: ['ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5'],
            playerCount: 2,
            matchmakingAlgorithm: 'random teams'
          }
        ]
      },
      {
        id: 'test',
        displayName: 'Test',
        queues: [
          {
            id: 'test',
            displayName: 'Test',
            mapPool: ['ctf_test'],
            playerCount: 1,
            matchmakingAlgorithm: 'random teams'
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