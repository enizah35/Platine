import { describe, expect, it } from 'vitest';
import { DOMAIN_VERSION } from '../../src/domain/index.js';

describe('socle', () => {
  it('charge le domaine', () => {
    expect(DOMAIN_VERSION).toBe(0);
  });
});
