// Jest setup file for ESM mode
// This file runs after Jest is loaded but before tests run

// Ensure jest globals are available in ESM context
import { jest } from '@jest/globals';

if (typeof globalThis !== 'undefined') {
  globalThis.jest = jest;
}
