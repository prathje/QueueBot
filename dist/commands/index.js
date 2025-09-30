"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueEnableCommand = exports.queueDisableCommand = exports.commands = void 0;
const discord_js_1 = require("discord.js");
exports.commands = [];
// Queue disable command
exports.queueDisableCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue_disable')
        .setDescription('Disable this queue (Admin only)')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    execute: async (interaction) => {
        // Implementation will be injected by the queue instance
        await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
    }
};
// Queue enable command
exports.queueEnableCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue_enable')
        .setDescription('Enable this queue (Admin only)')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    execute: async (interaction) => {
        // Implementation will be injected by the queue instance
        await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
    }
};
exports.commands.push(exports.queueDisableCommand, exports.queueEnableCommand);
//# sourceMappingURL=index.js.map