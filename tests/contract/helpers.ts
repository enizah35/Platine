import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { FakeClock } from '../../src/adapters/fakes/fake-clock.js';
import type { DomainErrorCode } from '../../src/domain/contracts/errors.js';
import { isDomainError } from '../../src/domain/contracts/errors.js';
import type { TrackRepository } from '../../src/domain/contracts/repositories.js';
import type { CatalogTrack, QueueItem, Track } from '../../src/domain/contracts/track.js';

/** Ce que chaque implémentation fournit à une suite de contrat (un état vierge par test). */
export interface ContractFixture<R> {
  repo: R;
  /** Pour créer les morceaux référencés (clés étrangères côté base). */
  tracks: TrackRepository;
  /** Horloge injectée dans le dépôt (horodatages déterministes). */
  clock: FakeClock;
}
export type ContractFactory<R> = () => Promise<ContractFixture<R>>;

export function catalogTrack(over: Partial<CatalogTrack> = {}): CatalogTrack {
  return {
    title: 'One More Time',
    artists: ['Daft Punk'],
    durationMs: 320_000,
    genres: ['electro'],
    explicit: false,
    externalIds: [{ provider: 'deezer', id: '3135556', url: 'https://www.deezer.com/track/3135556' }],
    ...over,
  };
}

let n = 0;
/** Morceau distinct à chaque appel. */
export function uniqueTrack(over: Partial<CatalogTrack> = {}): CatalogTrack {
  n++;
  return catalogTrack({
    title: `Morceau ${n}`,
    artists: [`Groupe ${n}`],
    durationMs: 100_000 + n * 7_000,
    externalIds: [{ provider: 'deezer', id: `c-${n}` }],
    isrc: undefined,
    ...over,
  });
}

export function queueItem(track: Track, over: Partial<QueueItem> = {}): QueueItem {
  return {
    id: randomUUID(),
    track,
    requestedBy: 'u1',
    origin: 'user',
    addedAt: new Date('2026-03-01T10:00:00Z'),
    ...over,
  };
}

export async function expectDomainError(p: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, `attendu DomainError ${code}`).toBeDefined();
  expect(isDomainError(err, code), `attendu ${code}, reçu ${String(err)}`).toBe(true);
}

/** Les identifiants externes sont rendus triés (fournisseur, id) par toutes les implémentations. */
export function sortExt<T extends { externalIds: CatalogTrack['externalIds'] }>(t: T): T {
  return {
    ...t,
    externalIds: [...t.externalIds].sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id),
    ),
  };
}
