import { REST, Routes } from 'discord.js';
import { commands } from './index';
import { config } from '../config/environment';

export async function deployCommands(applicationId: string): Promise<void> {
  const rest = new REST().setToken(config.discord.token);

  try {
    console.log('Started refreshing application (/) commands.');

    const commandData = commands.map(command => command.toJSON());

    await rest.put(
      Routes.applicationGuildCommands(applicationId, config.discord.guildId),
      { body: commandData }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
}