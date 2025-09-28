export declare class Mutex {
    private resolveCurrent;
    private current;
    acquire(): Promise<void>;
    release(): void;
    runExclusive<T>(callback: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=mutex.d.ts.map