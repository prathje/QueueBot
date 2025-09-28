"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalMatchmakingService = void 0;
class GlobalMatchmakingService {
    constructor() {
        this.queues = new Set();
        this.interval = null;
        this.isRunning = false;
    }
    static getInstance() {
        if (!GlobalMatchmakingService.instance) {
            GlobalMatchmakingService.instance = new GlobalMatchmakingService();
        }
        return GlobalMatchmakingService.instance;
    }
    registerQueue(queue) {
        this.queues.add(queue);
        console.log(`Registered queue ${queue.getDisplayName()} with global matchmaker`);
    }
    unregisterQueue(queue) {
        this.queues.delete(queue);
        console.log(`Unregistered queue ${queue.getDisplayName()} from global matchmaker`);
    }
    start() {
        if (this.isRunning) {
            console.log('Global matchmaking service is already running');
            return;
        }
        this.isRunning = true;
        this.interval = setInterval(async () => {
            await this.processAllQueues();
        }, GlobalMatchmakingService.MATCHMAKING_INTERVAL);
        console.log(`Global matchmaking service started (interval: ${GlobalMatchmakingService.MATCHMAKING_INTERVAL}ms)`);
    }
    stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('Global matchmaking service stopped');
    }
    async processAllQueues() {
        if (this.queues.size === 0) {
            return;
        }
        // Process all queues concurrently to avoid blocking
        const matchmakingPromises = Array.from(this.queues).map(async (queue) => {
            try {
                await queue.checkForMatch();
            }
            catch (error) {
                console.error(`Error processing matchmaking for queue ${queue.getDisplayName()}:`, error);
            }
        });
        await Promise.allSettled(matchmakingPromises);
    }
    getRegisteredQueuesCount() {
        return this.queues.size;
    }
    isServiceRunning() {
        return this.isRunning;
    }
}
exports.GlobalMatchmakingService = GlobalMatchmakingService;
GlobalMatchmakingService.MATCHMAKING_INTERVAL = 3000; // 3 seconds
//# sourceMappingURL=global_matchmaking.js.map