/*
 * Minimal ambient type declarations for the experimental `node:sea` module.
 */

declare module 'node:sea' {
  export function isSea(): boolean;
  export function getAsset(key: string, encoding?: string): any;
} 