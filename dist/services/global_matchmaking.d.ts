import { Queue } from './queue';
export declare class GlobalMatchmakingService {
    private static instance;
    private queues;
    private interval;
    private isRunning;
    private static readonly MATCHMAKING_INTERVAL;
    private constructor();
    static getInstance(): GlobalMatchmakingService;
    registerQueue(queue: Queue): void;
    unregisterQueue(queue: Queue): void;
    start(): void;
    stop(): void;
    private processAllQueues;
    getRegisteredQueuesCount(): number;
    isServiceRunning(): boolean;
}
//# sourceMappingURL=global_matchmaking.d.ts.map