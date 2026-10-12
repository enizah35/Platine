# ADR 0001 — Client Lavalink : Shoukaku 4.3.0

- **Statut :** acceptée (tâche 0.2, 2026-10-12) — à confirmer par le spike DAVE sur le PC de Hugo
- **Contexte du plan :** `plan-technique.md` §2 (stack), §9 risque R2

## Contexte

Depuis le 2 mars 2026, Discord exige le chiffrement de bout en bout de la voix (protocole **DAVE**) pour tous
les bots. Chez nous, c'est **Lavalink** qui ouvre la connexion voix et chiffre l'audio ; DAVE y est pris en
charge depuis **Lavalink 4.2.0** (on utilise 4.2.2, dernière 4.2.x).

Le changelog de Lavalink 4.2.0 précise :

> The voice state has a new `channelId` field which is required to connect to discords voice servers.

Le client Lavalink côté bot doit donc envoyer `voice.channelId` (en plus de `token`, `endpoint`, `sessionId`)
dans `PATCH /v4/sessions/{sessionId}/players/{guildId}`. Sinon, la connexion voix échoue (fermeture 4017,
« E2EE/DAVE protocol required »).

Deux clients Node.js sont candidats : **Shoukaku** (fin, bas niveau) et **lavalink-client** (riche, avec sa propre
file d'attente et ses propres règles de lecture).

## Vérification (lecture du code publié sur npm, pas seulement des notes de version)

Méthode : `npm pack <paquet>@<version>`, puis lecture du code de `dist/` à l'endroit où l'objet `voice` est construit.

| Paquet | Version | Date npm | `channelId` dans `voice` ? | Preuve |
|---|---|---|---|---|
| shoukaku | 4.2.0 | 2025-11-01 | **Non** | `dist/index.mjs` l. 470-473 : `voice: { token, endpoint, sessionId }` |
| shoukaku | **4.3.0** (`latest`) | 2026-02-28 | **Oui** | `dist/index.mjs` l. 470-475 et 701-706 : `voice: { token, endpoint, sessionId, channelId: connection.channelId }` (connexion initiale et reprise) |
| lavalink-client | 2.9.2 | 2026-02-21 | Non | `dist/index.js` : `voice: { token, endpoint, sessionId }` |
| lavalink-client | **2.9.3** | 2026-02-27 | **Oui** | `voice: { …, channelId: this.voice.channelId }`, plus un garde-fou « Missing channelId » |
| lavalink-client | 2.11.0 (`latest`) | 2026-08-21 | Oui | même code |

Autres points relevés dans Shoukaku 4.3.0 : options `resume`, `resumeTimeout`, `resumeByLibrary`,
`reconnectTries`, `moveOnDisconnect` ; connecteur `Connectors.DiscordJS` ; dépendance unique `ws` ; Node ≥ 18.

## Décision

**Shoukaku, version épinglée exactement : `shoukaku@4.3.0`** (pas de `^`) — à ajouter par l'Intégrateur
de la phase 0 dans `package.json` (tâche 0.4).

Raisons :
1. 4.3.0 envoie `channelId` (vérifié dans le code), donc compatible DAVE avec Lavalink ≥ 4.2.0.
2. Client **fin** : on garde notre propre file, nos règles de reprise (contrats §5.6) et nos tests avec
   `FakePlayerEngine`. lavalink-client apporte sa propre file et sa propre logique de lecteur, qu'on devrait
   contourner ou dupliquer.
3. API proche du protocole Lavalink v4 : l'adaptateur `engine/lavalink-shoukaku` reste petit, et un passage à
   NodeLink (même API v4, plan C) ne toucherait que le conteneur.

Configuration attendue côté bot (tâche 0.4) : `resume: true`, `resumeTimeout: 60` (secondes), `resumeByLibrary: false`
(la reprise des lecteurs est faite par notre `RecoveryService`), `reconnectTries` > 0. Côté serveur, rien à configurer :
en Lavalink v4 la reprise est activée par le client via `PATCH /v4/sessions/{id}` (`{"resuming": true, "timeout": 60}`).

## Conséquences et risques

- **Rythme de maintenance de Shoukaku :** aucune version depuis le 28/02/2026 (≈ 7 mois). lavalink-client publie
  plus souvent (2.11.0 le 21/08/2026). Si Discord ou Lavalink change encore le protocole voix, Shoukaku pourrait
  tarder.
- **Repli :** `lavalink-client` **≥ 2.9.3** (épingler `2.11.0`). Il n'implémenterait que le port `PlayerEngine`
  (on ignore sa file). Plan C : NodeLink côté serveur, sans changement de client.
- **Critère de remise en cause :** si le spike sur le PC de Hugo donne une erreur 4017 / « E2EE required » avec
  Shoukaku 4.3.0 + Lavalink 4.2.2, on passe à lavalink-client et on met cette ADR à jour.

## Sources

- Changelog Lavalink (v4.2.0 : DAVE, champ `channelId`) : https://github.com/lavalink-devs/Lavalink/blob/master/CHANGELOG.md
- API REST Lavalink, état voix : https://lavalink.dev/api/rest#voice-state
- API REST Lavalink, mise à jour de session (reprise) : https://lavalink.dev/api/rest#update-session
- Shoukaku (npm, versions et dates : `npm view shoukaku time`) : https://www.npmjs.com/package/shoukaku
- Shoukaku (code source) : https://github.com/shipgirlproject/Shoukaku
- lavalink-client (npm) : https://www.npmjs.com/package/lavalink-client
- lavalink-client (code source) : https://github.com/tomato6966/lavalink-client
- DAVE : https://daveprotocol.com/
