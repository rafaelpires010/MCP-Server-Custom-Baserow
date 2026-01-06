/**
 * Baserow Tables Service
 * High-level operations on Baserow tables with security enforcement
 */

import { getBaserowClient, type BaserowClient } from './client.js';
import {
  allowListManager,
  UnauthorizedTableAccessError,
} from '../security/allowList.js';
import {
  type AllowedTableName,
  type BaserowRecord,
  type BaserowListResponse,
  type RecordData,
  type Filters,
  type TableInfo,
} from '../types/mcp.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Tables Service
// ============================================================================

export class TablesService {
  private client: BaserowClient;

  constructor() {
    this.client = getBaserowClient();
  }

  /**
   * Validate table access and get table ID
   * @throws UnauthorizedTableAccessError if table is not allowed
   */
  private validateAndGetTableId(tableName: string): number {
    if (!allowListManager.isTableAllowed(tableName)) {
      throw new UnauthorizedTableAccessError(tableName);
    }
    return allowListManager.getTableId(tableName);
  }

  /**
   * List all allowed tables
   */
  listAllowedTables(): TableInfo[] {
    return allowListManager.getAllowedTables();
  }

  /**
   * Read records from a table with optional filters and pagination
   */
  async readRecords(
    tableName: string,
    filters?: Filters,
    page?: number,
    size?: number
  ): Promise<BaserowListResponse> {
    const tableId = this.validateAndGetTableId(tableName);

    logger.info(`Reading records from ${tableName} (ID: ${tableId})`, {
      filters,
      page,
      size,
    });

    const response = await this.client.listRecords(tableId, filters, page, size);

    logger.info(`Retrieved ${response.results.length} of ${response.count} total records`);

    return response;
  }

  /**
   * Get a single record by ID
   */
  async getRecord(tableName: string, recordId: number): Promise<BaserowRecord> {
    const tableId = this.validateAndGetTableId(tableName);

    logger.info(`Getting record ${recordId} from ${tableName} (ID: ${tableId})`);

    return this.client.getRecord(tableId, recordId);
  }

  /**
   * Create a new record in a table
   */
  async createRecord(
    tableName: string,
    data: RecordData
  ): Promise<BaserowRecord> {
    const tableId = this.validateAndGetTableId(tableName);

    logger.info(`Creating record in ${tableName} (ID: ${tableId})`, { data });

    const record = await this.client.createRecord(tableId, data);

    logger.info(`Created record with ID: ${record.id}`);

    return record;
  }

  /**
   * Update an existing record
   */
  async updateRecord(
    tableName: string,
    recordId: number,
    data: RecordData
  ): Promise<BaserowRecord> {
    const tableId = this.validateAndGetTableId(tableName);

    logger.info(`Updating record ${recordId} in ${tableName} (ID: ${tableId})`, {
      data,
    });

    const record = await this.client.updateRecord(tableId, recordId, data);

    logger.info(`Updated record ${recordId} successfully`);

    return record;
  }

  /**
   * Delete a record
   */
  async deleteRecord(tableName: string, recordId: number): Promise<void> {
    const tableId = this.validateAndGetTableId(tableName);

    logger.info(`Deleting record ${recordId} from ${tableName} (ID: ${tableId})`);

    await this.client.deleteRecord(tableId, recordId);

    logger.info(`Deleted record ${recordId} successfully`);
  }

  /**
   * Test the connection to Baserow
   */
  async testConnection(): Promise<boolean> {
    return this.client.testConnection();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: TablesService | null = null;

export function getTablesService(): TablesService {
  if (!serviceInstance) {
    serviceInstance = new TablesService();
  }
  return serviceInstance;
}

export function resetTablesService(): void {
  serviceInstance = null;
}
