import {Share} from 'react-native';

/**
 * Copy text to the clipboard when available; fall back to the native share sheet.
 */
export async function copyToClipboard(
  text: string,
): Promise<'copied' | 'shared'> {
  const value = text.trim();
  if (!value) {
    throw new Error('EMPTY_CLIPBOARD_TEXT');
  }
  try {
    // RN still ships Clipboard under Libraries in 0.77; avoid a new dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native/Libraries/Components/Clipboard/Clipboard');
    const Clipboard = mod?.default ?? mod;
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(value);
      return 'copied';
    }
  } catch {
    /* fall through */
  }
  await Share.share({message: value});
  return 'shared';
}
