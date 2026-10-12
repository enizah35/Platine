// Défauts produit (plan §0). Les réglages par serveur sont définis dans le domaine
// (`src/domain/contracts/settings.ts`), qui ne peut pas importer `src/config` : ce fichier les ré-exporte.
export { defaultGuildSettings, GUILD_SETTINGS_DEFAULTS } from '../domain/contracts/settings.js';

/** Nom provisoire du bot : il n'apparaît qu'ici, dans `package.json` et dans les traductions. */
export const BOT_NAME = 'Platine';
