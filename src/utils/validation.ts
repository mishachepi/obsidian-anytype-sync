import { AUTH_CODE_LENGTH } from '../constants';

/**
 * Simple validation utilities for user inputs
 */
export class Validation {
  static isValidSpaceId(spaceId: string): boolean {
    return !!(spaceId && typeof spaceId === 'string' && spaceId.trim().length > 0);
  }

  static isValidApiKey(apiKey: string): boolean {
    return !!(apiKey && typeof apiKey === 'string' && apiKey.trim().length > 10);
  }

  static isValidAuthCode(code: string): boolean {
    return !!(code && code.length === AUTH_CODE_LENGTH && /^\d{4}$/.test(code));
  }

  static isValidAnyTypeId(id: string): boolean {
    return !!(id && typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
  }

  /**
   * Unified validation for API parameters
   * Consolidates validation logic from both services
   */
  static validateApiInputs(spaceId: string, apiKey: string): void {
    if (!this.isValidSpaceId(spaceId)) {
      throw new Error('Invalid space ID provided');
    }
    if (!this.isValidApiKey(apiKey)) {
      throw new Error('Invalid API key provided');
    }
  }
}