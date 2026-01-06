/**
 * Cloudflare Worker MCP Server
 * Remote MCP Server using Streamable HTTP transport
 */

interface Env {
  BASEROW_API_TOKEN: string;
  BASEROW_API_URL: string;
  TABLE_ID_MO: string;
  TABLE_ID_FG: string;
  TABLE_ID_PARTS_USAGE: string;
  TABLE_ID_FG_PARTS_MAPPING: string;
  TABLE_ID_RM_LOTS: string;
  TABLE_ID_LABEL_INVENTORY: string;
  TABLE_ID_PARTS: string;
}

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

// ============================================================================
// Baserow Client
// ============================================================================

class BaserowClient {
  private apiUrl: string;
  private apiToken: string;

  constructor(env: Env) {
    this.apiUrl = env.BASEROW_API_URL || 'https://api.baserow.io';
    this.apiToken = env.BASEROW_API_TOKEN;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Token ${this.apiToken}`,
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

  async listRecords(
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

    return this.request<BaserowListResponse>(
      'GET',
      `/api/database/rows/table/${tableId}/?${params.toString()}`
    );
  }

  async createRecord(
    tableId: string,
    data: Record<string, unknown>
  ): Promise<BaserowRecord> {
    return this.request<BaserowRecord>(
      'POST',
      `/api/database/rows/table/${tableId}/?user_field_names=true`,
      data
    );
  }

  async updateRecord(
    tableId: string,
    recordId: number,
    data: Record<string, unknown>
  ): Promise<BaserowRecord> {
    return this.request<BaserowRecord>(
      'PATCH',
      `/api/database/rows/table/${tableId}/${recordId}/?user_field_names=true`,
      data
    );
  }

  async deleteRecord(tableId: string, recordId: number): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/api/database/rows/table/${tableId}/${recordId}/`
    );
  }
}

// ============================================================================
// MCP Server Implementation
// ============================================================================

class MCPServer {
  private env: Env;
  private client: BaserowClient;
  private tableMap: Record<string, string>;

  constructor(env: Env) {
    this.env = env;
    this.client = new BaserowClient(env);
    this.tableMap = {
      manufacturing_orders: env.TABLE_ID_MO,
      finished_goods: env.TABLE_ID_FG,
      mo_parts_usage: env.TABLE_ID_PARTS_USAGE,
      fg_parts_mapping: env.TABLE_ID_FG_PARTS_MAPPING,
      raw_material_lots: env.TABLE_ID_RM_LOTS,
      label_inventory: env.TABLE_ID_LABEL_INVENTORY,
      parts: env.TABLE_ID_PARTS,
    };
  }

  private getTableId(tableName: string): string {
    const tableId = this.tableMap[tableName];
    if (!tableId) {
      // Debug: show what values we actually have
      const debugInfo = Object.entries(this.tableMap)
        .map(([k, v]) => `${k}=${v || 'UNDEFINED'}`)
        .join(', ');
      throw new Error(`Table "${tableName}" has no ID configured. Table IDs: ${debugInfo}`);
    }
    return tableId;
  }

