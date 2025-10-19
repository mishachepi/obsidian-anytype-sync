import { requestUrl } from 'obsidian';

/**
 * Adapter that bridges SDK's fetch-based requests to Obsidian's requestUrl()
 * This ensures CORS compatibility and proper request handling within Obsidian
 */
export class ObsidianFetchAdapter {
  /**
   * Replace global fetch with Obsidian-compatible version
   */
  static install(): void {
    // Store original fetch for potential restoration
    const originalFetch = globalThis.fetch;
    
    // Replace with Obsidian-compatible version
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return ObsidianFetchAdapter.obsidianFetch(input, init);
    };

    // Store reference to original for cleanup
    (globalThis as any)._originalFetch = originalFetch;
  }

  /**
   * Restore original fetch implementation
   */
  static uninstall(): void {
    if ((globalThis as any)._originalFetch) {
      globalThis.fetch = (globalThis as any)._originalFetch;
      delete (globalThis as any)._originalFetch;
    }
  }

  /**
   * Convert fetch request to Obsidian requestUrl call
   */
  private static async obsidianFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method?.toUpperCase() || 'GET';
    
    // Convert fetch headers to requestUrl format
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    // Handle request body
    let body: string | undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else if (init.body instanceof FormData) {
        // Convert FormData to JSON for API requests
        const formObject: Record<string, any> = {};
        init.body.forEach((value, key) => {
          formObject[key] = value;
        });
        body = JSON.stringify(formObject);
        headers['Content-Type'] = 'application/json';
      } else {
        body = init.body.toString();
      }
    }

    try {
      const response = await requestUrl({
        url,
        method: method as any,
        headers,
        body,
        throw: false
      });

      // Convert Obsidian response to fetch Response
      return new Response(response.arrayBuffer, {
        status: response.status,
        statusText: response.status.toString(),
        headers: new Headers(response.headers || {})
      });

    } catch (error) {
      // Convert error to fetch-compatible error
      throw new TypeError(`Failed to fetch: ${error.message}`);
    }
  }
}