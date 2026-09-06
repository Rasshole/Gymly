/**
 * Opens a validated HTTPS URL in the system browser / default handler.
 *
 * Do not gate https opens on Linking.canOpenURL — on iOS it often returns false
 * (missing LSApplicationQueriesSchemes for http/https, or non-Safari default browser)
 * even when Linking.openURL would succeed. That made Buy now appear to do nothing
 * after a successful cartCreate.
 */
import {Alert, Linking} from 'react-native';
import {rt} from '@/i18n/runtimeLanguage';
import {validateProductDestinationUrl} from './validateProductDestinationUrl';

export type OpenExternalHttpsResult =
  | {ok: true}
  | {ok: false; reason: 'invalid' | 'insecure' | 'open_failed'};

/** Redact checkout/query tokens for safe diagnostics. */
export function redactExternalUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export async function openExternalHttpsUrl(
  url: string,
): Promise<OpenExternalHttpsResult> {
  const validated = validateProductDestinationUrl(url);
  if (!validated.ok) {
    Alert.alert(
      rt('shop.errors.destinationTitle'),
      rt('shop.errors.destinationInvalid'),
    );
    return {
      ok: false,
      reason: validated.reason === 'insecure' ? 'insecure' : 'invalid',
    };
  }

  try {
    await Linking.openURL(validated.url);
    return {ok: true};
  } catch (err) {
    if (__DEV__) {
      // Never log full checkout URLs (may include session tokens in query).
      console.warn(
        '[shop] openExternalHttpsUrl failed',
        redactExternalUrlForLog(validated.url),
        err instanceof Error ? err.message : 'unknown',
      );
    }
    Alert.alert(
      rt('shop.errors.destinationTitle'),
      rt('shop.errors.destinationOpenFailed'),
    );
    return {ok: false, reason: 'open_failed'};
  }
}
