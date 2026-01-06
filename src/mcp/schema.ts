/**
 * MCP Schema Definitions
 * Tool schemas for MCP server registration
 */

import { ALLOWED_TABLE_NAMES } from '../types/mcp.js';

// ============================================================================
// Tool Definitions for MCP
// ============================================================================

export const TOOL_DEFINITIONS = {
  list_tables: {
    name: 'list_tables',
    description: 'List all available Baserow tables that can be accessed through this MCP server. Returns table names, IDs, and descriptions.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },

  read: {
    name: 'read',
    description: `Read records from a Baserow table with optional filtering and pagination.
Available tables: ${ALLOWED_TABLE_NAMES.join(', ')}.
Filters are applied as exact matches on field names.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `The table name to read from. Must be one of: ${ALLOWED_TABLE_NAMES.join(', ')}`,
          enum: ALLOWED_TABLE_NAMES,
        },
        filters: {
          type: 'object',
          description: 'Optional filters to apply. Keys are field names, values are the values to match exactly.',
          additionalProperties: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' },
            ],
          },
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-based). Default: 1',
          minimum: 1,
        },
        size: {
          type: 'number',
          description: 'Number of records per page. Default: 100, Max: 200',
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['table'],
    },
  },

  create: {
    name: 'create',
    description: `Create a new record in a Baserow table.
Available tables: ${ALLOWED_TABLE_NAMES.join(', ')}.
The data object should contain field names as keys and their values.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `The table name to create record in. Must be one of: ${ALLOWED_TABLE_NAMES.join(', ')}`,
          enum: ALLOWED_TABLE_NAMES,
        },
        data: {
          type: 'object',
          description: 'The record data. Keys are field names, values are the field values.',
          additionalProperties: true,
        },
      },
      required: ['table', 'data'],
    },
  },

  update: {
    name: 'update',
    description: `Update an existing record in a Baserow table.
Available tables: ${ALLOWED_TABLE_NAMES.join(', ')}.
Only the fields provided in data will be updated; other fields remain unchanged.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `The table name containing the record. Must be one of: ${ALLOWED_TABLE_NAMES.join(', ')}`,
          enum: ALLOWED_TABLE_NAMES,
        },
        record_id: {
          type: 'number',
          description: 'The ID of the record to update',
          minimum: 1,
        },
        data: {
          type: 'object',
          description: 'The fields to update. Keys are field names, values are the new values.',
          additionalProperties: true,
        },
      },
      required: ['table', 'record_id', 'data'],
    },
  },

  delete: {
    name: 'delete',
    description: `Delete a record from a Baserow table.
Available tables: ${ALLOWED_TABLE_NAMES.join(', ')}.
This action is permanent and cannot be undone.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `The table name containing the record. Must be one of: ${ALLOWED_TABLE_NAMES.join(', ')}`,
          enum: ALLOWED_TABLE_NAMES,
        },
        record_id: {
          type: 'number',
          description: 'The ID of the record to delete',
          minimum: 1,
        },
      },
      required: ['table', 'record_id'],
    },
  },

  batch_create: {
    name: 'batch_create',
    description: `Create multiple records in a Baserow table in a single operation.
This is much faster than creating records one by one.
Available tables: ${ALLOWED_TABLE_NAMES.join(', ')}.
Maximum 50 records per batch.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `The table name to create records in. Must be one of: ${ALLOWED_TABLE_NAMES.join(', ')}`,
          enum: ALLOWED_TABLE_NAMES,
        },
        records: {
          type: 'array',
          description: 'Array of record data objects to create. Each object contains field names as keys.',
          items: {
            type: 'object',
            additionalProperties: true,
          },
          maxItems: 50,
        },
      },
      required: ['table', 'records'],
    },
  },

  get_bom: {
    name: 'get_bom',
    description: `Get the Bill of Materials (BOM) for a Finished Good.
Returns all parts required to manufacture the product with their Part IDs and quantities.
Use this to find Part IDs before calling process_bpr.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        fg_id: {
          type: 'number',
          description: 'The Finished Goods ID to get BOM for',
        },
        isku: {
          type: 'string',
          description: 'Alternative: search by iSKU name (e.g., "TN-Liquid-Stevia-Drops-8oz")',
        },
      },
      required: [],
    },
  },

  process_bpr: {
    name: 'process_bpr',
    description: `Process a complete BPR (Batch Production Record) in a single operation.
This tool will:
1. Find the Manufacturing Order by MO Number
2. Lookup Part IDs and FG IDs automatically from BOM mapping IDs
3. Create all parts usage records in mo_parts_usage
4. Update the MO status to Closed with Actual-Usage method
Returns a summary of all operations performed.

IMPORTANT: Use bom_id (mapping_id from fg_parts_mapping returned by get_bom) instead of part_id.
The Part ID and FG ID will be looked up automatically from the BOM mapping.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        mo_number: {
          type: 'string',
          description: 'The MO Number (e.g., "MO-121525-11")',
        },
        completion_date: {
          type: 'string',
          description: 'The completion date in YYYY-MM-DD format',
        },
        gross_produced: {
          type: 'string',
          description: 'The gross quantity produced',
        },
        parts_usage: {
          type: 'array',
          description: 'Array of parts used in production. Use bom_id from get_bom response.',
          items: {
            type: 'object',
            properties: {
              bom_id: {
                type: 'number',
                description: 'The BOM mapping ID (mapping_id from get_bom response). Part ID and FG ID are looked up automatically.',
              },
              quantity: {
                type: 'number',
                description: 'Actual quantity used',
              },
              lot_id: {
                type: 'number',
                description: 'Optional: RM Lot Inventory ID (if you know the exact ID)',
              },
              lot_number: {
                type: 'string',
                description: 'Optional: Internal Lot Number - will be looked up automatically in raw_material_lots',
              },
              label_id: {
                type: 'number',
                description: 'Optional: Label Inventory ID (if you know the exact ID)',
              },
              label_code: {
                type: 'string',
                description: 'Optional: Label Part BOM ID (e.g., "LABL-4x6-WHYZ-ALCAR-90g") - will be looked up automatically in label_inventory',
              },
              waste: {
                type: 'number',
                description: 'Optional: Waste/spillage amount',
              },
              notes: {
                type: 'string',
                description: 'Optional: Additional notes',
              },
            },
            required: ['bom_id', 'quantity'],
          },
        },
        entered_by: {
          type: 'string',
          description: 'Who entered this data (default: "Alexa via Claude")',
        },
      },
      required: ['mo_number', 'completion_date', 'gross_produced', 'parts_usage'],
    },
  },

  search_parts: {
    name: 'search_parts',
    description: `Search for Part IDs by part name.
This tool searches the parts table directly to find Part IDs for given part names.
Works for ALL parts including new ones not yet in any BOM.
Use this when you need to find Part IDs for creating BOM entries in fg_parts_mapping.
Returns the Part ID for each search term found.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        search_terms: {
          type: 'array',
          description: 'Array of part names to search for (e.g., ["PCH-4oz-Stndup-WH-Matt", "LABL-NS-3.75x3-Stevia-Powder-4oz-Front"])',
          items: {
            type: 'string',
          },
        },
      },
      required: ['search_terms'],
    },
  },
};

/**
 * Get all tool definitions as an array
 */
export function getToolDefinitions() {
  return Object.values(TOOL_DEFINITIONS);
}
