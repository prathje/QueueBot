/**
 * Utility functions for the Teeworlds League Queue Bot
 */

/**
 * Shuffles an array in place and returns it.
 * Uses Fisher-Yates shuffle algorithm for uniform distribution.
 * @param array The array to shuffle (modified in place)
 * @returns The shuffled array
 */
export function shuffle<T>(array: T[]): T[] {
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
export function shuffled<T>(array: T[]): T[] {
  return shuffle([...array]);
}

/**
 * Selects a random element from an array.
 * @param array The array to select from
 * @returns A random element from the array
 */
export function randomElement<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot select random element from empty array');
  }
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}