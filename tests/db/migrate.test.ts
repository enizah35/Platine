import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/adapters/db/migrate.js';
import { createDrizzleRepositories } from '../../src/adapters/db/repositories/index.js';
import { isUniqueViolation } from '../../src/adapters/db/repositories/shared.js';
import { playHistory, playlists, tracks } from '../../src/adapters/db/schema.js';
import { FakeClock } from '../../src/adapters/fakes/fake-clock.js';
import { createTestDb } from './pglite.js';

const testDb = await createTestDb();
afterAll(() => testDb.close());

const TABLES = [
  'artist_external_ids',
  'guild_settings',
  'incidents',
  'play_history',
  'playback_matches',
  'player_state',
  'playlist_items',
  'playlists',
  'queue_items',
  'track_external_ids',
  'track_likes',
  'tracks',
  'voice_sessions',
];

describe('migration initiale (PGlite)', () => {
  beforeEach(() => testDb.reset());

  it('crée les 13 tables du §4', async () => {
    const r = await testDb.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(TABLES);
  });

  it('est idempotente', async () => {
    await expect(migrate(testDb.db)).resolves.toBeUndefined();
  });

  it('crée les index demandés', async () => {
    const r = await testDb.client.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public'",
    );
    const defs = Object.fromEntries(r.rows.map((x) => [x.indexname, x.indexdef]));
    expect(defs.playlists_guild_name_uq).toMatch(/UNIQUE INDEX .*\(guild_id, lower\(name\)\)/);
    expect(defs.play_history_guild_started_idx).toMatch(/\(guild_id, started_at DESC/);
    expect(defs.tracks_isrc_unique).toMatch(/UNIQUE/);
  });

  it('impose un nom de playlist unique par serveur, sans casse', async () => {
    await testDb.db.insert(playlists).values({ guildId: 'g1', name: 'Soirée', createdBy: 'u1' });
    const err = await testDb.db
      .insert(playlists)
      .values({ guildId: 'g1', name: 'SOIRÉE', createdBy: 'u1' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(new Error('autre'))).toBe(false);
  });

  it('end enregistre la fin de lecture dans play_history', async () => {
    const clock = new FakeClock();
    const repos = createDrizzleRepositories(testDb.db, clock);
    const t = await repos.tracks.upsert({
      title: 'x',
      artists: ['y'],
      durationMs: 1000,
      genres: [],
      explicit: false,
      externalIds: [],
    });
    const id = await repos.history.start({
      guildId: 'g1',
      trackId: t.id,
      requestedBy: null,
      origin: 'autoplay',
      startedAt: clock.now(),
    });
    const [before] = await testDb.db.select().from(playHistory).where(eq(playHistory.id, id));
    expect(before).toMatchObject({ endedAt: null, playedMs: null, endReason: null, wrongMatch: false });
    await repos.history.end(id, {
      endedAt: new Date('2026-01-01T00:03:00Z'),
      playedMs: 12_345,
      endReason: 'skipped',
      wrongMatch: true,
    });
    const [after] = await testDb.db.select().from(playHistory).where(eq(playHistory.id, id));
    expect(after).toMatchObject({
      endedAt: new Date('2026-01-01T00:03:00Z'),
      playedMs: 12_345,
      endReason: 'skipped',
      wrongMatch: true,
    });
  });

  it('les clés étrangères protègent les morceaux référencés', async () => {
    const [t] = await testDb.db
      .insert(tracks)
      .values({ title: 'x', artists: ['y'], primaryArtist: 'y', durationMs: 1, genres: [] })
      .returning();
    await testDb.db
      .insert(playHistory)
      .values({ guildId: 'g', trackId: t?.id as string, origin: 'user', startedAt: new Date() });
    await expect(testDb.db.delete(tracks).where(eq(tracks.id, t?.id as string))).rejects.toThrow();
    const n = await testDb.client.query<{ n: number }>('select count(*)::int as n from tracks');
    expect(n.rows[0]).toEqual({ n: 1 });
  });
});
