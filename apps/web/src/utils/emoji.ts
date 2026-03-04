import * as emoji from 'node-emoji';

/**
 * Replace :shortcode: patterns with Unicode emoji.
 * Falls back to the original text when the shortcode is unknown.
 */
export function replaceEmojiShortcodes(text: string): string {
  return emoji.emojify(text, (code: string) => `:${code}:`);
}
