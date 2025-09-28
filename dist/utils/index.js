"use strict";
/**
 * Utility functions for the Teeworlds League Queue Bot
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffle = shuffle;
exports.shuffled = shuffled;
exports.randomElement = randomElement;
/**
 * Shuffles an array in place and returns it.
 * Uses Fisher-Yates shuffle algorithm for uniform distribution.
 * @param array The array to shuffle (modified in place)
 * @returns The shuffled array
 */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
/**
 * Creates a shuffled copy of an array without modifying the original.
 * @param array The array to shuffle
 * @returns A new shuffled array
 */
function shuffled(array) {
    return shuffle([...array]);
}
/**
 * Selects a random element from an array.
 * @param array The array to select from
 * @returns A random element from the array
 */
function randomElement(array) {
    if (array.length === 0) {
        throw new Error('Cannot select random element from empty array');
    }
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}
//# sourceMappingURL=index.js.map