import { Message, MessageEditOptions } from 'discord.js';
export declare class MessageUpdater {
    private message;
    private pendingUpdate;
    private updateTimeout;
    private lastUpdateTime;
    private readonly delay;
    constructor(message: Message, delay?: number);
    update(messageOptions: MessageEditOptions): void;
    private executeUpdate;
    destroy(): void;
    forceUpdate(): Promise<void>;
}
//# sourceMappingURL=message_updater.d.ts.map