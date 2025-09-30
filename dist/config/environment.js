"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateEnvironment = validateEnvironment;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    discord: {
        token: process.env.DISCORD_TOKEN || '',
        guildId: process.env.GUILD_ID || ''
    },
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/teeworlds-league'
    },
    api: {
        resultsWebhookUrl: process.env.RESULTS_WEBHOOK_URL || ''
    }
};
function validateEnvironment() {
    const requiredVars = [
        'DISCORD_TOKEN',
        'GUILD_ID'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        console.error('Missing required environment variables:', missingVars);
        console.error('Please check your .env file');
        process.exit(1);
    }
}
//# sourceMappingURL=environment.js.map