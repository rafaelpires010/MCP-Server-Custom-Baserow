/**
 * MCP Types for Baserow Server
 * Defines all type interfaces for MCP commands and responses
 */

import { z } from 'zod';

// ============================================================================
// Allowed Table Names (Type-Safe)
// ============================================================================

export const ALLOWED_TABLE_NAMES = [
  'manufacturing_orders',
  'mo_parts_usage',
  'raw_material_lots',
  'inventory_transactions',
  'finished_goods',
  'cycle_counts',
  'fg_parts_mapping',
  'label_inventory',
  'parts',
] as const;

export type AllowedTableName = (typeof ALLOWED_TABLE_NAMES)[number];

// ============================================================================
// Command Types
// ============================================================================

export type MCPCommand = 'list_tables' | 'read' | 'create' | 'update' | 'delete' | 'batch_create' | 'get_bom' | 'process_bpr' | 'search_parts';

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const TableNameSchema = z.enum(ALLOWED_TABLE_NAMES);

export const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const FiltersSchema = z.record(z.string(), FilterValueSchema).optional();

export const RecordDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())])
);

// Command Schemas
export const ListTablesCommandSchema = z.object({
  command: z.literal('list_tables'),
});

export const ReadCommandSchema = z.object({
  command: z.literal('read'),
  table: TableNameSchema,
  filters: FiltersSchema,
  page: z.number().int().positive().optional(),
  size: z.number().int().positive().max(200).optional(),
});

export const CreateCommandSchema = z.object({
  command: z.literal('create'),
  table: TableNameSchema,
  data: RecordDataSchema,
});

export const UpdateCommandSchema = z.object({
  command: z.literal('update'),
  table: TableNameSchema,
  record_id: z.number().int().positive(),
  data: RecordDataSchema,
});

export const DeleteCommandSchema = z.object({
  command: z.literal('delete'),
  table: TableNameSchema,
  record_id: z.number().int().positive(),
});

// Batch create schema
export const BatchCreateCommandSchema = z.object({
  command: z.literal('batch_create'),
  table: TableNameSchema,
  records: z.array(RecordDataSchema).max(50),
});

// Get BOM schema
export const GetBOMCommandSchema = z.object({
  command: z.literal('get_bom'),
  fg_id: z.number().int().positive().optional(),
  isku: z.string().optional(),
});

// Parts usage item schema for BPR processing
// Uses bom_id (mapping_id from fg_parts_mapping) instead of part_id
// The Part ID is looked up automatically from the BOM mapping
export const PartsUsageItemSchema = z.object({
  bom_id: z.number().int().positive(), // mapping_id from fg_parts_mapping table
  quantity: z.number(),
  lot_id: z.number().int().positive().optional(), // Direct ID if known
  lot_number: z.string().optional(), // Internal Lot Number - will be looked up automatically
  label_id: z.number().int().positive().optional(), // Direct ID if known
  label_code: z.string().optional(), // Label code/Part BOM ID - will be looked up automatically
  waste: z.number().optional(),
  notes: z.string().optional(),
});

// Process BPR schema
export const ProcessBPRCommandSchema = z.object({
  command: z.literal('process_bpr'),
  mo_number: z.string(),
  completion_date: z.string(),
  gross_produced: z.string(),
  parts_usage: z.array(PartsUsageItemSchema),
  entered_by: z.string().optional(),
});

// Search parts schema - find Part IDs by name
export const SearchPartsCommandSchema = z.object({
  command: z.literal('search_parts'),
  search_terms: z.array(z.string()), // Array of part names to search for
});

export const MCPRequestSchema = z.discriminatedUnion('command', [
  ListTablesCommandSchema,
  ReadCommandSchema,
  CreateCommandSchema,
  UpdateCommandSchema,
  DeleteCommandSchema,
  BatchCreateCommandSchema,
  GetBOMCommandSchema,
  ProcessBPRCommandSchema,
  SearchPartsCommandSchema,
]);

// ============================================================================
// TypeScript Types (Inferred from Schemas)
// ============================================================================

export type FilterValue = z.infer<typeof FilterValueSchema>;
export type Filters = z.infer<typeof FiltersSchema>;
export type RecordData = z.infer<typeof RecordDataSchema>;

export type ListTablesCommand = z.infer<typeof ListTablesCommandSchema>;
export type ReadCommand = z.infer<typeof ReadCommandSchema>;
export type CreateCommand = z.infer<typeof CreateCommandSchema>;
export type UpdateCommand = z.infer<typeof UpdateCommandSchema>;
export type DeleteCommand = z.infer<typeof DeleteCommandSchema>;
export type BatchCreateCommand = z.infer<typeof BatchCreateCommandSchema>;
export type GetBOMCommand = z.infer<typeof GetBOMCommandSchema>;
export type ProcessBPRCommand = z.infer<typeof ProcessBPRCommandSchema>;
export type PartsUsageItem = z.infer<typeof PartsUsageItemSchema>;
export type SearchPartsCommand = z.infer<typeof SearchPartsCommandSchema>;

export type MCPRequest = z.infer<typeof MCPRequestSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface MCPSuccessResponse<T = unknown> {
  success: true;
  data: T;
  metadata?: {
    count?: number;
    page?: number;
    size?: number;
    next?: string | null;
    previous?: string | null;
  };
}

export interface MCPErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type MCPResponse<T = unknown> = MCPSuccessResponse<T> | MCPErrorResponse;

// ============================================================================
// Table Info Types
// ============================================================================

export interface TableInfo {
  name: AllowedTableName;
  id: number;
  description?: string;
}

export interface ListTablesResponse {
  tables: TableInfo[];
}

// ============================================================================
// Baserow Record Types
// ============================================================================

export interface BaserowRecord {
  id: number;
  order: string;
  [key: string]: unknown;
}

export interface BaserowListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: BaserowRecord[];
}

// ============================================================================
// Batch and BPR Response Types
// ============================================================================

export interface BatchCreateResponse {
  created: number;
  records: BaserowRecord[];
}

export interface ProcessBPRResponse {
  success: boolean;
  mo_id: number;
  mo_number: string;
  parts_usage_created: number;
  parts_usage_ids: number[];
  mo_updated: boolean;
  summary: string;
}

export interface BOMItem {
  mapping_id: number;
  part_id: number;
  part_name: string;
  quantity_per_unit: number;
  part_role: string;
}

export interface GetBOMResponse {
  fg_id: number;
  fg_isku: string;
  parts: BOMItem[];
  total_parts: number;
}

export interface PartSearchResult {
  part_id: number;
  part_name: string;
  search_term: string;
  found: boolean;
}

export interface SearchPartsResponse {
  results: PartSearchResult[];
  found_count: number;
  not_found: string[];
}
