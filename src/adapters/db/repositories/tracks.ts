import { and, between, eq, or } from 'drizzle-orm';
import type { TrackRepository } from '../../../domain/contracts/repositories.js';
import type { CatalogTrack, Track, TrackId } from '../../../domain/contracts/track.js';
import {
  isSameTrackFuzzy,
  mergeTrack,
  normalizeIsrc,
  primaryArtist,
  SAME_TRACK_DURATION_TOLERANCE_MS,
} from '../../../domain/tracks/identity.js';
import { trackExternalIds, tracks } from '../schema.js';
import type { Db } from '../types.js';
import { isUuid, loadTracks } from './shared.js';

export class DrizzleTrackRepository implements TrackRepository {
  constructor(private readonly db: Db) {}

  async get(id: TrackId): Promise<Track | null> {
    if (!isUuid(id)) return null;
    return (await loadTracks(this.db, [id])).get(id) ?? null;
  }

  upsert(t: CatalogTrack): Promise<Track> {
    return this.db.transaction(async (tx) => {
      const existingId = await findExisting(tx, t);
      let id: TrackId;
      if (existingId) {
        id = existingId;
        const existing = (await loadTracks(tx, [id])).get(id);
        if (existing) {
          const merged = mergeTrack(existing, t);
          await tx
            .update(tracks)
            .set({
              isrc: merged.isrc ?? null,
              album: merged.album ?? null,
              artworkUrl: merged.artworkUrl ?? null,
              genres: merged.genres,
            })
            .where(eq(tracks.id, id));
        }
      } else {
        const [row] = await tx
          .insert(tracks)
          .values({
            isrc: normalizeIsrc(t.isrc),
            title: t.title,
            artists: t.artists,
            primaryArtist: primaryArtist(t),
            album: t.album ?? null,
            durationMs: t.durationMs,
            artworkUrl: t.artworkUrl ?? null,
            genres: t.genres,
            explicit: t.explicit,
          })
          .returning({ id: tracks.id });
        if (!row) throw new Error('Insertion du morceau sans retour');
        id = row.id;
      }
      if (t.externalIds.length > 0) {
        await tx
          .insert(trackExternalIds)
          .values(
            t.externalIds.map((x) => ({
              provider: x.provider,
              externalId: x.id,
              trackId: id,
              url: x.url ?? null,
            })),
          )
          .onConflictDoNothing();
      }
      const out = (await loadTracks(tx, [id])).get(id);
      if (!out) throw new Error(`Morceau ${id} introuvable après upsert`);
      return out;
    });
  }
}

/** ISRC, puis identifiant externe, puis (artiste, titre normalisés, durée ±3 s) sans ISRC contradictoire. */
async function findExisting(db: Db, t: CatalogTrack): Promise<TrackId | null> {
  const isrc = normalizeIsrc(t.isrc);
  if (isrc) {
    const [row] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.isrc, isrc)).limit(1);
    if (row) return row.id;
  }
  if (t.externalIds.length > 0) {
    const [row] = await db
      .select({ id: trackExternalIds.trackId })
      .from(trackExternalIds)
      .where(
        or(
          ...t.externalIds.map((x) =>
            and(eq(trackExternalIds.provider, x.provider), eq(trackExternalIds.externalId, x.id)),
          ),
        ),
      )
      .limit(1);
    if (row) return row.id;
  }
  const near = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      artists: tracks.artists,
      durationMs: tracks.durationMs,
      isrc: tracks.isrc,
    })
    .from(tracks)
    .where(
      between(
        tracks.durationMs,
        t.durationMs - SAME_TRACK_DURATION_TOLERANCE_MS,
        t.durationMs + SAME_TRACK_DURATION_TOLERANCE_MS,
      ),
    );
  const match = near.find((c) => !(isrc && c.isrc && c.isrc !== isrc) && isSameTrackFuzzy(c, t));
  return match?.id ?? null;
}
