/**
 * Robust reader for react-native-config under New Architecture.
 *
 * Verified native shapes (react-native-config):
 * - default export: flat env map from `getConfig().config` (may be undefined if unwrap fails)
 * - NativeModules.RNCConfigModule.config / constantsToExport `{ config: env }`
 * - getConstants()?.config
 * - TurboModule getConfig() → `{ config: env }`
 *
 * Never throws; merges all readable non-empty string values.
 */

export type NativeConfigEnv = Record<string, string>;

function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    let text = value.replace(/^\uFEFF/, '').trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }
    return text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

/** Flatten a candidate bag: either `{ KEY: "v" }` or `{ config: { KEY: "v" } }`. */
export function unwrapConfigShape(value: unknown): NativeConfigEnv {
  if (value == null || typeof value !== 'object') {
    return {};
  }
  const record = value as Record<string, unknown>;
  const nested = record.config;
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
    return asStringMap(nested as Record<string, unknown>);
  }
  // Flat env map (ignore non-string module helpers like getConfig)
  return asStringMap(record);
}

function asStringMap(record: Record<string, unknown>): NativeConfigEnv {
  const out: NativeConfigEnv = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === 'function') {
      continue;
    }
    const normalized = normalizeString(raw);
    if (normalized) {
      out[key] = normalized;
    }
  }
  return out;
}

/** Merge shapes; later sources override earlier for the same key. */
export function mergeNativeConfigShapes(shapes: unknown[]): NativeConfigEnv {
  const merged: NativeConfigEnv = {};
  for (const shape of shapes) {
    Object.assign(merged, unwrapConfigShape(shape));
  }
  return merged;
}

type ConfigModuleLike = {
  config?: unknown;
  getConfig?: () => unknown;
  getConstants?: () => unknown;
};

/**
 * Collect env from every known react-native-config access path.
 * Injectable deps keep unit tests free of the real native module.
 */
export function collectNativeConfigEnv(deps?: {
  defaultExport?: unknown;
  nativeModule?: ConfigModuleLike | null;
  turboGetConfig?: (() => unknown) | null;
}): NativeConfigEnv {
  const shapes: unknown[] = [];

  if (deps) {
    if (deps.defaultExport !== undefined) {
      shapes.push(deps.defaultExport);
    }
    const mod = deps.nativeModule;
    if (mod) {
      shapes.push(mod);
      if (typeof mod.getConstants === 'function') {
        try {
          shapes.push(mod.getConstants());
        } catch {
          // ignore
        }
      }
      if (typeof mod.getConfig === 'function') {
        try {
          shapes.push(mod.getConfig());
        } catch {
          // ignore
        }
      }
    }
    if (typeof deps.turboGetConfig === 'function') {
      try {
        shapes.push(deps.turboGetConfig());
      } catch {
        // ignore
      }
    }
    return mergeNativeConfigShapes(shapes);
  }

  // Runtime: probe all live shapes without throwing.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnConfig = require('react-native-config');
    shapes.push(rnConfig?.default ?? rnConfig);
    if (rnConfig?.Config !== undefined) {
      shapes.push(rnConfig.Config);
    }
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {NativeModules, TurboModuleRegistry} = require('react-native');
    const mod = NativeModules?.RNCConfigModule as ConfigModuleLike | undefined;
    if (mod) {
      shapes.push(mod);
      if (typeof mod.getConstants === 'function') {
        try {
          shapes.push(mod.getConstants());
        } catch {
          // ignore
        }
      }
      if (typeof mod.getConfig === 'function') {
        try {
          shapes.push(mod.getConfig());
        } catch {
          // ignore
        }
      }
    }
    try {
      const turbo = TurboModuleRegistry?.get?.('RNCConfigModule') as
        | ConfigModuleLike
        | null
        | undefined;
      if (turbo && typeof turbo.getConfig === 'function') {
        shapes.push(turbo.getConfig());
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }

  return mergeNativeConfigShapes(shapes);
}

export function readNativeConfigValue(
  env: NativeConfigEnv,
  key: string,
): string {
  return env[key] ?? '';
}
