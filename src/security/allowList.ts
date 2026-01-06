/**
 * Security Module - Table Allow List
 * Enforces strict access control to Baserow tables
 */

import {
  ALLOWED_TABLE_NAMES,
  type AllowedTableName,
  type TableInfo,
} from '../types/mcp.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Table Configuration
// ============================================================================

interface TableConfig {
  name: AllowedTableName;
  envKey: string;
  description: string;
}

const TABLE_CONFIGS: TableConfig[] = [
  {
    name: 'manufacturing_orders',
    envKey: 'TABLE_ID_MANUFACTURING_ORDERS',
    description: 'Manufacturing Orders (MO) for tracking production lifecycle',
  },
  {
    name: 'mo_parts_usage',
    envKey: 'TABLE_ID_MO_PARTS_USAGE',
    description: 'Parts consumption records for manufacturing orders',
  },
  {
    name: 'raw_material_lots',
    envKey: 'TABLE_ID_RAW_MATERIAL_LOTS',
    description: 'Raw material lot tracking and traceability',
  },
  {
    name: 'inventory_transactions',
    envKey: 'TABLE_ID_INVENTORY_TRANSACTIONS',
    description: 'Inventory movement and transaction logs',
  },
  {
    name: 'finished_goods',
    envKey: 'TABLE_ID_FINISHED_GOODS',
    description: 'Finished product inventory tracking',
  },
  {
    name: 'cycle_counts',
    envKey: 'TABLE_ID_CYCLE_COUNTS',
    description: 'Inventory cycle count records',
  },
  {
    name: 'fg_parts_mapping',
    envKey: 'TABLE_ID_FG_PARTS_MAPPING',
    description: 'Finished Goods to Parts BOM mapping',
  },
  {
    name: 'label_inventory',
    envKey: 'TABLE_ID_LABEL_INVENTORY',
    description: 'Label inventory tracking by label code',
  },
  {
    name: 'parts',
    envKey: 'TABLE_ID_PARTS',
    description: 'Parts/Components/Raw Materials master table',
  },
];

// ============================================================================
// Allow List Manager
// ============================================================================

export class AllowListManager {
  private tableMap: Map<AllowedTableName, TableInfo> = new Map();
  private initialized = false;

  /**
   * Initialize the allow list from environment variables
   * @throws Error if required table IDs are missing
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn('AllowListManager already initialized');
      return;
    }

    const missingTables: string[] = [];

    for (const config of TABLE_CONFIGS) {
      const tableIdStr = process.env[config.envKey];

      if (!tableIdStr) {
        missingTables.push(`${config.name} (${config.envKey})`);
        continue;
      }

      const tableId = parseInt(tableIdStr, 10);

      if (isNaN(tableId) || tableId <= 0) {
        throw new Error(
          `Invalid table ID for ${config.name}: ${tableIdStr} - must be a positive integer`
        );
      }

      this.tableMap.set(config.name, {
        name: config.name,
        id: tableId,
        description: config.description,
      });

      logger.debug(`Registered table: ${config.name} -> ID ${tableId}`);
    }

    if (missingTables.length > 0) {
      logger.warn(
        `Missing table configurations (these tables will be unavailable): ${missingTables.join(', ')}`
      );
    }

    if (this.tableMap.size === 0) {
      throw new Error(
        'No tables configured. Please set at least one TABLE_ID_* environment variable.'
      );
    }

    this.initialized = true;
    logger.info(`AllowListManager initialized with ${this.tableMap.size} tables`);
  }

  /**
   * Check if a table name is in the allow list
   */
  isTableAllowed(tableName: string): tableName is AllowedTableName {
    if (!this.initialized) {
      throw new Error('AllowListManager not initialized');
    }

    const isAllowed = ALLOWED_TABLE_NAMES.includes(tableName as AllowedTableName);
    const isConfigured = this.tableMap.has(tableName as AllowedTableName);

    if (!isAllowed) {
      logger.warn(`Access denied: Table "${tableName}" is not in the allow list`);
    } else if (!isConfigured) {
      logger.warn(`Access denied: Table "${tableName}" is not configured`);
    }

    return isAllowed && isConfigured;
  }

  /**
   * Get the Baserow table ID for an allowed table name
   * @throws Error if table is not allowed or not found
   */
  getTableId(tableName: string): number {
    if (!this.isTableAllowed(tableName)) {
      throw new UnauthorizedTableAccessError(tableName);
    }

    const tableInfo = this.tableMap.get(tableName);
    if (!tableInfo) {
      throw new UnauthorizedTableAccessError(tableName);
    }

    return tableInfo.id;
  }

  /**
   * Get information about a specific table
   */
  getTableInfo(tableName: string): TableInfo | undefined {
    if (!this.isTableAllowed(tableName)) {
      return undefined;
    }
    return this.tableMap.get(tableName as AllowedTableName);
  }

  /**
   * Get all allowed tables with their info
   */
  getAllowedTables(): TableInfo[] {
    if (!this.initialized) {
      throw new Error('AllowListManager not initialized');
    }
    return Array.from(this.tableMap.values());
  }

  /**
   * Get the count of configured tables
   */
  getTableCount(): number {
    return this.tableMap.size;
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

export class UnauthorizedTableAccessError extends Error {
  public readonly tableName: string;
  public readonly code = 'UNAUTHORIZED_TABLE_ACCESS';

  constructor(tableName: string) {
    super(`Access denied: Table "${tableName}" is not authorized for access`);
    this.name = 'UnauthorizedTableAccessError';
    this.tableName = tableName;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const allowListManager = new AllowListManager();
