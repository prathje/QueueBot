import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
export interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
export declare const commands: Command[];
export declare const queueDisableCommand: Command;
export declare const queueEnableCommand: Command;
//# sourceMappingURL=index.d.ts.map