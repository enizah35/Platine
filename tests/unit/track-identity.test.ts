import { describe, expect, it } from 'vitest';
import type { Track } from '../../src/domain/index.js';
import { isSameTrackFuzzy, mergeTrack, normalizeIsrc, normalizeText } from '../../src/domain/index.js';

describe('identité des morceaux', () => {
  it('normalise texte et ISRC', () => {
    expect(normalizeText('  Beyoncé — Crazy in Love (feat. JAY-Z)! ')).toBe(
      'beyonce crazy in love feat jay z',
    );
    expect(normalizeIsrc('us-sm1-03-00001')).toBe('USSM10300001');
    expect(normalizeIsrc('')).toBeNull();
    expect(normalizeIsrc('--')).toBeNull();
    expect(normalizeIsrc(undefined)).toBeNull();
  });

  it('compare artiste principal, titre et durée à ±3 s', () => {
    const a = { title: 'Alors on danse', artists: ['Stromae'], durationMs: 200_000 };
    expect(isSameTrackFuzzy(a, { ...a, title: 'ALORS ON DANSE', durationMs: 203_000 })).toBe(true);
    expect(isSameTrackFuzzy(a, { ...a, durationMs: 203_001 })).toBe(false);
    expect(isSameTrackFuzzy(a, { ...a, artists: ['Autre'] })).toBe(false);
    expect(isSameTrackFuzzy({ ...a, artists: [] }, { ...a, artists: [] })).toBe(true);
  });

  it('mergeTrack complète sans écraser', () => {
    const t: Track = {
      id: '1',
      title: 'A',
      artists: ['B'],
      durationMs: 1,
      genres: [],
      explicit: false,
      externalIds: [],
      album: 'X',
    };
    const m = mergeTrack(t, {
      title: 'Autre',
      artists: ['C'],
      durationMs: 2,
      genres: ['pop'],
      explicit: true,
      album: 'Y',
      isrc: 'aa-bbb-00-00001',
      artworkUrl: 'https://img',
      externalIds: [{ provider: 'deezer', id: '9' }],
    });
    expect(m).toEqual({
      ...t,
      genres: ['pop'],
      isrc: 'AABBB0000001',
      artworkUrl: 'https://img',
      externalIds: [{ provider: 'deezer', id: '9' }],
    });
    expect(t.externalIds).toEqual([]);
  });
});
