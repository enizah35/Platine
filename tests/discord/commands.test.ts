import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryRepositories,
  FakeAudioSource,
  FakeClock,
  FakePlayerEngine,
  makeCandidate,
} from '../../src/adapters/fakes/index.js';
import { catalogTrackFromQuery, handlePlay, type PlayDeps } from '../../src/discord/commands/play.js';
import { handleStop } from '../../src/discord/commands/stop.js';
import { HistoryRecorder } from '../../src/discord/history-recorder.js';
import { commandDefinitions, createRegistry } from '../../src/discord/registry.js';
import { t } from '../../src/i18n/t.js';

const ctx = { guildId: '111111111111111111', userId: '222222222222222222', voiceChannelId: 'vc-1' };
const QUERY = 'daft punk one more time';

function setup() {
  const clock = new FakeClock('2026-10-12T20:00:00.000Z');
  const repos = createInMemoryRepositories(clock);
  const engine = new FakePlayerEngine();
  const audio = new FakeAudioSource('youtube', { clock });
  const logger = { warn: vi.fn(), error: vi.fn() };
  const recorder = new HistoryRecorder(repos.history, engine, clock, logger);
  const deps: PlayDeps = {
    engine,
    audio,
    tracks: repos.tracks,
    history: repos.history,
    settings: repos.settings,
    clock,
    recorder,
    logger,
  };
  return { clock, repos, engine, audio, logger, recorder, deps };
}

describe('/play', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('cas nominal : rejoint le salon, joue le 1er candidat, enregistre morceau et historique', async () => {
    const best = makeCandidate({ title: 'One More Time', author: 'Daft Punk - Topic', durationMs: 320_357 });
    s.audio.setCandidates(catalogTrackFromQuery(QUERY), [best, makeCandidate()]);

    const reply = await handlePlay(s.deps, { ...ctx, query: `  ${QUERY} ` });

    expect(reply).toEqual({
      content: t('play.nowPlaying', {
        title: 'One More Time',
        author: 'Daft Punk - Topic',
        duration: '5:20',
      }),
      ephemeral: false,
    });
    expect(s.engine.callsOf('join')).toEqual([
      { method: 'join', guildId: ctx.guildId, voiceChannelId: 'vc-1' },
    ]);
    expect(s.engine.callsOf('play').map((c) => c.candidate)).toEqual([best]);
    const recent = await s.repos.history.recent(ctx.guildId, 5);
    expect(recent).toHaveLength(1);
    const track = await s.repos.tracks.get(recent[0] ?? '');
    expect(track).toMatchObject({ title: QUERY, artists: [], durationMs: 320_357 });
  });

  it('clôt l’historique à la fin du morceau (trackEnd)', async () => {
    s.audio.setDefault({ candidates: [makeCandidate()] });
    const end = vi.spyOn(s.repos.history, 'end');
    await handlePlay(s.deps, { ...ctx, query: QUERY });
    s.clock.advance(60_000);
    s.engine.emit({ type: 'trackEnd', guildId: ctx.guildId, reason: 'finished' });
    await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
    expect(end.mock.calls[0]?.[1]).toMatchObject({ playedMs: 60_000, endReason: 'finished' });
  });

  it('pas dans un salon vocal : réponse éphémère, rien n’est joué', async () => {
    const reply = await handlePlay(s.deps, { ...ctx, voiceChannelId: null, query: QUERY });
    expect(reply).toEqual({ content: t('error.NOT_IN_VOICE'), ephemeral: true });
    expect(s.engine.calls).toEqual([]);
    expect(s.audio.calls).toEqual([]);
  });

  it('rien trouvé : réponse éphémère avec la requête, sans rejoindre le salon', async () => {
    const reply = await handlePlay(s.deps, { ...ctx, query: QUERY });
    expect(reply).toEqual({ content: t('error.NOT_FOUND', { query: QUERY }), ephemeral: true });
    expect(s.engine.calls).toEqual([]);
  });

  it('moteur indisponible : réponse éphémère, aucune recherche', async () => {
    s.engine.setReady(false);
    const reply = await handlePlay(s.deps, { ...ctx, query: QUERY });
    expect(reply).toEqual({ content: t('error.ENGINE_UNAVAILABLE'), ephemeral: true });
    expect(s.audio.calls).toEqual([]);
  });

  it('erreur inattendue de la source : message générique et journal', async () => {
    s.audio.setDefault({ error: new Error('YouTube a changé') });
    const reply = await handlePlay(s.deps, { ...ctx, query: QUERY });
    expect(reply).toEqual({ content: t('error.generic'), ephemeral: true });
    expect(s.logger.error).toHaveBeenCalledTimes(1);
  });

  it('un échec d’écriture en base ne coupe pas la musique', async () => {
    s.audio.setDefault({ candidates: [makeCandidate()] });
    vi.spyOn(s.repos.tracks, 'upsert').mockRejectedValue(new Error('db down'));
    const reply = await handlePlay(s.deps, { ...ctx, query: QUERY });
    expect(reply.ephemeral).toBe(false);
    expect(s.engine.callsOf('play')).toHaveLength(1);
    expect(s.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('répond en anglais si le serveur est réglé en anglais', async () => {
    await s.repos.settings.update(ctx.guildId, { locale: 'en' });
    const reply = await handlePlay(s.deps, { ...ctx, voiceChannelId: null, query: QUERY });
    expect(reply.content).toBe(t('error.NOT_IN_VOICE', {}, 'en'));
  });
});

describe('/stop', () => {
  it('arrête, quitte le salon et clôt l’historique', async () => {
    const s = setup();
    s.audio.setDefault({ candidates: [makeCandidate()] });
    const end = vi.spyOn(s.repos.history, 'end');
    await handlePlay(s.deps, { ...ctx, query: QUERY });
    const reply = await handleStop(s.deps, ctx);
    expect(reply).toEqual({ content: t('stop.done'), ephemeral: false });
    expect(s.engine.calls.map((c) => c.method)).toEqual(['join', 'play', 'stop', 'leave']);
    expect(end.mock.calls[0]?.[1]).toMatchObject({ endReason: 'stopped' });
  });

  it('rien en cours : réponse éphémère', async () => {
    const s = setup();
    expect(await handleStop(s.deps, ctx)).toEqual({ content: t('stop.nothing'), ephemeral: true });
  });

  it('moteur indisponible pendant la lecture : ENGINE_UNAVAILABLE', async () => {
    const s = setup();
    s.audio.setDefault({ candidates: [makeCandidate()] });
    await handlePlay(s.deps, { ...ctx, query: QUERY });
    s.engine.setReady(false);
    expect(await handleStop(s.deps, ctx)).toEqual({
      content: t('error.ENGINE_UNAVAILABLE'),
      ephemeral: true,
    });
  });
});

describe('registry', () => {
  it('expose /play et /stop, avec descriptions traduites', async () => {
    const defs = commandDefinitions();
    expect(defs.map((d) => d.name)).toEqual(['play', 'stop']);
    expect(defs[0]?.description).toBe(t('command.play.description'));
    expect(defs[0]?.description_localizations?.['en-US']).toBe(t('command.play.description', {}, 'en'));

    const s = setup();
    const reg = createRegistry(s.deps);
    const reply = await reg.get('play')?.run({ ...ctx, voiceChannelId: null }, { getString: () => QUERY });
    expect(reply?.content).toBe(t('error.NOT_IN_VOICE'));
  });
});
