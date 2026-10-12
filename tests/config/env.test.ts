import { describe, expect, it } from 'vitest';
import { discordEnvSchema, EnvError, parseEnv } from '../../src/config/env.js';

const valid = {
  DISCORD_TOKEN: 'token.secret.value',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '876543210987654321',
  LAVALINK_PASSWORD: 'pw',
  DATABASE_URL: 'postgres://platine:pw@127.0.0.1:5432/platine',
};

describe('parseEnv', () => {
  it('applique les défauts', () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      LAVALINK_HOST: '127.0.0.1',
      LAVALINK_PORT: 2333,
      LOG_LEVEL: 'info',
      HEALTH_PORT: 8080,
    });
  });

  it('convertit les ports', () => {
    expect(parseEnv({ ...valid, LAVALINK_PORT: '2444', HEALTH_PORT: '9090' })).toMatchObject({
      LAVALINK_PORT: 2444,
      HEALTH_PORT: 9090,
    });
  });

  it('secret manquant ou vide : EnvError lisible listant chaque problème', () => {
    const { DISCORD_TOKEN: _t, ...noToken } = valid;
    let err: unknown;
    try {
      parseEnv({ ...noToken, LAVALINK_PASSWORD: '', HEALTH_PORT: 'abc' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EnvError);
    const e = err as EnvError;
    expect(e.problems).toEqual(
      expect.arrayContaining([
        'DISCORD_TOKEN manquant',
        'LAVALINK_PASSWORD manquant',
        'HEALTH_PORT doit être un nombre',
      ]),
    );
    expect(e.message).toContain('.env.example');
    expect(e.message).not.toContain(valid.DISCORD_CLIENT_ID);
  });

  it('valide les identifiants Discord, l’URL de base et LOG_LEVEL', () => {
    expect(() => parseEnv({ ...valid, DISCORD_GUILD_ID: 'abc' })).toThrow(/DISCORD_GUILD_ID/);
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('schéma réduit pour deploy:commands', () => {
    const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = valid;
    expect(parseEnv({ DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID }, discordEnvSchema)).toEqual({
      DISCORD_TOKEN,
      DISCORD_CLIENT_ID,
      DISCORD_GUILD_ID,
    });
  });
});
