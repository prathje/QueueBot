import { Message, MessageEditOptions } from 'discord.js';

export class MessageUpdater {
  private message: Message;
  private pendingUpdate: MessageEditOptions | null = null;
  private updateTimeout: NodeJS.Timeout | null = null;
  private lastUpdateTime: number;
  private readonly delay: number;

  constructor(message: Message, delay: number = 750) {
    this.message = message;
    this.delay = delay;
    this.lastUpdateTime = Date.now();
  }

  public update(messageOptions: MessageEditOptions): void {
    this.pendingUpdate = messageOptions;

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    const timeSinceLastUpdate = Date.now() - this.lastUpdateTime;
    const remainingDelay = Math.max(0, this.delay - timeSinceLastUpdate);

    this.updateTimeout = setTimeout(() => {
      this.executeUpdate();
    }, remainingDelay);
  }

  private async executeUpdate(): Promise<void> {
    if (!this.pendingUpdate) return;

    const updateOptions = this.pendingUpdate;
    this.pendingUpdate = null; // prevent re-entrancy
    this.updateTimeout = null;

    try {
      await this.message.edit(updateOptions);
      this.lastUpdateTime = Date.now();
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  }

  public destroy(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    this.pendingUpdate = null;
  }

  public async forceUpdate(): Promise<void> {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    await this.executeUpdate();
  }
}
