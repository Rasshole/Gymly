/**
 * Opens Shopify checkout (or other shop HTTPS URLs) in the native in-app browser:
 * SFSafariViewController (iOS) / Chrome Custom Tabs (Android).
 * Falls back to the system browser when the in-app browser is unavailable.
 * Never uses WKWebView / RN WebView for payment.
 * Never logs full checkout URLs (session keys live in the query string).
 */
import {Alert, Linking, Platform} from 'react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import {rt} from '@/i18n/runtimeLanguage';
import {validateProductDestinationUrl} from './validateProductDestinationUrl';
import {redactExternalUrlForLog} from './openExternalHttpsUrl';

export type OpenShopCheckoutBrowserResult =
  | {ok: true; method: 'in_app'; dismissed: true}
  | {ok: true; method: 'external'}
  | {ok: false; reason: 'invalid' | 'insecure' | 'open_failed'};

/** Injectable port — unit tests supply fakes; production uses SFSafariView / Custom Tabs. */
export type ShopCheckoutBrowserPort = {
  isInAppAvailable: () => Promise<boolean>;
  openInApp: (url: string) => Promise<'dismissed'>;
  openExternal: (url: string) => Promise<void>;
};

const TOOLBAR = '#8B5CF6';
const CONTROL = '#FFFFFF';

export const defaultShopCheckoutBrowserPort: ShopCheckoutBrowserPort = {
  async isInAppAvailable() {
    try {
      return await InAppBrowser.isAvailable();
    } catch {
      return false;
    }
  },
  async openInApp(url: string) {
    await InAppBrowser.open(url, {
      // iOS — SFSafariViewController modal with Done
      dismissButtonStyle: 'done',
      preferredBarTintColor: TOOLBAR,
      preferredControlTintColor: CONTROL,
      readerMode: false,
      animated: true,
      modalPresentationStyle: 'pageSheet',
      modalEnabled: true,
      enableBarCollapsing: false,
      ephemeralWebSession: false,
      // Android — Chrome Custom Tabs
      showTitle: true,
      toolbarColor: TOOLBAR,
      secondaryToolbarColor: TOOLBAR,
      enableUrlBarHiding: true,
      enableDefaultShare: false,
      forceCloseOnRedirection: false,
      hasBackButton: true,
      showInRecents: true,
    });
    return 'dismissed';
  },
  async openExternal(url: string) {
    await Linking.openURL(url);
  },
};

function warnOpenFailure(url: string, err: unknown): void {
  if (!__DEV__) {
    return;
  }
  console.warn(
    '[shop] checkout browser open failed',
    redactExternalUrlForLog(url),
    Platform.OS,
    err instanceof Error ? err.message : 'unknown',
  );
}

/**
 * Prefer native in-app browser; fall back to system browser; alert if both fail.
 * Closing the in-app browser resolves with dismissed:true (user stays on product detail).
 */
export async function openShopCheckoutBrowser(
  url: string,
  port: ShopCheckoutBrowserPort = defaultShopCheckoutBrowserPort,
): Promise<OpenShopCheckoutBrowserResult> {
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

  const safeUrl = validated.url;

  let inAppOk = false;
  try {
    inAppOk = await port.isInAppAvailable();
  } catch (err) {
    warnOpenFailure(safeUrl, err);
    inAppOk = false;
  }

  if (inAppOk) {
    try {
      await port.openInApp(safeUrl);
      return {ok: true, method: 'in_app', dismissed: true};
    } catch (err) {
      warnOpenFailure(safeUrl, err);
      // Fall through to system browser.
    }
  }

  try {
    await port.openExternal(safeUrl);
    return {ok: true, method: 'external'};
  } catch (err) {
    warnOpenFailure(safeUrl, err);
    Alert.alert(
      rt('shop.errors.destinationTitle'),
      rt('shop.errors.checkoutBrowserUnavailable'),
    );
    return {ok: false, reason: 'open_failed'};
  }
}
