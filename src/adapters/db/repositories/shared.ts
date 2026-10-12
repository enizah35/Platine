import { asc, inArray } from 'drizzle-orm';
import type { Track, TrackId } from '../../../domain/contracts/track.js';
import { trackExternalIds, tracks } from '../schema.js';
import type { Db } from '../types.js';

type TrackRow = typeof tracks.$inferSelect;
type ExternalIdRow = typeof trackExternalIds.$inferSelect;
type CatalogProviderName = Track['externalIds'][number]['provider'];

function toTrack(row: TrackRow, ext: ExternalIdRow[]): Track {
  const t: Track = {
    id: row.id,
    title: row.title,
    artists: row.artists,
    durationMs: row.durationMs,
    genres: row.genres,
    explicit: row.explicit,
    externalIds: ext
      // `lrclib` (V2) n'est pas un fournisseur catalogue du contrat Track.
      .filter((e) => e.provider !== 'lrclib')
      .map((e) => ({
        provider: e.provider as CatalogProviderName,
        id: e.externalId,
        ...(e.url !== null ? { url: e.url } : {}),
      })),
  };
  if (row.album !== null) t.album = row.album;
  if (row.isrc !== null) t.isrc = row.isrc;
  if (row.artworkUrl !== null) t.artworkUrl = row.artworkUrl;
  return t;
}

/** Charge des morceaux complets (avec identifiants externes) en deux requêtes. */
export async function loadTracks(db: Db, ids: readonly TrackId[]): Promise<Map<TrackId, Track>> {
  const unique = [...new Set(ids)];
  const out = new Map<TrackId, Track>();
  if (unique.length === 0) return out;
  const rows = await db.select().from(tracks).where(inArray(tracks.id, unique));
  const ext = await db
    .select()
    .from(trackExternalIds)
    .where(inArray(trackExternalIds.trackId, unique))
    .orderBy(asc(trackExternalIds.provider), asc(trackExternalIds.externalId));
  for (const row of rows) {
    out.set(
      row.id,
      toTrack(
        row,
        ext.filter((e) => e.trackId === row.id),
      ),
    );
  }
  return out;
}

export function requireTrack(map: Map<TrackId, Track>, id: TrackId): Track {
  const t = map.get(id);
  // Impossible tant que les clés étrangères tiennent : on le signale bruyamment.
  if (!t) throw new Error(`Morceau ${id} introuvable (intégrité de la base)`);
  return t;
}

/** Violation d'unicité PostgreSQL (23505), que l'erreur vienne du pilote ou soit enveloppée par Drizzle. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur === 'object' && 'code' in cur && (cur as { code: unknown }).code === '23505') return true;
    cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : undefined;
  }
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant non UUID ne peut désigner aucune ligne : on évite l'erreur PostgreSQL 22P02. */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
