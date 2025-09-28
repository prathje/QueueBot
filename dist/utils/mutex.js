"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mutex = void 0;
class Mutex {
    constructor() {
        this.resolveCurrent = null;
        this.current = null;
    }
    async acquire() {
        while (this.current) {
            await this.current;
        }
        this.current = new Promise(resolve => {
            this.resolveCurrent = resolve;
        });
    }
    release() {
        this.current = null;
        this.resolveCurrent?.();
        this.resolveCurrent = null;
    }
}
exports.Mutex = Mutex;
//# sourceMappingURL=mutex.js.map