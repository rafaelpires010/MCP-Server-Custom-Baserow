/**
 * Filter Utilities
 * Helper functions for building and validating Baserow filter queries
 */

import type { Filters, FilterValue } from '../types/mcp.js';

// ============================================================================
// Baserow Filter Types
// ============================================================================

/**
 * Supported Baserow filter types
 * @see https://baserow.io/api-docs
 */
export const BASEROW_FILTER_TYPES = [
  'equal',
  'not_equal',
  'contains',
  'contains_not',
  'higher_than',
  'lower_than',
  'date_equal',
  'date_not_equal',
  'date_before',
  'date_after',
  'empty',
  'not_empty',
  'filename_contains',
  'has_file_type',
  'single_select_equal',
  'single_select_not_equal',
  'boolean',
  'link_row_has',
  'link_row_has_not',
  'multiple_select_has',
  'multiple_select_has_not',
] as const;

export type BaserowFilterType = (typeof BASEROW_FILTER_TYPES)[number];

// ============================================================================
// Filter Building Utilities
// ============================================================================

export interface FilterConfig {
  field: string;
  type: BaserowFilterType;
  value: FilterValue;
}

/**
 * Build a Baserow filter query parameter
 * Format: filter__field_name__filter_type=value
 */
export function buildFilterParam(config: FilterConfig): [string, string] {
  const key = `filter__${config.field}__${config.type}`;
  const value = config.value === null ? '' : String(config.value);
  return [key, value];
}

/**
 * Build multiple filter query parameters from a simple filter object
 * Uses 'equal' filter type by default
 */
export function buildSimpleFilters(
  filters: Filters,
  defaultType: BaserowFilterType = 'equal'
): Map<string, string> {
  const params = new Map<string, string>();

  if (!filters) {
    return params;
  }

  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined) {
      const [key, paramValue] = buildFilterParam({
        field,
        type: defaultType,
        value,
      });
      params.set(key, paramValue);
    }
  }

  return params;
}

/**
 * Build advanced filter parameters with specific filter types per field
 */
export function buildAdvancedFilters(
  configs: FilterConfig[]
): Map<string, string> {
  const params = new Map<string, string>();

  for (const config of configs) {
    const [key, value] = buildFilterParam(config);
    params.set(key, value);
  }

  return params;
}

// ============================================================================
// Filter Validation
// ============================================================================

/**
 * Validate that a filter type is supported
 */
export function isValidFilterType(type: string): type is BaserowFilterType {
  return BASEROW_FILTER_TYPES.includes(type as BaserowFilterType);
}

/**
 * Validate a filter value for a specific filter type
 */
export function validateFilterValue(
  type: BaserowFilterType,
  value: FilterValue
): boolean {
  switch (type) {
    case 'empty':
    case 'not_empty':
      // These filters don't require a value
      return true;

    case 'boolean':
      return typeof value === 'boolean';

    case 'higher_than':
    case 'lower_than':
      return typeof value === 'number';

    case 'date_equal':
    case 'date_not_equal':
    case 'date_before':
    case 'date_after':
      // Date values should be strings in ISO format or Date objects
      return typeof value === 'string';

    default:
      // Most filters accept string, number, or null
      return value === null || typeof value === 'string' || typeof value === 'number';
  }
}

// ============================================================================
// URL Builder Helpers
// ============================================================================

/**
 * Apply filters to a URL's search params
 */
export function applyFiltersToUrl(
  url: URL,
  filters: Filters,
  filterType: BaserowFilterType = 'equal'
): void {
  const filterParams = buildSimpleFilters(filters, filterType);

  for (const [key, value] of filterParams) {
    url.searchParams.set(key, value);
  }
}

/**
 * Apply advanced filters to a URL's search params
 */
export function applyAdvancedFiltersToUrl(
  url: URL,
  configs: FilterConfig[]
): void {
  const filterParams = buildAdvancedFilters(configs);

  for (const [key, value] of filterParams) {
    url.searchParams.set(key, value);
  }
}

// ============================================================================
// Filter Parsing
// ============================================================================

/**
 * Parse a filter query string parameter name
 * Returns null if not a valid filter parameter
 */
export function parseFilterParam(
  paramName: string
): { field: string; type: BaserowFilterType } | null {
  const match = paramName.match(/^filter__(.+)__(.+)$/);

  if (!match) {
    return null;
  }

  const [, field, type] = match;

  if (!field || !type || !isValidFilterType(type)) {
    return null;
  }

  return { field, type };
}

// ============================================================================
// Filter Combination Utilities
// ============================================================================

/**
 * Merge multiple filter objects into one
 * Later filters override earlier ones for the same field
 */
export function mergeFilters(...filterSets: (Filters | undefined)[]): Filters {
  const merged: Record<string, FilterValue> = {};

  for (const filters of filterSets) {
    if (filters) {
      Object.assign(merged, filters);
    }
  }

  return merged;
}

/**
 * Remove null/undefined values from filters
 */
export function cleanFilters(filters: Filters): Filters {
  if (!filters) {
    return undefined;
  }

  const cleaned: Record<string, FilterValue> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/**
 * Check if filters object is empty
 */
export function isEmptyFilters(filters: Filters): boolean {
  if (!filters) {
    return true;
  }

  return Object.keys(filters).length === 0;
}
