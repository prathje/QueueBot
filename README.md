# Queue Bot

A Discord bot that integrates matchmaking queues into Discord channels written in TypeScript.
This project runs on Node.js and uses MongoDB for persistent storage. The discord library used is [discord.js](https://discord.js.org/).

## Features

- **Player Management**: Tracks players using Discord IDs with queue and match states
- **Gamemode Support**: Multiple gamemodes with dedicated Discord categories
- **Queue System**: Interactive Discord channels with join/leave buttons
- **Matchmaking**: Automatic match creation when enough players join
- **Match Flow**: Complete match lifecycle from ready-up to result voting
- **Voice Channels**: Automatic team voice channel creation
- **Startup Reset**: Automatically cancels all matches and clears player states on restart
- **Database**: MongoDB integration for persistent state management

## Setup

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure your Discord bot token and server ID in `.env`:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   GUILD_ID=your_discord_server_id_here
   MONGODB_URI=mongodb://localhost:27017/teeworlds-league
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Start the bot:
   ```bash
   npm start
   ```

For development:
```bash
npm run dev
```

## Architecture

- **index.ts**: Main bot initialization and gamemode setup
- **gamemode.ts**: Discord category and queue management
- **queue.ts**: Channel creation and player interaction handling
- **match_handler.ts**: Complete match flow management
- **players.ts**: Player state management service
- **matchmaking.ts**: Match creation algorithms

## Discord Bot Permissions

The bot requires the following permissions:
- Manage Channels
- Send Messages
- View Channels
- Connect (Voice)
- Move Members (Voice)
- Use Slash Commands