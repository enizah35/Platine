// /play <texte> — phase 0 : pas de catalogue (Deezer en phase 1), pas de file. Le texte devient un morceau
// catalogue minimal, la source audio cherche des candidats, le premier est joué tout de suite.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { DomainError } from '../../domain/contracts/errors.js';
import type { AudioSource, Clock, PlayerEngine } from '../../domain/contracts/ports.js';
import type {
  HistoryRepository,
  SettingsRepository,
  TrackRepository,
} from '../../domain/contracts/repositories.js';
import type { CatalogTrack } from '../../domain/contracts/track.js';
import { allLocales, t } from '../../i18n/t.js';
import { type ErrorLogger, errorReply } from '../errors.js';
import { formatDuration } from '../format.js';
import type { HistoryRecorder } from '../history-recorder.js';
import { guildLocale } from '../locale.js';
import type { CommandContext, CommandReply } from '../reply.js';

export const PLAY_QUERY_MAX = 200;
const CANDIDATE_LIMIT = 5;

export interface PlayDeps {
  engine: PlayerEngine;
  audio: AudioSource;
  tracks: TrackRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
  clock: Clock;
  recorder?: HistoryRecorder;
  logger?: ErrorLogger;
}

export interface PlayInput extends CommandContext {
  query: string;
}

/** Morceau catalogue minimal tiré du texte libre (phase 0, sans catalogue). */
export function catalogTrackFromQuery(query: string, durationMs = 0): CatalogTrack {
  return { title: query, artists: [], durationMs, genres: [], explicit: false, externalIds: [] };
}

export const playCommand = (() => {
  const fr = allLocales('command.play.description');
  const q = allLocales('command.play.option.query');
  return new SlashCommandBuilder()
    .setName('play')
    .setDescription(fr.fr)
    .setDescriptionLocalizations({ 'en-US': fr.en, 'en-GB': fr.en })
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('query')
        .setNameLocalizations({ fr: 'recherche' })
        .setDescription(q.fr)
        .setDescriptionLocalizations({ 'en-US': q.en, 'en-GB': q.en })
        .setRequired(true)
        .setMaxLength(PLAY_QUERY_MAX),
    );
})();

export async function handlePlay(deps: PlayDeps, input: PlayInput): Promise<CommandReply> {
  const locale = await guildLocale(deps.settings, input.guildId);
  const query = input.query.trim().slice(0, PLAY_QUERY_MAX);
  try {
    if (!input.voiceChannelId) throw new DomainError('NOT_IN_VOICE');
    if (!query) throw new DomainError('NOT_FOUND');
    if (!deps.engine.isReady()) throw new DomainError('ENGINE_UNAVAILABLE');

    const wanted = catalogTrackFromQuery(query);
    const [best] = await deps.audio.findCandidates(wanted, { limit: CANDIDATE_LIMIT });
    if (!best) throw new DomainError('NOT_FOUND');

    await deps.engine.join(input.guildId, input.voiceChannelId);
    await deps.recorder?.finish(input.guildId, 'replaced');
    const startedAt = deps.clock.now();
    await deps.engine.play(input.guildId, best);

    await persist(deps, input, { ...wanted, durationMs: best.durationMs }, startedAt);
    return {
      content: t(
        'play.nowPlaying',
        { title: best.title, author: best.author, duration: formatDuration(best.durationMs) },
        locale,
      ),
      ephemeral: false,
    };
  } catch (e) {
    return errorReply(e, locale, deps.logger, { query });
  }
}

/** Enregistre le morceau et le début d'écoute. Un échec ici ne coupe pas la musique. */
async function persist(
  deps: PlayDeps,
  input: PlayInput,
  track: CatalogTrack,
  startedAt: Date,
): Promise<void> {
  try {
    const saved = await deps.tracks.upsert(track);
    const id = await deps.history.start({
      guildId: input.guildId,
      trackId: saved.id,
      requestedBy: input.userId,
      origin: 'user',
      startedAt,
    });
    deps.recorder?.track(input.guildId, id, startedAt);
  } catch (err) {
    deps.logger?.warn({ err, guildId: input.guildId }, 'Morceau ou historique non enregistré');
  }
}
