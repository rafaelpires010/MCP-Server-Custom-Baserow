/**
 * Railway MCP Server
 * HTTP server with SSE support for remote MCP connections
 */

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// Configuration
// ============================================================================

const BASEROW_API_URL = process.env.BASEROW_API_URL || 'https://api.baserow.io';
const BASEROW_API_TOKEN = process.env.BASEROW_API_TOKEN;

const TABLE_MAP: Record<string, string> = {
  manufacturing_orders: process.env.TABLE_ID_MANUFACTURING_ORDERS || '',
  finished_goods: process.env.TABLE_ID_FINISHED_GOODS || '',
  mo_parts_usage: process.env.TABLE_ID_MO_PARTS_USAGE || '',
  fg_parts_mapping: process.env.TABLE_ID_FG_PARTS_MAPPING || '',
  raw_material_lots: process.env.TABLE_ID_RAW_MATERIAL_LOTS || '',
  label_inventory: process.env.TABLE_ID_LABEL_INVENTORY || '',
  parts: process.env.TABLE_ID_PARTS || '',
};

// ============================================================================
// Baserow Client
// ============================================================================

interface BaserowRecord {
  id: number;
  order: string;
  [key: string]: unknown;
}

interface BaserowListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: BaserowRecord[];
}

async function baserowRequest<T>(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<T> {
  const url = `${BASEROW_API_URL}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Token ${BASEROW_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Baserow API Error ${response.status}: ${errorText}`);
  }

  if (method === 'DELETE') {
    return {} as T;
  }

  return response.json();
}

async function listRecords(
  tableId: string,
  filters?: Record<string, string>,
  page = 1,
  size = 100
): Promise<BaserowListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
    user_field_names: 'true',
  });

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      params.append(`filter__${key}__contains`, value);
    }
  }

  return baserowRequest<BaserowListResponse>(
    'GET',
    `/api/database/rows/table/${tableId}/?${params.toString()}`
  );
}

async function createRecord(
  tableId: string,
  data: Record<string, unknown>
): Promise<BaserowRecord> {
  return baserowRequest<BaserowRecord>(
    'POST',
    `/api/database/rows/table/${tableId}/?user_field_names=true`,
    data
  );
}

async function updateRecord(
  tableId: string,
  recordId: number,
  data: Record<string, unknown>
): Promise<BaserowRecord> {
  return baserowRequest<BaserowRecord>(
    'PATCH',
    `/api/database/rows/table/${tableId}/${recordId}/?user_field_names=true`,
    data
  );
}

