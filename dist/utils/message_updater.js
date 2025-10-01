"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageUpdater = void 0;
class MessageUpdater {
    constructor(message, delay = 1000) {
        this.pendingUpdate = null;
        this.updateTimeout = null;
        this.message = message;
        this.delay = delay;
        this.lastUpdateTime = Date.now();
    }
    update(messageOptions) {
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
    async executeUpdate() {
        if (!this.pendingUpdate)
            return;
        const updateOptions = this.pendingUpdate;
        this.pendingUpdate = null;
        this.updateTimeout = null;
        try {
            await this.message.edit(updateOptions);
            this.lastUpdateTime = Date.now();
        }
        catch (error) {
            console.error('Failed to update message:', error);
        }
    }
    destroy() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        this.pendingUpdate = null;
    }
    async forceUpdate() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        await this.executeUpdate();
    }
}
exports.MessageUpdater = MessageUpdater;
//# sourceMappingURL=message_updater.js.map