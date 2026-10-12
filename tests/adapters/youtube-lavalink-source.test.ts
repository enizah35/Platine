import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LavalinkError,
  type LavalinkLoadResult,
  searchQuery,
  type TrackLoader,
  YoutubeLavalinkSource,
} from '../../src/adapters/audio/youtube-lavalink/index.js';
import { makeCatalogTrack } from '../../src/adapters/fakes/index.js';
import { catalogTrackFromQuery } from '../../src/discord/commands/play.js';

const fixture = (name: string): LavalinkLoadResult =>
  JSON.parse(readFileSync(new URL(`../fixtures/lavalink/${name}.json`, import.meta.url), 'utf8'));

class FixtureLoader implements TrackLoader {
  readonly identifiers: string[] = [];
  constructor(private readonly response: LavalinkLoadResult | undefined) {}
  async load(identifier: string) {
    this.identifiers.push(identifier);
    return this.response;
  }
}

describe('YoutubeLavalinkSource', () => {
  it('cherche « artistes - titre » puis rend les candidats dans l’ordre si la durée est inconnue', async () => {
    const loader = new FixtureLoader(fixture('search-daft-punk'));
    const source = new YoutubeLavalinkSource(loader);
    const out = await source.findCandidates(catalogTrackFromQuery('daft punk one more time'), { limit: 5 });

    expect(loader.identifiers).toEqual(['ytsearch:daft punk one more time']);
    // Le direct (isStream) est écarté.
    expect(out.map((c) => c.ref)).toEqual(['FGBhQbmPwH8', 'A2VpR8HahKc', 'YQAbbkyH9xE']);
    expect(out[0]).toEqual({
      source: 'youtube',
      ref: 'FGBhQbmPwH8',
      engineHandle: 'QAAAFGBhQbmPwH8ENCODED',
      title: 'Daft Punk - One More Time (Official Video)',
      author: 'Daft Punk',
      durationMs: 322_000,
      score: 1,
    });
    expect(out.map((c) => c.score)).toEqual([1, 0.9, 0.8]);
  });

  it('classe par proximité de durée quand elle est connue, et respecte la limite', async () => {
    const source = new YoutubeLavalinkSource(new FixtureLoader(fixture('search-daft-punk')));
    const track = makeCatalogTrack({ title: 'One More Time', artists: ['Daft Punk'], durationMs: 320_000 });
    const out = await source.findCandidates(track, { limit: 2 });
    expect(out.map((c) => c.ref)).toEqual(['A2VpR8HahKc', 'FGBhQbmPwH8']);
    expect(out[0]?.score).toBeGreaterThan(out[1]?.score ?? 1);
    expect(searchQuery(track)).toBe('ytsearch:Daft Punk - One More Time');
  });

  it('rend [] sur une réponse vide ou absente', async () => {
    const t = catalogTrackFromQuery('zzzz');
    expect(
      await new YoutubeLavalinkSource(new FixtureLoader(fixture('empty'))).findCandidates(t, { limit: 5 }),
    ).toEqual([]);
    expect(
      await new YoutubeLavalinkSource(new FixtureLoader(undefined)).findCandidates(t, { limit: 5 }),
    ).toEqual([]);
  });

  it('lève LavalinkError sur loadType « error »', async () => {
    const source = new YoutubeLavalinkSource(new FixtureLoader(fixture('error')));
    await expect(source.findCandidates(catalogTrackFromQuery('x'), { limit: 5 })).rejects.toBeInstanceOf(
      LavalinkError,
    );
  });

  it('respecte un signal déjà annulé sans appeler Lavalink', async () => {
    const loader = new FixtureLoader(fixture('search-daft-punk'));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      new YoutubeLavalinkSource(loader).findCandidates(catalogTrackFromQuery('x'), {
        limit: 5,
        signal: ctrl.signal,
      }),
    ).rejects.toThrow();
    expect(loader.identifiers).toEqual([]);
  });

  it('fromRef recharge une vidéo par son identifiant', async () => {
    const loader = new FixtureLoader(fixture('track'));
    const c = await new YoutubeLavalinkSource(loader).fromRef('FGBhQbmPwH8');
    expect(loader.identifiers).toEqual(['https://www.youtube.com/watch?v=FGBhQbmPwH8']);
    expect(c).toMatchObject({ ref: 'FGBhQbmPwH8', engineHandle: 'QAAAFGBhQbmPwH8ENCODED', score: 1 });
    expect(
      await new YoutubeLavalinkSource(new FixtureLoader(fixture('empty'))).fromRef('FGBhQbmPwH8'),
    ).toBeNull();
    expect(await new YoutubeLavalinkSource(loader).fromRef('pas une ref/../')).toBeNull();
  });
});
