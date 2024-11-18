import { describe, it, expect } from 'vitest';
import { CLI } from '../src/cli/index';

describe('CLI', () => {
  it('should create a new CLI instance', () => {
    const cli = new CLI({ name: 'test', version: '1.0.0' });
    expect(cli).toBeDefined();
  });
});
