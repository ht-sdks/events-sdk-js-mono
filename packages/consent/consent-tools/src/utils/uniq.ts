/**
 * This function removes duplicates from an array
 */
export const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr))
