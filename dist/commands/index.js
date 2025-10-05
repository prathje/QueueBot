"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueMapRemoveCommand = exports.queueMapAddCommand = exports.queueSetAlgorithmCommand = exports.queueEnableCommand = exports.queueDisableCommand = exports.commands = void 0;
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
// Queue set algorithm command
exports.queueSetAlgorithmCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue_set_algorithm')
        .setDescription('Set the queue matchmaking algorithm (Admin only)')
        .addStringOption(option => option.setName('algorithm')
        .setDescription('The matchmaking algorithm to use')
        .setRequired(true)
        .addChoices({ name: 'Random Teams', value: 'random teams' }, { name: 'Fair Teams', value: 'fair teams' }))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    execute: async (interaction) => {
        // Implementation will be injected by the queue instance
        await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
    }
};
// Queue map add command
exports.queueMapAddCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue_map_add')
        .setDescription('Add a map to the queue map pool (Admin only)')
        .addStringOption(option => option.setName('map')
        .setDescription('The map name to add')
        .setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    execute: async (interaction) => {
        // Implementation will be injected by the queue instance
        await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
    }
};
// Queue map remove command
exports.queueMapRemoveCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue_map_remove')
        .setDescription('Remove a map from the queue map pool (Admin only)')
        .addStringOption(option => option.setName('map')
        .setDescription('The map name to remove')
        .setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    execute: async (interaction) => {
        // Implementation will be injected by the queue instance
        await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
    }
};
exports.commands.push(exports.queueDisableCommand, exports.queueEnableCommand, exports.queueSetAlgorithmCommand, exports.queueMapAddCommand, exports.queueMapRemoveCommand);
//# sourceMappingURL=index.js.map