"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommands = deployCommands;
const discord_js_1 = require("discord.js");
const index_1 = require("./index");
const environment_1 = require("../config/environment");
async function deployCommands(applicationId) {
    const rest = new discord_js_1.REST().setToken(environment_1.config.discord.token);
    try {
        console.log('Started refreshing application (/) commands.');
        const commandData = index_1.commands.map((command) => command.toJSON());
        await rest.put(discord_js_1.Routes.applicationGuildCommands(applicationId, environment_1.config.discord.guildId), { body: commandData });
        console.log('Successfully reloaded application (/) commands.');
    }
    catch (error) {
        console.error('Error deploying commands:', error);
    }
}
//# sourceMappingURL=deploy.js.map