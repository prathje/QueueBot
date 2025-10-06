import dotenv from 'dotenv';

dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    guildId: process.env.GUILD_ID || '',
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/queue-bot',
  },
  api: {
    resultsWebhookUrl: process.env.RESULTS_WEBHOOK_URL || '',
  },
};

export function validateEnvironment(): void {
  const requiredVars = ['DISCORD_TOKEN', 'GUILD_ID'];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    console.error('Please check your .env file');
    process.exit(1);
  }
}
