import { Logger } from './logger';

/**
 * Simple encoding utility for local storage of API keys.
 * This is basic Base64 encoding for obfuscation only.
 */
export class SimpleEncoding {
  private static key = 'anytype-obsidian-plugin-key-2024';
  private static logger = new Logger();

  static encode(text: string): string {
    if (!text) return '';
    try {
      const encoded = btoa(unescape(encodeURIComponent(text + this.key)));
      this.logger.debug('Successfully encoded API key');
      return encoded;
    } catch (error) {
      this.logger.error('Encoding failed:', error);
      return text;
    }
  }

  static decode(encoded: string): string {
    if (!encoded) return '';
    try {
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const keyIndex = decoded.lastIndexOf(this.key);
      if (keyIndex === -1) {
        this.logger.warn('Invalid encoded data - key not found');
        return '';
      }
      const result = decoded.substring(0, keyIndex);
      this.logger.debug('Successfully decoded API key');
      return result;
    } catch (error) {
      this.logger.error('Decoding failed:', error);
      return '';
    }
  }
}