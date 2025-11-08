"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const environment_1 = require("./config/environment");
const database_1 = require("./config/database");
const gamemode_1 = require("./services/gamemode");
const startup_reset_1 = require("./services/startup_reset");
const mutex_1 = require("./utils/mutex");
const deploy_1 = require("./commands/deploy");
const matchmaking_1 = require("./services/matchmaking");
class QueueBot {
    constructor() {
        this.guild = null;
        this.gamemodes = new Map();
        this.globalMatchmakingMutex = new mutex_1.Mutex();
        this.client = new discord_js_1.Client({
            intents: [
                discord_js_1.GatewayIntentBits.Guilds,
                discord_js_1.GatewayIntentBits.GuildMessages,
                discord_js_1.GatewayIntentBits.GuildVoiceStates,
                discord_js_1.GatewayIntentBits.MessageContent,
            ],
        });
        // Increase max listeners to prevent memory leak warnings
        this.client.setMaxListeners(0);
        setInterval(() => {
            const listenerCount = this.client.listenerCount('interactionCreate');
            console.log(`Current interactionCreate listeners: ${listenerCount}`);
        }, 60 * 60 * 1000); // Log every hour
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.client.once('ready', async (client) => {
            console.log(`Bot logged in as ${client.user.tag}!`);
            await this.initializeBot();
        });
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand())
                return;
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
    async initializeBot() {
        try {
            this.guild = await this.client.guilds.fetch(environment_1.config.discord.guildId);
            if (!this.guild) {
                throw new Error(`Guild with ID ${environment_1.config.discord.guildId} not found`);
            }
            console.log(`Connected to guild: ${this.guild.name}`);
            // Deploy slash commands using the client's application ID
            if (!this.client.application?.id) {
                throw new Error('Could not get application ID from client');
            }
            await (0, deploy_1.deployCommands)(this.client.application.id);
            // Reset all matches and players on startup
            await startup_reset_1.StartupResetService.performStartupReset(this.guild);
            await this.initializeGamemodes();
        }
        catch (error) {
            console.error('Error initializing bot:', error);
            process.exit(1);
        }
    }
    async initializeGamemodes() {
        const gamemodeConfigs = [
            {
                id: 'gctf',
                pingRole: 'gctf-lfg',
                displayName: 'gCTF - Grenade Capture the Flag',
                queues: [
                    {
                        id: 'gctf_2v2',
                        displayName: 'gCTF 2v2',
                        mapPool: [
                            'ctf3',
                            'ctf4_old',
                            'ctf_5_limited',
                            'ctf_tantum',
                            'ctf_mine',
                            'ctf_planet',
                            'ctf_ambiance',
                        ],
                        playerCount: 4,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                    {
                        id: 'gctf_3v3',
                        displayName: 'gCTF 3v3',
                        mapPool: [
                            'ctf2',
                            'ctf_5_limited',
                            'ctf_duskwood',
                            'ctf_mars',
                            'ctf_moon',
                            'ctf_chryochasm',
                            'ctf_exeliar',
                            'ctf_gartum',
                        ],
                        playerCount: 6,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                ],
            },
            {
                id: 'ctf',
                pingRole: 'ctf-lfg',
                displayName: 'Vanilla CTF',
                queues: [
                    {
                        id: 'ctf_2v2',
                        displayName: 'CTF 2v2',
                        mapPool: ['ctf1_left', 'ctf_aurochs'],
                        playerCount: 4,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                    {
                        id: 'ctf_3v3',
                        displayName: 'CTF 3v3',
                        mapPool: ['ctf3'],
                        playerCount: 6,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                    {
                        id: 'ctf_4v4',
                        displayName: 'CTF 4v4',
                        mapPool: ['ctf_infiltrate'],
                        playerCount: 8,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                    {
                        id: 'ctf_5v5',
                        displayName: 'CTF 5v5',
                        mapPool: ['ctf2'],
                        playerCount: 10,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                ],
            },
            {
                id: 'dm',
                pingRole: 'dm-lfg',
                displayName: 'Vanilla DM',
                queues: [
                    {
                        id: 'dm_1v1',
                        displayName: 'DM 1v1',
                        mapPool: ['dm1'],
                        playerCount: 2,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                ],
            },
            {
                id: 'ictf',
                pingRole: 'ictf-lfg',
                displayName: 'iCTF - Instagib CTF',
                queues: [
                    {
                        id: 'ictf_1v1',
                        displayName: 'iCTF 1v1',
                        mapPool: ['ctf4_old', 'desertbattle', 'mini4old', 'desertcamp', 'ctf_nessness'],
                        playerCount: 2,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.RANDOM_TEAMS
                    },
                    {
                        id: 'ictf_2v2',
                        displayName: 'iCTF 2v2',
                        mapPool: ['ctf4_old'],
                        playerCount: 4,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS
                    }
                ]
            },
            {
                id: 'test',
                pingRole: 'test-lfg',
                displayName: 'Test',
                queues: [
                    {
                        id: 'test-1',
                        displayName: 'Test 1 Player',
                        mapPool: ['ctf_test'],
                        playerCount: 1,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                    {
                        id: 'test-2',
                        displayName: 'Test 2 Players',
                        mapPool: ['ctf_test'],
                        playerCount: 2,
                        matchmakingAlgorithm: matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS,
                    },
                ],
            },
        ];
        for (const gamemodeConfig of gamemodeConfigs) {
            try {
                const gamemode = new gamemode_1.Gamemode(this.client, this.guild, gamemodeConfig, this.globalMatchmakingMutex);
                await gamemode.initialize();
                this.gamemodes.set(gamemodeConfig.id, gamemode);
                console.log(`Initialized gamemode: ${gamemodeConfig.displayName}`);
            }
            catch (error) {
                console.error(`Error initializing gamemode ${gamemodeConfig.id}:`, error);
            }
        }
        console.log('All gamemodes initialized successfully!');
    }
    async handleSlashCommand(interaction) {
        try {
            const { commandName, channelId } = interaction;
            if (commandName === 'queue_disable' ||
                commandName === 'queue_enable' ||
                commandName === 'queue_set_algorithm' ||
                commandName === 'queue_map_add' ||
                commandName === 'queue_map_remove') {
                // Find the queue that matches this channel
                let targetQueue = null;
                for (const gamemode of this.gamemodes.values()) {
                    const queue = gamemode.getQueueByChannelId(channelId);
                    if (queue) {
                        targetQueue = queue;
                        break;
                    }
                }
                if (!targetQueue) {
                    await interaction.reply({
                        content: 'This command can only be used in a queue channel.',
                        ephemeral: true,
                    });
                    return;
                }
                if (commandName === 'queue_disable') {
                    await targetQueue.disable();
                    await interaction.reply({
                        content: `Queue **${targetQueue.getDisplayName()}** has been disabled. All players have been removed.`,
                        ephemeral: true,
                    });
                }
                else if (commandName === 'queue_enable') {
                    await targetQueue.enable();
                    await interaction.reply({
                        content: `Queue **${targetQueue.getDisplayName()}** has been enabled.`,
                        ephemeral: true,
                    });
                }
                else if (commandName === 'queue_set_algorithm') {
                    const algorithmChoice = interaction.options.getString('algorithm', true);
                    const algorithm = algorithmChoice === 'random teams' ? matchmaking_1.MatchmakingAlgorithm.RANDOM_TEAMS : matchmaking_1.MatchmakingAlgorithm.FAIR_TEAMS;
                    const displayName = algorithmChoice === 'random teams' ? 'Random Teams' : 'Fair Teams';
                    await targetQueue.setAlgorithm(algorithm);
                    await interaction.reply({
                        content: `Queue **${targetQueue.getDisplayName()}** algorithm set to **${displayName}**.`,
                        ephemeral: true,
                    });
                }
                else if (commandName === 'queue_map_add') {
                    const mapName = interaction.options.getString('map', true);
                    const success = await targetQueue.addMap(mapName);
                    if (success) {
                        await interaction.reply({
                            content: `Map **${mapName}** added to queue **${targetQueue.getDisplayName()}**.`,
                            ephemeral: true,
                        });
                    }
                    else {
                        await interaction.reply({
                            content: `Map **${mapName}** is already in the map pool for queue **${targetQueue.getDisplayName()}**.`,
                            ephemeral: true,
                        });
                    }
                }
                else if (commandName === 'queue_map_remove') {
                    const mapName = interaction.options.getString('map', true);
                    const success = await targetQueue.removeMap(mapName);
                    if (success) {
                        await interaction.reply({
                            content: `Map **${mapName}** removed from queue **${targetQueue.getDisplayName()}**.`,
                            ephemeral: true,
                        });
                    }
                    else {
                        await interaction.reply({
                            content: `Map **${mapName}** could not be removed **${targetQueue.getDisplayName()}**.`,
                            ephemeral: true,
                        });
                    }
                }
            }
        }
        catch (error) {
            console.error('Error handling slash command:', error);
            await interaction.reply({
                content: 'An error occurred while executing the command.',
                ephemeral: true,
            });
        }
    }
    async start() {
        try {
            (0, environment_1.validateEnvironment)();
            await (0, database_1.connectToDatabase)();
            await this.client.login(environment_1.config.discord.token);
        }
        catch (error) {
            console.error('Error starting bot:', error);
            process.exit(1);
        }
    }
    async shutdown() {
        try {
            console.log('Shutting down bot...');
            // Shutdown all gamemodes and queues (this will cancel active matches)
            console.log('Shutting down queues and cancelling active matches...');
            for (const gamemode of this.gamemodes.values()) {
                await gamemode.shutdown();
            }
            // Give a moment for the queue messages to be updated
            await new Promise((resolve) => setTimeout(resolve, 1000));
            this.client.destroy();
            console.log('Bot shutdown complete');
            process.exit(0);
        }
        catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}
const bot = new QueueBot();
bot.start().catch(console.error);
//# sourceMappingURL=index.js.map