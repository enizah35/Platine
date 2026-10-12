import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../src/discord/format.js';
import en from '../../src/i18n/locales/en/core.json' with { type: 'json' };
import fr from '../../src/i18n/locales/fr/core.json' with { type: 'json' };
import { t } from '../../src/i18n/t.js';

describe('i18n', () => {
  it('FR et EN ont exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('interpole et laisse intacts les paramètres absents', () => {
    expect(t('error.NOT_FOUND', { query: 'abc' })).toBe('Rien trouvé pour « abc ».');
    expect(t('error.NOT_FOUND', { query: 'abc' }, 'en')).toBe('Nothing found for "abc".');
    expect(t('error.NOT_FOUND')).toContain('{query}');
  });

  it('formate les durées', () => {
    expect(formatDuration(320_357)).toBe('5:20');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
