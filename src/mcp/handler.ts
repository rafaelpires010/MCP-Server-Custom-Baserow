/**
 * MCP Request Handler
 * Processes MCP tool calls and routes to appropriate handlers
 */

import { z } from 'zod';
import { getTablesService, TablesService } from '../baserow/tables.js';
import { UnauthorizedTableAccessError } from '../security/allowList.js';
import { BaserowApiError, BaserowConnectionError } from '../baserow/client.js';
import {
  MCPRequestSchema,
  type MCPRequest,
  type MCPResponse,
  type MCPSuccessResponse,
  type MCPErrorResponse,
  type ListTablesResponse,
  type BaserowRecord,
  type BaserowListResponse,
  type BatchCreateResponse,
  type ProcessBPRResponse,
  type PartsUsageItem,
  type RecordData,
  type GetBOMResponse,
  type BOMItem,
  type SearchPartsResponse,
  type PartSearchResult,
} from '../types/mcp.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Response Size Limits (to avoid Claude Desktop caption limits)
// ============================================================================

const MAX_RESPONSE_CHARS = 50000; // Max characters in response
const MAX_RECORDS_PER_PAGE = 25; // Limit records to reduce response size
const FIELDS_TO_SIMPLIFY = [
  'AMAZON SALES & INVENTORY',
  'ShipStation SKU Mapping',
  'TikTok Sales & Inventory',
  'Walmart Sales & Inventory - Finished Goods',
  'FBA Inventory Qty',
  'WH Inventory Qty',
  'Amazon Inventory Health',
  'Fulfillment Orders',
  'Manufacturing Orders',
  'FG Parts Mapping',
  'Inventory Transactions',
  'MO Parts Usage',
  'Cycle Count Log',
  'Kit Components Mapping',
  'Kit Parts Mapping',
  'Kitting Orders',
  'Mo Plan',
  'Mo Plan 2',
  'IHF Order Summary By Day',
  'Manufacturing Batches',
  'FO Plan (Multi-Channel) v2',
  'IHF Sales & Inventory',
  'Receiving Log',
  'Count Cycle Schedule',
  'Labels',
  'Finished Goods Inventory',
];

// ============================================================================
// Response Simplification Functions
// ============================================================================

/**
 * Simplify a record by reducing large array fields to just counts/IDs
 */
function simplifyRecord(record: BaserowRecord): BaserowRecord {
  const simplified: BaserowRecord = { id: record.id, order: record.order };

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || key === 'order') continue;

    // Simplify large array fields
    if (FIELDS_TO_SIMPLIFY.includes(key) && Array.isArray(value)) {
      if (value.length === 0) {
        simplified[key] = [];
      } else if (value.length <= 3) {
        // Keep small arrays but simplify objects inside
        simplified[key] = value.map((item: unknown) => {
          if (typeof item === 'object' && item !== null && 'id' in item) {
            const obj = item as Record<string, unknown>;
            return { id: obj['id'], value: obj['value'] };
          }
          return item;
        });
      } else {
        // For large arrays, just show count and first item
        const firstItem = value[0];
        simplified[key] = {
          _count: value.length,
          _first: typeof firstItem === 'object' && firstItem !== null && 'id' in firstItem
            ? { id: (firstItem as Record<string, unknown>)['id'] }
            : firstItem,
          _note: `${value.length} items (simplified)`
        };
      }
    } else {
      simplified[key] = value;
    }
  }

  return simplified;
}

/**
 * Simplify response to fit within size limits
 */
function simplifyResponse(response: BaserowListResponse): BaserowListResponse {
  // Limit number of records
  const limitedResults = response.results.slice(0, MAX_RECORDS_PER_PAGE);

  // Simplify each record
  const simplifiedResults = limitedResults.map(simplifyRecord);

  // Check size and further reduce if needed
  const jsonStr = JSON.stringify(simplifiedResults);

  if (jsonStr.length > MAX_RESPONSE_CHARS && simplifiedResults.length > 10) {
    // Further reduce to 10 records
    const reducedResults = simplifiedResults.slice(0, 10);
    return {
      ...response,
      results: reducedResults,
      _note: `Response truncated: showing 10 of ${response.count} records. Use filters for specific data.`
    } as BaserowListResponse;
  }

  if (limitedResults.length < response.results.length) {
    return {
      ...response,
      results: simplifiedResults,
      _note: `Response limited: showing ${limitedResults.length} of ${response.count} records. Use pagination or filters.`
    } as BaserowListResponse;
  }

  return {
    ...response,
    results: simplifiedResults
  };
}

