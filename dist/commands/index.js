"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
const discord_js_1 = require("discord.js");
// Simple array of command data for deployment
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName('queue_disable')
        .setDescription('Disable this queue (Admin only)')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    new discord_js_1.SlashCommandBuilder()
        .setName('queue_enable')
        .setDescription('Enable this queue (Admin only)')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    new discord_js_1.SlashCommandBuilder()
        .setName('queue_set_algorithm')
        .setDescription('Set the queue matchmaking algorithm (Admin only)')
        .addStringOption((option) => option
        .setName('algorithm')
        .setDescription('The matchmaking algorithm to use')
        .setRequired(true)
        .addChoices({ name: 'Random Teams', value: 'random teams' }, { name: 'Fair Teams', value: 'fair teams' }))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    new discord_js_1.SlashCommandBuilder()
        .setName('queue_map_add')
        .setDescription('Add a map to the queue map pool (Admin only)')
        .addStringOption((option) => option.setName('map').setDescription('The map name to add').setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
    new discord_js_1.SlashCommandBuilder()
        .setName('queue_map_remove')
        .setDescription('Remove a map from the queue map pool (Admin only)')
        .addStringOption((option) => option.setName('map').setDescription('The map name to remove').setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator),
];
//# sourceMappingURL=index.js.map