// Chargement de pistes Lavalink (`GET /v4/loadtracks`) derrière une petite interface injectable :
// en production via le REST de Shoukaku, en test via des réponses Lavalink enregistrées (fixtures JSON).
import type { Shoukaku } from 'shoukaku';
import { DomainError } from '../../../domain/contracts/errors.js';

/** Piste Lavalink v4 (champs utilisés). */
export interface LavalinkTrack {
  encoded: string;
  info: {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    position: number;
    title: string;
    uri?: string | null;
    artworkUrl?: string | null;
    isrc?: string | null;
    sourceName: string;
  };
}

/** Réponse de `loadtracks` (Lavalink v4). */
export type LavalinkLoadResult =
  | { loadType: 'track'; data: LavalinkTrack }
  | { loadType: 'playlist'; data: { info: { name: string; selectedTrack: number }; tracks: LavalinkTrack[] } }
  | { loadType: 'search'; data: LavalinkTrack[] }
  | { loadType: 'empty'; data: Record<string, never> }
  | { loadType: 'error'; data: { message: string; severity: string; cause: string } };

export interface TrackLoader {
  /** `identifier` : `ytsearch:…`, URL ou identifiant. `undefined` si Lavalink ne renvoie rien. */
  load(identifier: string): Promise<LavalinkLoadResult | undefined>;
}

/** Chargeur de production : REST du nœud Lavalink choisi par Shoukaku. `ENGINE_UNAVAILABLE` sans nœud. */
export class ShoukakuTrackLoader implements TrackLoader {
  constructor(private readonly shoukaku: Pick<Shoukaku, 'getIdealNode'>) {}

  async load(identifier: string): Promise<LavalinkLoadResult | undefined> {
    const node = this.shoukaku.getIdealNode();
    if (!node) throw new DomainError('ENGINE_UNAVAILABLE', 'Aucun nœud Lavalink connecté');
    return (await node.rest.resolve(identifier)) as LavalinkLoadResult | undefined;
  }
}
