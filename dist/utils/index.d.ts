/**
 * Utility functions for the Teeworlds League Queue Bot
 */
/**
 * Shuffles an array in place and returns it.
 * Uses Fisher-Yates shuffle algorithm for uniform distribution.
 * @param array The array to shuffle (modified in place)
 * @returns The shuffled array
 */
export declare function shuffle<T>(array: T[]): T[];
/**
 * Creates a shuffled copy of an array without modifying the original.
 * @param array The array to shuffle
 * @returns A new shuffled array
 */
export declare function shuffled<T>(array: T[]): T[];
/**
 * Selects a random element from an array.
 * @param array The array to select from
 * @returns A random element from the array
 */
export declare function randomElement<T>(array: T[]): T;
//# sourceMappingURL=index.d.ts.map