// ============================================================================
// Error Codes
// ============================================================================

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED_TABLE: 'UNAUTHORIZED_TABLE_ACCESS',
  API_ERROR: 'BASEROW_API_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
} as const;

// ============================================================================
// Response Builders
// ============================================================================

function successResponse<T>(data: T, metadata?: MCPSuccessResponse<T>['metadata']): MCPSuccessResponse<T> {
  return {
    success: true,
    data,
    ...(metadata && { metadata }),
  };
}

function errorResponse(
  code: string,
  message: string,
  details?: unknown
): MCPErrorResponse {
  const error: MCPErrorResponse['error'] = {
    code,
    message,
  };

  if (details !== undefined) {
    error.details = details;
  }

  return {
    success: false,
    error,
  };
}

// ============================================================================
// MCP Handler Class
// ============================================================================

export class MCPHandler {
  private tablesService: TablesService;

  constructor() {
    this.tablesService = getTablesService();
  }

  /**
   * Handle an MCP tool call
   */
  async handleToolCall(
    toolName: string,
    args: unknown
  ): Promise<MCPResponse> {
    logger.info(`Handling tool call: ${toolName}`, { args });

    try {
      // Build request object from tool name and args
      const request = this.buildRequest(toolName, args);

      // Validate the request
      const validatedRequest = this.validateRequest(request);

      // Route to appropriate handler
      return await this.routeRequest(validatedRequest);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Build a request object from tool name and arguments
   */
  private buildRequest(toolName: string, args: unknown): unknown {
    // Map tool name to command
    const commandMap: Record<string, string> = {
      list_tables: 'list_tables',
      read: 'read',
      create: 'create',
      update: 'update',
      delete: 'delete',
      batch_create: 'batch_create',
      get_bom: 'get_bom',
      process_bpr: 'process_bpr',
      search_parts: 'search_parts',
    };

    const command = commandMap[toolName];
    if (!command) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Combine command with arguments
    return {
      command,
      ...(typeof args === 'object' && args !== null ? args : {}),
    };
  }

  /**
   * Validate an MCP request against the schema
   */
  private validateRequest(request: unknown): MCPRequest {
    try {
      return MCPRequestSchema.parse(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new ValidationError(messages.join('; '));
      }
      throw error;
    }
  }

  /**
   * Route a validated request to the appropriate handler
   */
  private async routeRequest(request: MCPRequest): Promise<MCPResponse> {
    switch (request.command) {
      case 'list_tables':
        return this.handleListTables();

      case 'read':
        return this.handleRead(request.table, request.filters, request.page, request.size);

      case 'create':
        return this.handleCreate(request.table, request.data);

      case 'update':
        return this.handleUpdate(request.table, request.record_id, request.data);

      case 'delete':
        return this.handleDelete(request.table, request.record_id);

      case 'batch_create':
        return this.handleBatchCreate(request.table, request.records);

      case 'get_bom':
        return this.handleGetBOM(request.fg_id, request.isku);

      case 'process_bpr':
        return this.handleProcessBPR(
          request.mo_number,
          request.completion_date,
          request.gross_produced,
          request.parts_usage,
          request.entered_by
        );

      case 'search_parts':
        return this.handleSearchParts(request.search_terms);

      default:
        // TypeScript exhaustive check
        const _exhaustive: never = request;
        throw new Error(`Unknown command: ${(_exhaustive as MCPRequest).command}`);
    }
  }

  /**
   * Handle list_tables command
   */
  private handleListTables(): MCPResponse<ListTablesResponse> {
    const tables = this.tablesService.listAllowedTables();
    return successResponse({ tables });
  }

  /**
   * Handle read command
   */
  private async handleRead(
    table: string,
    filters?: Record<string, unknown>,
    page?: number,
    size?: number
  ): Promise<MCPResponse<BaserowListResponse>> {
    // Limit size to avoid response too large
    const limitedSize = Math.min(size ?? 100, MAX_RECORDS_PER_PAGE);

    const response = await this.tablesService.readRecords(
      table,
      filters as Record<string, string | number | boolean | null>,
      page,
      limitedSize
    );

    // Simplify response to reduce size
    const simplifiedResponse = simplifyResponse(response);

    return successResponse(simplifiedResponse, {
      count: response.count,
      page: page ?? 1,
      size: limitedSize,
      next: response.next,
      previous: response.previous,
    });
  }

  /**
   * Handle create command
   */
  private async handleCreate(
    table: string,
    data: Record<string, unknown>
  ): Promise<MCPResponse<BaserowRecord>> {
    const record = await this.tablesService.createRecord(
      table,
      data as Record<string, string | number | boolean | null | unknown[]>
    );
    return successResponse(record);
  }

  /**
   * Handle update command
   */
  private async handleUpdate(
    table: string,
    recordId: number,
    data: Record<string, unknown>
  ): Promise<MCPResponse<BaserowRecord>> {
    const record = await this.tablesService.updateRecord(
      table,
      recordId,
      data as Record<string, string | number | boolean | null | unknown[]>
    );
    return successResponse(record);
  }

  /**
   * Handle delete command
   */
  private async handleDelete(
    table: string,
    recordId: number
  ): Promise<MCPResponse<{ deleted: boolean; record_id: number }>> {
    await this.tablesService.deleteRecord(table, recordId);
    return successResponse({ deleted: true, record_id: recordId });
  }

  /**
   * Handle get_bom command - Get Bill of Materials for a Finished Good
   */
  private async handleGetBOM(
    fgId?: number,
    isku?: string
  ): Promise<MCPResponse<GetBOMResponse>> {
    logger.info(`Getting BOM for FG ID: ${fgId} or iSKU: ${isku}`);

    let targetFgId = fgId;
    let targetIsku = isku || '';

    // If only isku provided, first find the FG ID
    if (!targetFgId && isku) {
      logger.info(`Searching for FG by iSKU: ${isku}`);
      const fgResponse = await this.tablesService.readRecords(
        'finished_goods',
        { 'iSKU': isku },
        1,
        1
      );

      const fg = fgResponse.results[0];
      if (!fg) {
        return errorResponse(
          'FG_NOT_FOUND',
          `Finished Good with iSKU "${isku}" not found`
        );
      }
      targetFgId = fg.id;
      targetIsku = isku;
    }

    if (!targetFgId) {
      return errorResponse(
        'INVALID_REQUEST',
        'Either fg_id or isku must be provided'
      );
    }

    // Search fg_parts_mapping for all parts linked to this FG
    // We need to search by the FG name since we can't filter by link field directly
    logger.info(`Searching BOM for FG ID: ${targetFgId}`);

    // Get all mappings and filter by FG ID
    const allMappings = await this.tablesService.readRecords(
      'fg_parts_mapping',
      {},
      1,
      200 // Get many records
    );

    // Filter to only records that link to our FG ID
    const bomItems: BOMItem[] = [];

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

        // Also capture the iSKU if we found it
        if (!targetIsku && finishedGood[0]?.value) {
          targetIsku = finishedGood[0].value;
        }
      }
    }

    logger.info(`Found ${bomItems.length} parts in BOM`);

    return successResponse({
      fg_id: targetFgId,
      fg_isku: targetIsku,
      parts: bomItems,
      total_parts: bomItems.length,
    });
  }

