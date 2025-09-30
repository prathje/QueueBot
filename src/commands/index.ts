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

commands.push(queueDisableCommand, queueEnableCommand);