/**
 * Baserow API Client
 * Type-safe client for Baserow REST API
 */

import {
  type BaserowRecord,
  type BaserowListResponse,
  type RecordData,
  type Filters,
} from '../types/mcp.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Configuration
// ============================================================================

interface BaserowClientConfig {
  apiToken: string;
  baseUrl: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class BaserowApiError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: unknown;
  public readonly code = 'BASEROW_API_ERROR';

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message);
    this.name = 'BaserowApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class BaserowConnectionError extends Error {
  public readonly originalError: Error;
  public readonly code = 'BASEROW_CONNECTION_ERROR';

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'BaserowConnectionError';
    this.originalError = originalError;
  }
}

// ============================================================================
// Baserow Client
// ============================================================================

export class BaserowClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: BaserowClientConfig) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Authorization': `Token ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    logger.debug(`BaserowClient initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Build URL with query parameters for filters
   */
  private buildListUrl(
    tableId: number,
    filters?: Filters,
    page?: number,
    size?: number
  ): string {
    const url = new URL(`${this.baseUrl}/api/database/rows/table/${tableId}/`);

    // Add pagination
    if (page !== undefined) {
      url.searchParams.set('page', page.toString());
    }
    if (size !== undefined) {
      url.searchParams.set('size', size.toString());
    }

    // Add filters using Baserow's filter syntax
    // Format: filter__field_name__filter_type=value
    if (filters) {
      for (const [field, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined) {
          // Use 'equal' filter type for exact matches
          // Field names with special characters need to use field IDs instead
          url.searchParams.set(`filter__${field}__equal`, String(value));
        }
      }
    }

    // Request user field names instead of IDs
    url.searchParams.set('user_field_names', 'true');

    return url.toString();
  }

  /**
   * Make an HTTP request to Baserow API
   */
  private async request<T>(
    method: string,
    url: string,
    body?: unknown
  ): Promise<T> {
    logger.debug(`Baserow API ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      let responseBody: unknown;

      if (contentType?.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      if (!response.ok) {
        logger.error(`Baserow API error: ${response.status}`, responseBody);
        throw new BaserowApiError(
          `Baserow API returned ${response.status}: ${response.statusText}`,
          response.status,
          responseBody
        );
      }

      logger.debug(`Baserow API response received`);
      return responseBody as T;
    } catch (error) {
      if (error instanceof BaserowApiError) {
        throw error;
      }

      const err = error as Error;
      logger.error(`Baserow connection error: ${err.message}`);
      throw new BaserowConnectionError(
        `Failed to connect to Baserow API: ${err.message}`,
        err
      );
    }
  }

  /**
   * List records from a table with optional filtering and pagination
   */
  async listRecords(
    tableId: number,
    filters?: Filters,
    page?: number,
    size?: number
  ): Promise<BaserowListResponse> {
    const url = this.buildListUrl(tableId, filters, page, size);
    return this.request<BaserowListResponse>('GET', url);
  }

  /**
   * Get a single record by ID
   */
  async getRecord(tableId: number, recordId: number): Promise<BaserowRecord> {
    const url = `${this.baseUrl}/api/database/rows/table/${tableId}/${recordId}/?user_field_names=true`;
    return this.request<BaserowRecord>('GET', url);
  }

  /**
   * Create a new record in a table
   */
  async createRecord(tableId: number, data: RecordData): Promise<BaserowRecord> {
    const url = `${this.baseUrl}/api/database/rows/table/${tableId}/?user_field_names=true`;
    return this.request<BaserowRecord>('POST', url, data);
  }

  /**
   * Update an existing record
   */
  async updateRecord(
    tableId: number,
    recordId: number,
    data: RecordData
  ): Promise<BaserowRecord> {
    const url = `${this.baseUrl}/api/database/rows/table/${tableId}/${recordId}/?user_field_names=true`;
    return this.request<BaserowRecord>('PATCH', url, data);
  }

  /**
   * Delete a record
   */
  async deleteRecord(tableId: number, recordId: number): Promise<void> {
    const url = `${this.baseUrl}/api/database/rows/table/${tableId}/${recordId}/`;
    await this.request<void>('DELETE', url);
  }

  /**
   * Test the connection to Baserow
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to fetch user info to validate the token
      const url = `${this.baseUrl}/api/user/`;
      await this.request<unknown>('GET', url);
      logger.info('Baserow connection test successful');
      return true;
    } catch (error) {
      logger.error('Baserow connection test failed', error);
      return false;
    }
  }
}

// ============================================================================
// Client Factory
// ============================================================================

let clientInstance: BaserowClient | null = null;

/**
 * Create or get the Baserow client instance
 */
export function getBaserowClient(): BaserowClient {
  if (clientInstance) {
    return clientInstance;
  }

  const apiToken = process.env['BASEROW_API_TOKEN'];
  if (!apiToken) {
    throw new Error('BASEROW_API_TOKEN environment variable is required');
  }

  const baseUrl = process.env['BASEROW_API_URL'] || 'https://api.baserow.io';

  clientInstance = new BaserowClient({
    apiToken,
    baseUrl,
  });

  return clientInstance;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetBaserowClient(): void {
  clientInstance = null;
}