  /**
   * Handle batch_create command - Create multiple records at once
   */
  private async handleBatchCreate(
    table: string,
    records: RecordData[]
  ): Promise<MCPResponse<BatchCreateResponse>> {
    logger.info(`Batch creating ${records.length} records in ${table}`);

    const createdRecords: BaserowRecord[] = [];

    // Create records in parallel (batches of 10 to avoid overwhelming the API)
    const batchSize = 10;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const promises = batch.map(data =>
        this.tablesService.createRecord(
          table,
          data as Record<string, string | number | boolean | null | unknown[]>
        )
      );
      const results = await Promise.all(promises);
      createdRecords.push(...results);
    }

    logger.info(`Successfully created ${createdRecords.length} records`);

    return successResponse({
      created: createdRecords.length,
      records: createdRecords.map(r => ({ id: r.id, order: r.order })),
    });
  }

  /**
   * Handle process_bpr command - Complete BPR processing in one operation
   * This does everything: find MO, lookup Part/FG IDs from BOM, create parts usage, update MO status
   * Uses bom_id (mapping_id from fg_parts_mapping) to automatically get Part ID and FG ID
   */
  private async handleProcessBPR(
    moNumber: string,
    completionDate: string,
    grossProduced: string,
    partsUsage: PartsUsageItem[],
    enteredBy?: string
  ): Promise<MCPResponse<ProcessBPRResponse>> {
    logger.info(`Processing BPR for MO: ${moNumber}`);

    // Status IDs
    const MO_STATUS_CLOSED = 4554566;
    const DEDUCTION_METHOD_ACTUAL_USAGE = 4669016;

    // Step 1: Find the Manufacturing Order
    logger.info('Step 1: Finding Manufacturing Order...');
    const moResponse = await this.tablesService.readRecords(
      'manufacturing_orders',
      { 'MO Number': moNumber },
      1,
      1
    );

    const mo = moResponse.results[0];
    if (!mo) {
      return errorResponse(
        'MO_NOT_FOUND',
        `Manufacturing Order ${moNumber} not found`
      );
    }

    const moId = mo.id;
    logger.info(`Found MO with ID: ${moId}`);

    // Step 2: Lookup Part IDs and FG IDs from BOM mappings
    logger.info('Step 2: Looking up Part IDs from BOM mappings...');
    const bomIds = partsUsage.map(p => p.bom_id);

    // Get all fg_parts_mapping records to find the Part and FG IDs
    const mappingsResponse = await this.tablesService.readRecords(
      'fg_parts_mapping',
      {},
      1,
      200
    );

    // Create a map of bom_id -> { part_id, fg_id, part_name }
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

    // Verify all BOM IDs were found
    const missingBomIds = bomIds.filter(id => !bomLookup.has(id));
    if (missingBomIds.length > 0) {
      return errorResponse(
        'BOM_NOT_FOUND',
        `BOM mapping IDs not found: ${missingBomIds.join(', ')}`
      );
    }

    // Step 2.5: Lookup lot_id and label_id if lot_number or label_code provided
    logger.info('Step 2.5: Looking up lot IDs and label IDs...');

    // Collect all lot_numbers and label_codes that need lookup
    const lotNumbersToLookup = partsUsage
      .filter(p => p.lot_number && !p.lot_id)
      .map(p => p.lot_number!);

    const labelCodesToLookup = partsUsage
      .filter(p => p.label_code && !p.label_id)
      .map(p => p.label_code!);

    // Lookup lot IDs from raw_material_lots
    const lotLookup = new Map<string, number>();
    if (lotNumbersToLookup.length > 0) {
      logger.info(`Looking up ${lotNumbersToLookup.length} lot numbers...`);
      const lotsResponse = await this.tablesService.readRecords(
        'raw_material_lots',
        {},
        1,
        200
      );

      for (const lot of lotsResponse.results) {
        const internalLotNumber = lot['Internal Lot Number'] as string;
        if (internalLotNumber && lotNumbersToLookup.includes(internalLotNumber)) {
          lotLookup.set(internalLotNumber, lot.id);
          logger.info(`Found lot: ${internalLotNumber} -> ID ${lot.id}`);
        }
      }
    }

    // Lookup label IDs from label_inventory by Part BOM ID
    const labelLookup = new Map<string, number>();
    if (labelCodesToLookup.length > 0) {
      logger.info(`Looking up ${labelCodesToLookup.length} label codes...`);
      const labelsResponse = await this.tablesService.readRecords(
        'label_inventory',
        {},
        1,
        200
      );

      for (const label of labelsResponse.results) {
        // Part BOM ID is a link field with format [{ids: {...}, value: "LABL-..."}]
        const partBomId = label['Part BOM ID'] as Array<{ value: string }> | undefined;
        if (partBomId && partBomId.length > 0) {
          const labelCode = partBomId[0]?.value;
          if (labelCode && labelCodesToLookup.some(code =>
            code.toLowerCase() === labelCode.toLowerCase() ||
            labelCode.toLowerCase().includes(code.toLowerCase()) ||
            code.toLowerCase().includes(labelCode.toLowerCase())
          )) {
            // Find which code matches
            const matchedCode = labelCodesToLookup.find(code =>
              code.toLowerCase() === labelCode.toLowerCase() ||
              labelCode.toLowerCase().includes(code.toLowerCase()) ||
              code.toLowerCase().includes(labelCode.toLowerCase())
            );
            if (matchedCode) {
              labelLookup.set(matchedCode, label.id);
              logger.info(`Found label: ${matchedCode} -> ID ${label.id} (Part BOM ID: ${labelCode})`);
            }
          }
        }
      }
    }

    // Step 3: Create all parts usage records
    logger.info(`Step 3: Creating ${partsUsage.length} parts usage records...`);
    const usageRecords: BaserowRecord[] = [];

    for (const part of partsUsage) {
      const bomInfo = bomLookup.get(part.bom_id)!;

      const usageData: Record<string, unknown> = {
        'Manufacturing Order': [moId],
        'Parts': [bomInfo.part_id],
        'Finished Goods': [bomInfo.fg_id],
        'Actual Quantity Used': part.quantity,
        'Notes': part.notes || `From BPR scan - ${moNumber}`,
        'Entered By': enteredBy || 'Alexa via Claude',
      };

      // Add optional fields if provided
      // Use direct lot_id if provided, otherwise lookup by lot_number
      const resolvedLotId = part.lot_id || (part.lot_number ? lotLookup.get(part.lot_number) : undefined);
      if (resolvedLotId) {
        usageData['RM Lot Inventory Used'] = [resolvedLotId];
        logger.info(`Using lot ID: ${resolvedLotId} for part ${bomInfo.part_name}`);
      }

      // Use direct label_id if provided, otherwise lookup by label_code
      const resolvedLabelId = part.label_id || (part.label_code ? labelLookup.get(part.label_code) : undefined);
      if (resolvedLabelId) {
        usageData['Label Inventory Used'] = [resolvedLabelId];
        logger.info(`Using label ID: ${resolvedLabelId} for part ${bomInfo.part_name}`);
      }

      if (part.waste !== undefined) {
        usageData['Waste/Spillage'] = part.waste;
      }

      try {
        logger.info(`Creating usage record with data: ${JSON.stringify(usageData)}`);
        const record = await this.tablesService.createRecord(
          'mo_parts_usage',
          usageData as Record<string, string | number | boolean | null | unknown[]>
        );
        usageRecords.push(record);
        logger.info(`Created usage record ID: ${record.id} for part: ${bomInfo.part_name}`);
        logger.info(`Record response: ${JSON.stringify(record)}`);
      } catch (error) {
        logger.error(`Failed to create usage record for BOM ${part.bom_id} (part: ${bomInfo.part_name})`, error);
        throw error;
      }
    }

    // Step 4: Update the Manufacturing Order
    logger.info('Step 4: Updating Manufacturing Order status...');
    const updateData = {
      'MO Status': MO_STATUS_CLOSED,
      'Deduction Method': DEDUCTION_METHOD_ACTUAL_USAGE,
      'MFG Date Completed': completionDate,
      'Gross Produced': grossProduced,
      'Actual Usage Complete': true,
      'MO Inventory Processed': true,
    };

    await this.tablesService.updateRecord(
      'manufacturing_orders',
      moId,
      updateData as Record<string, string | number | boolean | null | unknown[]>
    );

    logger.info('BPR processing completed successfully');

    return successResponse({
      success: true,
      mo_id: moId,
      mo_number: moNumber,
      parts_usage_created: usageRecords.length,
      parts_usage_ids: usageRecords.map(r => r.id),
      mo_updated: true,
      summary: `BPR processed: MO ${moNumber} closed with ${usageRecords.length} parts usage records. Gross produced: ${grossProduced}`,
    });
  }

  /**
   * Handle search_parts command - Search for Part IDs by name
   * Searches the parts table directly to find Part IDs for given part names
   * This works for ALL parts, including new ones not yet in any BOM
   */
  private async handleSearchParts(
    searchTerms: string[]
  ): Promise<MCPResponse<SearchPartsResponse>> {
    logger.info(`Searching for ${searchTerms.length} parts in parts table`);

    // Get ALL parts from the parts table (paginate through all pages)
    const partNameToId = new Map<string, { part_id: number; part_name: string }>();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const partsPage = await this.tablesService.readRecords(
        'parts',
        {},
        page,
        200
      );

      for (const part of partsPage.results) {
        // Primary field is "BOM ID" based on user's Baserow setup
        const partName = (
          part['BOM ID'] ||
          part['Name'] ||
          part['Part Name'] ||
          part['iSKU'] ||
          part['Part Number'] ||
          part['SKU'] ||
          ''
        ) as string;

        if (partName) {
          partNameToId.set(partName.toLowerCase(), {
            part_id: part.id,
            part_name: partName,
          });
        }
      }

      // Check if there are more pages
      hasMore = partsPage.next !== null && partsPage.results.length > 0;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 50) {
        logger.warn('Reached max page limit (50) when loading parts');
        break;
      }
    }

    logger.info(`Loaded ${partNameToId.size} parts from parts table (${page - 1} pages)`);

    // Search for each term
    const results: PartSearchResult[] = [];
    const notFound: string[] = [];

    for (const term of searchTerms) {
      const termLower = term.toLowerCase();

      // Try exact match first
      let found = partNameToId.get(termLower);

      // If not found, try partial match
      if (!found) {
        for (const [name, info] of partNameToId) {
          if (name.includes(termLower) || termLower.includes(name)) {
            found = info;
            break;
          }
        }
      }

      if (found) {
        results.push({
          part_id: found.part_id,
          part_name: found.part_name,
          search_term: term,
          found: true,
        });
      } else {
        results.push({
          part_id: 0,
          part_name: '',
          search_term: term,
          found: false,
        });
        notFound.push(term);
      }
    }

    const foundCount = results.filter(r => r.found).length;
    logger.info(`Found ${foundCount} of ${searchTerms.length} parts`);

    return successResponse({
      results,
      found_count: foundCount,
      not_found: notFound,
    });
  }

  /**
   * Convert errors to MCP error responses
   */
  private handleError(error: unknown): MCPErrorResponse {
    logger.error('Error handling MCP request', error);

    if (error instanceof ValidationError) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        error.message
      );
    }

    if (error instanceof UnauthorizedTableAccessError) {
      return errorResponse(
        ERROR_CODES.UNAUTHORIZED_TABLE,
        error.message,
        { table: error.tableName }
      );
    }

    if (error instanceof BaserowApiError) {
      return errorResponse(
        ERROR_CODES.API_ERROR,
        error.message,
        {
          statusCode: error.statusCode,
          response: error.responseBody,
        }
      );
    }

    if (error instanceof BaserowConnectionError) {
      return errorResponse(
        ERROR_CODES.CONNECTION_ERROR,
        error.message
      );
    }

    if (error instanceof Error) {
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        error.message
      );
    }

    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'An unexpected error occurred'
    );
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let handlerInstance: MCPHandler | null = null;

export function getMCPHandler(): MCPHandler {
  if (!handlerInstance) {
    handlerInstance = new MCPHandler();
  }
  return handlerInstance;
}

export function resetMCPHandler(): void {
  handlerInstance = null;
}
