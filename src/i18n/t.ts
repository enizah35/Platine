// Mini i18n de la phase 0 : dictionnaires JSON plats par module et par langue, interpolation `{nom}`.
// La vraie i18n (un fichier par module, typage par module) arrive en phase 1 ; aucun texte en dur ailleurs.
import type { Locale } from '../domain/contracts/settings.js';
import enCore from './locales/en/core.json' with { type: 'json' };
import frCore from './locales/fr/core.json' with { type: 'json' };

export type { Locale };
export type MessageKey = keyof typeof frCore;
export type Params = Record<string, string | number>;

export const DEFAULT_LOCALE: Locale = 'fr';

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  fr: frCore,
  // Le typage impose qu'EN ait toutes les clés de FR (vérifié aussi par un test).
  en: enCore satisfies Record<MessageKey, string>,
};

/** Traduit `key` dans `locale` (FR par défaut ; repli FR puis la clé elle-même). */
export function t(key: MessageKey, params: Params = {}, locale: Locale = DEFAULT_LOCALE): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries.fr[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : m,
  );
}

/** Traductions d'une clé pour toutes les langues (descriptions localisées des slash commands). */
export function allLocales(key: MessageKey): Record<Locale, string> {
  return { fr: t(key, {}, 'fr'), en: t(key, {}, 'en') };
}