  // Get tool definitions
  getTools() {
    return [
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
  }

  // Handle tool calls
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_tables':
        return this.listTables();
      case 'read':
        return this.read(args);
      case 'create':
        return this.create(args);
      case 'update':
        return this.update(args);
      case 'delete':
        return this.deleteRecord(args);
      case 'search_parts':
        return this.searchParts(args);
      case 'get_bom':
        return this.getBOM(args);
      case 'process_bpr':
        return this.processBPR(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private listTables() {
    return {
      success: true,
      data: {
        tables: Object.keys(this.tableMap).map(name => ({
          name,
          table_id: this.tableMap[name],
        })),
      },
    };
  }

  private async read(args: Record<string, unknown>) {
    const tableId = this.getTableId(args.table as string);
    const response = await this.client.listRecords(
      tableId,
      args.filters as Record<string, string>,
      (args.page as number) || 1,
      (args.size as number) || 25
    );
    return { success: true, data: response };
  }

  private async create(args: Record<string, unknown>) {
    const tableId = this.getTableId(args.table as string);
    const record = await this.client.createRecord(tableId, args.data as Record<string, unknown>);
    return { success: true, data: record };
  }

  private async update(args: Record<string, unknown>) {
    const tableId = this.getTableId(args.table as string);
    const record = await this.client.updateRecord(
      tableId,
      args.record_id as number,
      args.data as Record<string, unknown>
    );
    return { success: true, data: record };
  }

  private async deleteRecord(args: Record<string, unknown>) {
    const tableId = this.getTableId(args.table as string);
    await this.client.deleteRecord(tableId, args.record_id as number);
    return { success: true, data: { deleted: true, record_id: args.record_id } };
  }

  private async searchParts(args: Record<string, unknown>) {
    const searchTerms = args.search_terms as string[];
    const tableId = this.getTableId('parts');
    const partNameToId = new Map<string, { part_id: number; part_name: string }>();

    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const response = await this.client.listRecords(tableId, undefined, page, 200);

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

  private async getBOM(args: Record<string, unknown>) {
    let targetFgId = args.fg_id as number | undefined;
    let targetIsku = (args.isku as string) || '';

    if (!targetFgId && args.isku) {
      const fgResponse = await this.client.listRecords(this.getTableId('finished_goods'), { 'iSKU': args.isku as string }, 1, 1);
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

    const allMappings = await this.client.listRecords(this.getTableId('fg_parts_mapping'), undefined, 1, 200);
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

  private async processBPR(args: Record<string, unknown>) {
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
    const moResponse = await this.client.listRecords(this.getTableId('manufacturing_orders'), { 'MO Number': moNumber }, 1, 1);
    const mo = moResponse.results[0];
    if (!mo) {
      return { success: false, error: { code: 'MO_NOT_FOUND', message: `MO ${moNumber} not found` } };
    }
    const moId = mo.id;

    // Get BOM mappings
    const bomIds = partsUsage.map(p => p.bom_id);
    const mappingsResponse = await this.client.listRecords(this.getTableId('fg_parts_mapping'), undefined, 1, 200);
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
      const lotsResponse = await this.client.listRecords(this.getTableId('raw_material_lots'), undefined, 1, 200);
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
      const labelsResponse = await this.client.listRecords(this.getTableId('label_inventory'), undefined, 1, 200);
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

      const record = await this.client.createRecord(this.getTableId('mo_parts_usage'), usageData);
      usageRecords.push(record);
    }

    // Update MO
    await this.client.updateRecord(this.getTableId('manufacturing_orders'), moId, {
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

  // Handle JSON-RPC request
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: 'baserow-mcp-server-remote',
                version: '1.0.0',
              },
            },
          };

        case 'notifications/initialized':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: this.getTools(),
            },
          };

        case 'tools/call':
          const params = request.params as { name: string; arguments: Record<string, unknown> };
          const toolResult = await this.callTool(params.name, params.arguments || {});
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult, null, 2),
                },
              ],
            },
          };

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }
}

// ============================================================================
// Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'baserow-mcp-remote' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const server = new MCPServer(env);

    // Handle POST requests (JSON-RPC)
    if (request.method === 'POST') {
      try {
        const body = await request.json() as JSONRPCRequest;
        const response = await server.handleRequest(body);

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (error) {
        const errorResponse: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // Handle GET requests - return server info as JSON-RPC response
    if (request.method === 'GET') {
      // For SSE endpoint, return proper headers
      if (url.pathname === '/sse' || url.pathname === '/mcp/sse') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'SSE not supported. Use POST for JSON-RPC requests.',
          },
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Default - show server capabilities
      const initResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'info',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      });

      return new Response(JSON.stringify(initResponse), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
