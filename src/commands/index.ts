import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [];

// Queue disable command
export const queueDisableCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue_disable')
    .setDescription('Disable this queue (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction: ChatInputCommandInteraction) => {
    // Implementation will be injected by the queue instance
    await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
  }
};

// Queue enable command
export const queueEnableCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue_enable')
    .setDescription('Enable this queue (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction: ChatInputCommandInteraction) => {
    // Implementation will be injected by the queue instance
    await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
  }
};

// Queue set algorithm command
export const queueSetAlgorithmCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue_set_algorithm')
    .setDescription('Set the queue matchmaking algorithm (Admin only)')
    .addStringOption(option =>
      option.setName('algorithm')
        .setDescription('The matchmaking algorithm to use')
        .setRequired(true)
        .addChoices(
          { name: 'Random Teams', value: 'random teams' },
          { name: 'Fair Teams', value: 'fair teams' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction: ChatInputCommandInteraction) => {
    // Implementation will be injected by the queue instance
    await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
  }
};

// Queue map add command
export const queueMapAddCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue_map_add')
    .setDescription('Add a map to the queue map pool (Admin only)')
    .addStringOption(option =>
      option.setName('map')
        .setDescription('The map name to add')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction: ChatInputCommandInteraction) => {
    // Implementation will be injected by the queue instance
    await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
  }
};

// Queue map remove command
export const queueMapRemoveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('queue_map_remove')
    .setDescription('Remove a map from the queue map pool (Admin only)')
    .addStringOption(option =>
      option.setName('map')
        .setDescription('The map name to remove')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction: ChatInputCommandInteraction) => {
    // Implementation will be injected by the queue instance
    await interaction.reply({ content: 'Command not properly initialized', ephemeral: true });
  }
};

commands.push(
  queueDisableCommand,
  queueEnableCommand,
  queueSetAlgorithmCommand,
  queueMapAddCommand,
  queueMapRemoveCommand
);