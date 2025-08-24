import { requestUrl } from 'obsidian';
import { Logger } from '../utils/logger';
import { ANYTYPE_API_URL, ANYTYPE_API_VERSION } from '../constants';

// Request/Response interfaces matching OpenAPI spec
export interface CreateChallengeRequest {
  app_name: string;
}

export interface CreateChallengeResponse {
  challenge: {
    challenge_id: string;
    expires_at: string;
  };
}

export interface CreateApiKeyRequest {
  challenge_id: string;
  code: string;
}

export interface CreateApiKeyResponse {
  api_key: {
    api_key: string;
    expires_at: string;
  };
}

// Error interfaces
export interface ValidationError {
  error: string;
  details?: string;
}

export interface ServerError {
  error: string;
  message?: string;
}

export class AnyTypeAuthService {
  private baseUrl = ANYTYPE_API_URL;
  private appName = 'obsidian-anytype-sync';
  private apiVersion = ANYTYPE_API_VERSION;
  private logger = new Logger();

  async createChallenge(): Promise<CreateChallengeResponse['challenge']> {
    const endpoint = '/v1/auth/challenges';
    const requestData: CreateChallengeRequest = {
      app_name: this.appName
    };

    try {
      const response = await requestUrl({
        url: `${this.baseUrl}${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Anytype-Version': this.apiVersion
        },
        body: JSON.stringify(requestData),
        throw: false
      });

      if (response.status === 400) {
        const error: ValidationError = response.json;
        throw new Error(`Validation error: ${error.error}${error.details ? ' - ' + error.details : ''}`);
      }

      if (response.status === 500) {
        const error: ServerError = response.json;
        throw new Error(`Server error: ${error.error}${error.message ? ' - ' + error.message : ''}`);
      }

      if (response.status !== 201) {
        throw new Error(`Unexpected response status: ${response.status}`);
      }

      const result = response.json;
      this.logger.debug('Challenge API Response:', JSON.stringify(result, null, 2));
      
      // Check if response has the expected structure
      if (!result) {
        throw new Error('Empty response from challenge API');
      }
      
      // Try different possible response formats
      if (result.challenge && result.challenge.challenge_id) {
        // Expected format: { challenge: { challenge_id: "...", expires_at: "..." } }
        return result.challenge;
      } else if (result.challenge_id) {
        // Alternative format: { challenge_id: "...", expires_at: "..." }
        return result;
      } else {
        throw new Error(`Invalid challenge response format. Got: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      if (error.message.includes('Validation error') || error.message.includes('Server error')) {
        throw error;
      }
      throw new Error(`Failed to create challenge: ${error.message}`);
    }
  }

  async createApiKey(challengeId: string, code: string): Promise<CreateApiKeyResponse['api_key']> {
    const endpoint = '/v1/auth/api_keys';
    const requestData: CreateApiKeyRequest = {
      challenge_id: challengeId,
      code: code
    };

    try {
      const response = await requestUrl({
        url: `${this.baseUrl}${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Anytype-Version': this.apiVersion
        },
        body: JSON.stringify(requestData),
        throw: false
      });

      if (response.status === 400) {
        const error: ValidationError = response.json;
        throw new Error(`Invalid code or challenge: ${error.error}${error.details ? ' - ' + error.details : ''}`);
      }

      if (response.status === 500) {
        const error: ServerError = response.json;
        throw new Error(`Server error: ${error.error}${error.message ? ' - ' + error.message : ''}`);
      }

      if (response.status !== 201) {
        throw new Error(`Unexpected response status: ${response.status}`);
      }

      const result = response.json;
      this.logger.debug('API Key Response:', JSON.stringify(result, null, 2));
      
      // Check if response has the expected structure
      if (!result) {
        throw new Error('Empty response from API key creation');
      }
      
      // Try different possible response formats
      if (result.api_key && result.api_key.api_key) {
        // Expected format: { api_key: { api_key: "...", expires_at: "..." } }
        return result.api_key;
      } else if (result.api_key && typeof result.api_key === 'string') {
        // Alternative format: { api_key: "actual_key_string" }
        return { api_key: result.api_key, expires_at: result.expires_at };
      } else if (typeof result === 'string') {
        // Alternative format: just the key as a string
        return { api_key: result, expires_at: '' };
      } else {
        throw new Error(`Invalid API key response format. Got: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      if (error.message.includes('Invalid code') || error.message.includes('Server error')) {
        throw error;
      }
      throw new Error(`Failed to create API key: ${error.message}`);
    }
  }
}