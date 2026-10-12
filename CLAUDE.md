# Platine — conventions

Bot Discord de musique (usage privé). Plan de référence : `enizah35/workflow-ia`, `docs/discord-music/plan-technique.md`
(stack §2, structure §3, modèle de données §4, **contrats §5**, phases §6).

## Commandes
- `pnpm install` · `pnpm lint` (Biome + règle du domaine pur) · `pnpm typecheck` · `pnpm test` (Vitest) · `pnpm build`
- Avant tout push : `pnpm lint && pnpm typecheck && pnpm test && pnpm build` doivent passer.

## Règles
- TypeScript strict, ESM (`"type": "module"`), imports relatifs avec suffixe `.js`.
- `src/domain/**` est pur : aucun import de `src/adapters`, `src/discord`, `src/ops`, `src/config`, ni de
  `discord.js`, `shoukaku`, `drizzle-orm`, `undici`, `pino`… (vérifié par `scripts/check-domain-imports.mjs`).
- `src/domain/contracts/**` est figé : toute modification passe par le Chef et une ADR dans `docs/adr/`.
- Aucun test ne touche le réseau (Discord, YouTube, Deezer, Spotify) : utiliser `src/adapters/fakes/` et des fixtures.
- Tout texte visible par l'utilisateur passe par l'i18n (FR + EN), jamais en dur.
- Les playlists et la file stockent des morceaux (métadonnées catalogue), jamais d'URL audio ; seule `playback_matches`
  contient une référence de source audio.
- Commits et docs en français.
