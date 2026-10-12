// Traduction pure des événements de lecteur Shoukaku / Lavalink v4 en `EngineEvent` (contrat §5.2).
import type {
  TrackEndEvent,
  TrackExceptionEvent,
  TrackStartEvent,
  TrackStuckEvent,
  WebSocketClosedEvent,
} from 'shoukaku';
import type { EngineEvent } from '../../../domain/contracts/ports.js';

export type ShoukakuPlayerEvent =
  | { kind: 'start'; data: Pick<TrackStartEvent, 'guildId'> }
  | { kind: 'end'; data: Pick<TrackEndEvent, 'guildId' | 'reason'> }
  | { kind: 'exception'; data: Pick<TrackExceptionEvent, 'guildId' | 'exception'> }
  | { kind: 'stuck'; data: Pick<TrackStuckEvent, 'guildId' | 'thresholdMs'> }
  | { kind: 'closed'; data: Pick<WebSocketClosedEvent, 'guildId' | 'code' | 'byRemote'> };

const END_REASONS = new Set(['finished', 'loadFailed', 'stopped', 'replaced', 'cleanup'] as const);
const SEVERITIES = new Set(['common', 'suspicious', 'fault'] as const);

export function translatePlayerEvent(guildId: string, e: ShoukakuPlayerEvent): EngineEvent {
  switch (e.kind) {
    case 'start':
      return { type: 'trackStart', guildId };
    case 'end': {
      const reason = e.data.reason;
      return { type: 'trackEnd', guildId, reason: END_REASONS.has(reason) ? reason : 'cleanup' };
    }
    case 'exception': {
      const ex = e.data.exception;
      const message = ex?.message || ex?.cause || 'Erreur de lecture inconnue';
      const severity = ex && SEVERITIES.has(ex.severity) ? ex.severity : 'fault';
      return { type: 'trackException', guildId, message, severity };
    }
    case 'stuck':
      return { type: 'trackStuck', guildId, thresholdMs: e.data.thresholdMs };
    case 'closed':
      return { type: 'voiceClosed', guildId, code: e.data.code, byRemote: e.data.byRemote };
  }
}
