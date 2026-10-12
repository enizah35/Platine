// Schéma PostgreSQL initial (plan §4). Seul `playback_matches` contient une référence de source audio.
// Les valeurs par défaut produit (§0) ne sont PAS dupliquées ici : elles vivent dans le domaine
// (`GUILD_SETTINGS_DEFAULTS`) et le dépôt écrit toujours des lignes complètes.
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PlayerStatus } from '../../domain/contracts/events.js';
import type { MatchStatus } from '../../domain/contracts/repositories.js';
import type { ControlPolicy, Locale, PlaylistEditPolicy } from '../../domain/contracts/settings.js';
import type { EndReason, LoopMode, QueueOrigin } from '../../domain/contracts/track.js';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const guildSettings = pgTable('guild_settings', {
  guildId: text('guild_id').primaryKey(),
  locale: text('locale').$type<Locale>().notNull(),
  controlPolicy: text('control_policy').$type<ControlPolicy>().notNull(),
  djRoleId: text('dj_role_id'),
  autoplayDefault: boolean('autoplay_default').notNull(),
  idleTimeoutS: integer('idle_timeout_s').notNull(),
  keepQueueOnLeave: boolean('keep_queue_on_leave').notNull(),
  playlistEditPolicy: text('playlist_edit_policy').$type<PlaylistEditPolicy>().notNull(),
  historyRetentionDays: integer('history_retention_days').notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    isrc: text('isrc').unique(),
    title: text('title').notNull(),
    artists: text('artists').array().notNull(),
    primaryArtist: text('primary_artist').notNull(),
    album: text('album'),
    durationMs: integer('duration_ms').notNull(),
    artworkUrl: text('artwork_url'),
    genres: text('genres').array().notNull().default(sql`'{}'::text[]`),
    explicit: boolean('explicit').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('tracks_duration_idx').on(t.durationMs)],
);

export const trackExternalIds = pgTable(
  'track_external_ids',
  {
    provider: text('provider').$type<'deezer' | 'spotify' | 'musicbrainz' | 'lrclib'>().notNull(),
    externalId: text('external_id').notNull(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    url: text('url'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.externalId] }),
    index('track_external_ids_track_idx').on(t.trackId),
  ],
);

export const artistExternalIds = pgTable(
  'artist_external_ids',
  {
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.externalId] })],
);

export const playbackMatches = pgTable(
  'playback_matches',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    guildId: text('guild_id'),
    source: text('source').notNull(),
    sourceRef: text('source_ref').notNull(),
    score: doublePrecision('score').notNull(),
    status: text('status').$type<MatchStatus>().notNull(),
    reportedBy: text('reported_by'),
    checkedAt: tstz('checked_at').notNull().defaultNow(),
  },
  (t) => [
    // Une ligne par (morceau, serveur ou global, source, référence) ; NULL = global, donc NULLS NOT DISTINCT.
    unique('playback_matches_key_uq').on(t.trackId, t.guildId, t.source, t.sourceRef).nullsNotDistinct(),
    index('playback_matches_track_guild_idx').on(t.trackId, t.guildId),
  ],
);

export const playlists = pgTable(
  'playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('playlists_guild_name_uq').on(t.guildId, sql`lower(${t.name})`)],
);

export const playlistItems = pgTable(
  'playlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id),
    position: integer('position').notNull(),
    addedBy: text('added_by').notNull(),
    addedAt: tstz('added_at').notNull().defaultNow(),
  },
  (t) => [index('playlist_items_playlist_position_idx').on(t.playlistId, t.position)],
);

export const queueItems = pgTable(
  'queue_items',
  {
    id: uuid('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id),
    position: integer('position').notNull(),
    requestedBy: text('requested_by'),
    origin: text('origin').$type<QueueOrigin>().notNull(),
    addedAt: tstz('added_at').notNull().defaultNow(),
  },
  (t) => [index('queue_items_guild_position_idx').on(t.guildId, t.position)],
);

export const playerState = pgTable(
  'player_state',
  {
    guildId: text('guild_id').primaryKey(),
    voiceChannelId: text('voice_channel_id').notNull(),
    textChannelId: text('text_channel_id').notNull(),
    panelMessageId: text('panel_message_id'),
    // Pas de clé étrangère : la file est réécrite en entier à chaque QueueChanged.
    currentQueueItemId: uuid('current_queue_item_id'),
    currentTrackId: uuid('current_track_id').references(() => tracks.id, { onDelete: 'set null' }),
    positionMs: integer('position_ms').notNull().default(0),
    positionAt: tstz('position_at').notNull(),
    paused: boolean('paused').notNull().default(false),
    loopMode: text('loop_mode').$type<LoopMode>().notNull().default('off'),
    autoplay: boolean('autoplay').notNull(),
    status: text('status').$type<PlayerStatus>().notNull(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('player_state_status_idx').on(t.status)],
);

export const playHistory = pgTable(
  'play_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id),
    requestedBy: text('requested_by'),
    origin: text('origin').$type<QueueOrigin>().notNull(),
    startedAt: tstz('started_at').notNull(),
    endedAt: tstz('ended_at'),
    playedMs: integer('played_ms'),
    endReason: text('end_reason').$type<EndReason>(),
    wrongMatch: boolean('wrong_match').notNull().default(false),
  },
  (t) => [
    index('play_history_guild_started_idx').on(t.guildId, t.startedAt.desc()),
    index('play_history_started_idx').on(t.startedAt),
  ],
);

export const trackLikes = pgTable(
  'track_likes',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId, t.trackId] })],
);

export const incidents = pgTable(
  'incidents',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id'),
    kind: text('kind').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    recovered: boolean('recovered').notNull().default(false),
    at: tstz('at').notNull().defaultNow(),
  },
  (t) => [index('incidents_at_idx').on(t.at)],
);

export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    startedAt: tstz('started_at').notNull(),
    endedAt: tstz('ended_at'),
    maxHumans: integer('max_humans').notNull().default(0),
    listenMs2plus: bigint('listen_ms_2plus', { mode: 'number' }).notNull().default(0),
  },
  (t) => [index('voice_sessions_guild_started_idx').on(t.guildId, t.startedAt)],
);
