import { describe, it, expect } from 'vitest';

describe('DataLoader', () => {
  it('module exports loadJSON', async () => {
    const mod = await import('../../src/data/DataLoader.js');
    expect(typeof mod.loadJSON).toBe('function');
  });
});
