import { type DestinationStream, type Logger, type LoggerOptions, pino } from 'pino';

export type { Logger };

/** Logger JSON (pino) sur la sortie standard ; la rotation est faite par le driver Docker `json-file`. */
export function createLogger(level: string, opts: { destination?: DestinationStream } = {}): Logger {
  const options: LoggerOptions = {
    level,
    base: { app: 'platine' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Ceinture et bretelles : un objet loggé par erreur ne doit jamais fuiter de secret.
    redact: { paths: ['token', '*.token', 'password', '*.password', 'auth', '*.auth'], censor: '[masqué]' },
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}
