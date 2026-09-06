/**
 * Localized badge display names/descriptions.
 * Badge IDs remain stable in badgeDefinitions; copy lives in i18n.
 */

import type {BadgeDefinition} from '@/types/badge.types';

type Translate = (path: string, params?: Record<string, string | number>) => string;

function catalogPath(id: string, field: 'name' | 'description'): string {
  return `badges.catalog.${id}.${field}`;
}

/**
 * Resolve localized badge name. Falls back to definition name if key missing.
 */
export function badgeDisplayName(t: Translate, def: BadgeDefinition): string {
  const key = catalogPath(def.id, 'name');
  const value = t(key);
  // createTranslator humanizes missing keys — detect unresolved catalog miss
  if (!value || value === key || value === 'Name') {
    return def.name;
  }
  // If English fallback returned the key humanized poorly, prefer def when identical to id leaf
  if (value === def.id) {
    return def.name;
  }
  return value;
}

export function badgeDisplayDescription(
  t: Translate,
  def: BadgeDefinition,
): string {
  const key = catalogPath(def.id, 'description');
  const value = t(key);
  if (!value || value === key || value === 'Description') {
    return def.description;
  }
  return value;
}
