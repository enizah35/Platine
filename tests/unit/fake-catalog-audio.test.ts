import { describe, expect, it } from 'vitest';
import { FakeAudioSource } from '../../src/adapters/fakes/fake-audio-source.js';
import { FakeCatalog } from '../../src/adapters/fakes/fake-catalog.js';
import { FakeClock } from '../../src/adapters/fakes/fake-clock.js';
import { fakeTrackKey, makeCandidate, makeCatalogTrack } from '../../src/adapters/fakes/fixtures.js';

describe('FakeCatalog', () => {
  it('rend les résultats programmés par requête (normalisée), URL et graine', async () => {
    const a = makeCatalogTrack({ title: 'One More Time', artists: ['Daft Punk'] });
    const b = makeCatalogTrack();
    const cat = new FakeCatalog('spotify')
      .setSearch('daft punk one more time', [a, b])
      .setUrl('https://deezer.com/track/1', [a])
      .setRelated(a, [b])
      .setDefaultRelated([a]);
    expect(cat.id).toBe('spotify');
    expect(await cat.search('Daft Punk — One More Time!', { limit: 1 })).toEqual([a]);
    expect(await cat.search('rien', { limit: 5 })).toEqual([]);
    expect(await cat.resolveUrl('https://deezer.com/track/1')).toEqual([a]);
    expect(await cat.resolveUrl('https://ailleurs')).toBeNull();
    expect(await cat.related(a, { limit: 5 })).toEqual([b]);
    expect(await cat.related(b, { limit: 5 })).toEqual([a]);
    expect(cat.calls.map((c) => c.method)).toEqual([
      'search',
      'search',
      'resolveUrl',
      'resolveUrl',
      'related',
      'related',
    ]);
  });

  it('rend des copies, simule échecs et annulation', async () => {
    const a = makeCatalogTrack();
    const cat = new FakeCatalog().setSearch('x', [a]);
    const [r] = await cat.search('x', { limit: 5 });
    if (r) r.title = 'modifié';
    expect((await cat.search('x', { limit: 5 }))[0]?.title).toBe(a.title);
    cat.failWith('search', new Error('429'));
    await expect(cat.search('x', { limit: 5 })).rejects.toThrow('429');
    cat.failWith('search', null);
    cat.failWith('resolveUrl', new Error('down')).failWith('related', new Error('down'));
    await expect(cat.resolveUrl('u')).rejects.toThrow('down');
    await expect(cat.related(a, { limit: 1 })).rejects.toThrow('down');
    const ctl = new AbortController();
    ctl.abort();
    await expect(cat.search('x', { limit: 5, signal: ctl.signal })).rejects.toThrow();
  });
});

describe('FakeAudioSource', () => {
  it('rend les candidats programmés par morceau, puis le défaut', async () => {
    const t = makeCatalogTrack({ isrc: 'fr-abc-26-00001' });
    const c1 = makeCandidate({ score: 0.9 });
    const c2 = makeCandidate({ score: 0.5 });
    const src = new FakeAudioSource('youtube').setCandidates(t, [c1, c2]);
    expect(src.id).toBe('youtube');
    expect(fakeTrackKey(t)).toBe('FRABC2600001');
    expect(await src.findCandidates(t, { limit: 1 })).toEqual([c1]);
    expect(await src.findCandidates(makeCatalogTrack(), { limit: 5 })).toEqual([]);
    const d = makeCandidate();
    src.setDefault({ candidates: [d] });
    expect(await src.findCandidates(makeCatalogTrack(), { limit: 5 })).toEqual([d]);
    expect(await src.fromRef(c2.ref)).toEqual(c2);
    expect(await src.fromRef(d.ref)).toEqual(d);
    src.setRef(c2.ref, null);
    expect(await src.fromRef(c2.ref)).toBeNull();
    expect(await src.fromRef('inconnu')).toBeNull();
    expect(src.calls.filter((c) => c.method === 'fromRef')).toHaveLength(4);
  });

  it('simule échecs et lenteurs via l’horloge, avec annulation', async () => {
    const clock = new FakeClock(0);
    const slow = makeCatalogTrack();
    const broken = makeCatalogTrack();
    const c = makeCandidate();
    const src = new FakeAudioSource('fake', { clock })
      .setCandidates(slow, [c], { delayMs: 2_000 })
      .failFor(broken, new Error('Sign in to confirm'));
    await expect(src.findCandidates(broken, { limit: 3 })).rejects.toThrow('Sign in');

    let result: unknown;
    const p = src.findCandidates(slow, { limit: 3 }).then((r) => {
      result = r;
    });
    await clock.advanceAsync(1_999);
    expect(result).toBeUndefined();
    await clock.advanceAsync(1);
    await p;
    expect(result).toEqual([c]);

    const ctl = new AbortController();
    const aborted = src.findCandidates(slow, { limit: 3, signal: ctl.signal });
    ctl.abort();
    await expect(aborted).rejects.toThrow();
    expect(clock.pendingTimers).toBe(0);
    await expect(src.findCandidates(slow, { limit: 3, signal: ctl.signal })).rejects.toThrow();

    src.setDefault({ error: new Error('quota'), delayMs: 10 });
    const q = src.findCandidates(makeCatalogTrack(), { limit: 1 });
    await clock.advanceAsync(10);
    await expect(q).rejects.toThrow('quota');
  });
});