async function deleteRecord(tableId: string, recordId: number): Promise<void> {
  await baserowRequest<void>(
    'DELETE',
    `/api/database/rows/table/${tableId}/${recordId}/`
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTableId(tableName: string): string {
  const tableId = TABLE_MAP[tableName];
  if (!tableId) {
    throw new Error(`Unknown table: ${tableName}. Available: ${Object.keys(TABLE_MAP).join(', ')}`);
  }
  return tableId;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS = [
  {
    name: 'list_tables',
    description: 'List all available Baserow tables',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read',
    description: 'Read records from a Baserow table',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        filters: { type: 'object', description: 'Optional filters' },
        page: { type: 'number', description: 'Page number', default: 1 },
        size: { type: 'number', description: 'Page size', default: 25 },
      },
      required: ['table'],
    },
  },
  {
    name: 'create',
    description: 'Create a new record in a Baserow table',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        data: { type: 'object', description: 'Record data' },
      },
      required: ['table', 'data'],
    },
  },
  {
    name: 'update',
    description: 'Update a record in a Baserow table',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        record_id: { type: 'number', description: 'Record ID' },
        data: { type: 'object', description: 'Data to update' },
      },
      required: ['table', 'record_id', 'data'],
    },
  },
  {
    name: 'delete',
    description: 'Delete a record from a Baserow table',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        record_id: { type: 'number', description: 'Record ID' },
      },
      required: ['table', 'record_id'],
    },
  },
  {
    name: 'search_parts',
    description: 'Search for parts by BOM ID in the parts table',
    inputSchema: {
      type: 'object',
      properties: {
        search_terms: { type: 'array', items: { type: 'string' }, description: 'Array of BOM IDs to search' },
      },
      required: ['search_terms'],
    },
  },
  {
    name: 'get_bom',
    description: 'Get Bill of Materials for a Finished Good',
    inputSchema: {
      type: 'object',
      properties: {
        fg_id: { type: 'number', description: 'Finished Good ID' },
        isku: { type: 'string', description: 'Finished Good iSKU' },
      },
      required: [],
    },
  },
  {
    name: 'process_bpr',
    description: 'Process a Batch Production Record - creates parts usage and closes MO',
    inputSchema: {
      type: 'object',
      properties: {
        mo_number: { type: 'string', description: 'Manufacturing Order number' },
        completion_date: { type: 'string', description: 'Completion date (YYYY-MM-DD)' },
        gross_produced: { type: 'string', description: 'Gross quantity produced' },
        parts_usage: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              bom_id: { type: 'number' },
              quantity: { type: 'number' },
              lot_id: { type: 'number' },
              lot_number: { type: 'string' },
              label_id: { type: 'number' },
              label_code: { type: 'string' },
              waste: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['bom_id', 'quantity'],
          },
        },
        entered_by: { type: 'string', description: 'Who entered the data' },
      },
      required: ['mo_number', 'completion_date', 'gross_produced', 'parts_usage'],
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_tables':
      return {
        success: true,
        data: {
          tables: Object.entries(TABLE_MAP)
            .filter(([_, id]) => id)
            .map(([name, table_id]) => ({ name, table_id })),
        },
      };

    case 'read': {
      const tableId = getTableId(args.table as string);
      const response = await listRecords(
        tableId,
        args.filters as Record<string, string>,
        (args.page as number) || 1,
        (args.size as number) || 25
      );
      return { success: true, data: response };
    }

    case 'create': {
      const tableId = getTableId(args.table as string);
      const record = await createRecord(tableId, args.data as Record<string, unknown>);
      return { success: true, data: record };
    }

    case 'update': {
      const tableId = getTableId(args.table as string);
      const record = await updateRecord(
        tableId,
        args.record_id as number,
        args.data as Record<string, unknown>
      );
      return { success: true, data: record };
    }

    case 'delete': {
      const tableId = getTableId(args.table as string);
      await deleteRecord(tableId, args.record_id as number);
      return { success: true, data: { deleted: true, record_id: args.record_id } };
    }

    case 'search_parts': {
      const searchTerms = args.search_terms as string[];
      const tableId = getTableId('parts');
      const partNameToId = new Map<string, { part_id: number; part_name: string }>();

      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 50) {
        const response = await listRecords(tableId, undefined, page, 200);

        for (const part of response.results) {
          const partName = (part['BOM ID'] || part['Name'] || part['Part Name'] || '') as string;
          if (partName) {
            partNameToId.set(partName.toLowerCase(), { part_id: part.id, part_name: partName });
          }
        }

        hasMore = response.next !== null && response.results.length > 0;
        page++;
      }

      const results = [];
      const notFound = [];

      for (const term of searchTerms) {
        const termLower = term.toLowerCase();
        let found = partNameToId.get(termLower);

        if (!found) {
          for (const [name, info] of partNameToId) {
            if (name.includes(termLower) || termLower.includes(name)) {
              found = info;
              break;
            }
          }
        }

        if (found) {
          results.push({ part_id: found.part_id, part_name: found.part_name, search_term: term, found: true });
        } else {
          results.push({ part_id: 0, part_name: '', search_term: term, found: false });
          notFound.push(term);
        }
      }

      return { success: true, data: { results, found_count: results.filter(r => r.found).length, not_found: notFound } };
    }

    case 'get_bom': {
      let targetFgId = args.fg_id as number | undefined;
      let targetIsku = (args.isku as string) || '';

      if (!targetFgId && args.isku) {
        const fgResponse = await listRecords(getTableId('finished_goods'), { 'iSKU': args.isku as string }, 1, 1);
        const fg = fgResponse.results[0];
        if (!fg) {
          return { success: false, error: { code: 'FG_NOT_FOUND', message: `FG with iSKU "${args.isku}" not found` } };
        }
        targetFgId = fg.id;
        targetIsku = args.isku as string;
      }

      if (!targetFgId) {
        return { success: false, error: { code: 'INVALID_REQUEST', message: 'Either fg_id or isku required' } };
      }

      const allMappings = await listRecords(getTableId('fg_parts_mapping'), undefined, 1, 200);
      const bomItems = [];

      for (const mapping of allMappings.results) {
        const finishedGood = mapping['Finished Good'] as Array<{ id: number; value: string }> | undefined;

        if (finishedGood && finishedGood.length > 0 && finishedGood[0]?.id === targetFgId) {
          const part = mapping['Part'] as Array<{ id: number; value: string }> | undefined;
          const partRole = mapping['Part Role'] as { value: string } | undefined;

          if (part && part.length > 0) {
            bomItems.push({
              mapping_id: mapping.id,
              part_id: part[0]?.id || 0,
              part_name: part[0]?.value || 'Unknown',
              quantity_per_unit: parseFloat(String(mapping['Quantity'] || '0')),
              part_role: partRole?.value || 'Unknown',
            });
          }

          if (!targetIsku && finishedGood[0]?.value) {
            targetIsku = finishedGood[0].value;
          }
        }
      }

      return { success: true, data: { fg_id: targetFgId, fg_isku: targetIsku, parts: bomItems, total_parts: bomItems.length } };
    }

    case 'process_bpr': {
      const moNumber = args.mo_number as string;
      const completionDate = args.completion_date as string;
      const grossProduced = args.gross_produced as string;
      const partsUsage = args.parts_usage as Array<{
        bom_id: number;
        quantity: number;
        lot_id?: number;
        lot_number?: string;
        label_id?: number;
        label_code?: string;
        waste?: number;
        notes?: string;
      }>;
      const enteredBy = (args.entered_by as string) || 'Alexa via Claude';

      const MO_STATUS_CLOSED = 4554566;
      const DEDUCTION_METHOD_ACTUAL_USAGE = 4669016;

      // Find MO
      const moResponse = await listRecords(getTableId('manufacturing_orders'), { 'MO Number': moNumber }, 1, 1);
      const mo = moResponse.results[0];
      if (!mo) {
        return { success: false, error: { code: 'MO_NOT_FOUND', message: `MO ${moNumber} not found` } };
      }
      const moId = mo.id;

      // Get BOM mappings
      const bomIds = partsUsage.map(p => p.bom_id);
      const mappingsResponse = await listRecords(getTableId('fg_parts_mapping'), undefined, 1, 200);
      const bomLookup = new Map<number, { part_id: number; fg_id: number; part_name: string }>();

      for (const mapping of mappingsResponse.results) {
        if (bomIds.includes(mapping.id)) {
          const part = mapping['Part'] as Array<{ id: number; value: string }> | undefined;
          const finishedGood = mapping['Finished Good'] as Array<{ id: number; value: string }> | undefined;

          if (part && part.length > 0 && finishedGood && finishedGood.length > 0) {
            bomLookup.set(mapping.id, {
              part_id: part[0]?.id || 0,
              fg_id: finishedGood[0]?.id || 0,
              part_name: part[0]?.value || 'Unknown',
            });
          }
        }
      }

      // Lookup lots
      const lotNumbersToLookup = partsUsage.filter(p => p.lot_number && !p.lot_id).map(p => p.lot_number!);
      const lotLookup = new Map<string, number>();
      if (lotNumbersToLookup.length > 0) {
        const lotsResponse = await listRecords(getTableId('raw_material_lots'), undefined, 1, 200);
        for (const lot of lotsResponse.results) {
          const internalLotNumber = lot['Internal Lot Number'] as string;
          if (internalLotNumber && lotNumbersToLookup.includes(internalLotNumber)) {
            lotLookup.set(internalLotNumber, lot.id);
          }
        }
      }

      // Lookup labels
      const labelCodesToLookup = partsUsage.filter(p => p.label_code && !p.label_id).map(p => p.label_code!);
      const labelLookup = new Map<string, number>();
      if (labelCodesToLookup.length > 0) {
        const labelsResponse = await listRecords(getTableId('label_inventory'), undefined, 1, 200);
        for (const label of labelsResponse.results) {
          const partBomId = label['Part BOM ID'] as Array<{ value: string }> | undefined;
          if (partBomId && partBomId.length > 0) {
            const labelCode = partBomId[0]?.value;
            if (labelCode) {
              const matchedCode = labelCodesToLookup.find(code =>
                code.toLowerCase() === labelCode.toLowerCase() ||
                labelCode.toLowerCase().includes(code.toLowerCase())
              );
              if (matchedCode) {
                labelLookup.set(matchedCode, label.id);
              }
            }
          }
        }
      }

      // Create parts usage records
      const usageRecords = [];
      for (const part of partsUsage) {
        const bomInfo = bomLookup.get(part.bom_id);
        if (!bomInfo) continue;

        const usageData: Record<string, unknown> = {
          'Manufacturing Order': [moId],
          'Parts': [bomInfo.part_id],
          'Finished Goods': [bomInfo.fg_id],
          'Actual Quantity Used': part.quantity,
          'Notes': part.notes || `From BPR scan - ${moNumber}`,
          'Entered By': enteredBy,
        };

        const resolvedLotId = part.lot_id || (part.lot_number ? lotLookup.get(part.lot_number) : undefined);
        if (resolvedLotId) {
          usageData['RM Lot Inventory Used'] = [resolvedLotId];
        }

        const resolvedLabelId = part.label_id || (part.label_code ? labelLookup.get(part.label_code) : undefined);
        if (resolvedLabelId) {
          usageData['Label Inventory Used'] = [resolvedLabelId];
        }

        if (part.waste !== undefined) {
          usageData['Waste/Spillage'] = part.waste;
        }

        const record = await createRecord(getTableId('mo_parts_usage'), usageData);
        usageRecords.push(record);
      }

      // Update MO
      await updateRecord(getTableId('manufacturing_orders'), moId, {
        'MO Status': MO_STATUS_CLOSED,
        'Deduction Method': DEDUCTION_METHOD_ACTUAL_USAGE,
        'MFG Date Completed': completionDate,
        'Gross Produced': grossProduced,
        'Actual Usage Complete': true,
        'MO Inventory Processed': true,
      });

      return {
        success: true,
        data: {
          mo_id: moId,
          mo_number: moNumber,
          parts_usage_created: usageRecords.length,
          parts_usage_ids: usageRecords.map(r => r.id),
          mo_updated: true,
          summary: `BPR processed: MO ${moNumber} closed with ${usageRecords.length} parts usage records`,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// JSON-RPC Handler
// ============================================================================

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

async function handleJSONRPC(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  try {
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'baserow-mcp-server-railway', version: '1.0.0' },
          },
        };

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id: request.id, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id: request.id, result: { tools: TOOLS } };

      case 'tools/call': {
        const params = request.params as { name: string; arguments: Record<string, unknown> };
        const toolResult = await handleToolCall(params.name, params.arguments || {});
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
    };
  }
}

// ============================================================================
// Express Routes
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'baserow-mcp-railway', tables: Object.keys(TABLE_MAP).length });
});

// MCP endpoint (JSON-RPC over HTTP POST)
app.post('/mcp', async (req, res) => {
  try {
    const response = await handleJSONRPC(req.body);
    res.json(response);
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  }
});

// Root - show server info
app.get('/', (req, res) => {
  res.json({
    name: 'Baserow MCP Server (Railway)',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      mcp: '/mcp (POST)',
    },
    usage: 'Use mcp-remote to connect: npx mcp-remote https://your-app.railway.app/mcp',
  });
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`Tables configured: ${Object.entries(TABLE_MAP).filter(([_, v]) => v).map(([k]) => k).join(', ')}`);
});
