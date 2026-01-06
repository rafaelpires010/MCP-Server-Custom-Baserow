# Baserow MCP Server

A secure, custom MCP (Model Context Protocol) server for integrating Claude Desktop with Baserow cloud (baserow.io). This server provides controlled access to specific Baserow tables for Manufacturing Orders (MO) parts usage and inventory management.

## Features

- **Secure Table Access**: Only explicitly configured tables are accessible
- **Type-Safe**: Built with TypeScript with strict type checking
- **MCP Compatible**: Works with Claude Desktop and other MCP clients
- **CRUD Operations**: Full read, create, update, delete support
- **Pagination**: Built-in pagination support for large datasets
- **Filtering**: Filter records by field values
- **Logging**: Configurable logging levels for debugging

## Security

This MCP server implements strict security measures:

1. **Allow-List Only**: Tables must be explicitly configured via environment variables
2. **No Automatic Discovery**: The server does not expose all workspace tables
3. **Request Validation**: All requests are validated using Zod schemas
4. **Token from Environment**: API token is never hardcoded

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- A Baserow account with API access

### Steps

1. Clone or copy this project to your desired location:
   ```bash
   cd mcp-baserow-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file (see Configuration section below)

5. Build the project:
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Required: Your Baserow API token
# Get it from: https://baserow.io/api-docs (click "Generate Token")
BASEROW_API_TOKEN=your_api_token_here

# Optional: Baserow API base URL (default: https://api.baserow.io)
BASEROW_API_URL=https://api.baserow.io

# Optional: Logging level (debug, info, warn, error). Default: info
LOG_LEVEL=info

# Required: Table ID mappings
# These are the ONLY tables the MCP server will expose
# Find table IDs in Baserow: Open table -> API Docs -> Look for table_id in URLs

TABLE_ID_PRODUCTION_ORDERS=123456
TABLE_ID_MO_PARTS_USAGE=123457
TABLE_ID_RAW_MATERIAL_LOTS=123458
TABLE_ID_INVENTORY_TRANSACTIONS=123459
TABLE_ID_FINISHED_GOODS=123460
TABLE_ID_CYCLE_COUNTS=123461
```

### Finding Table IDs in Baserow

1. Log in to your Baserow workspace
2. Open the table you want to expose
3. Click the "..." menu and select "API documentation"
4. Look for the table ID in the API URL (e.g., `/api/database/rows/table/123456/`)

## Claude Desktop Integration

### Configuration

Add the following to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Baserow Custom MCP": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-baserow-server\\dist\\server.js"],
      "env": {
        "BASEROW_API_TOKEN": "your_api_token_here",
        "TABLE_ID_PRODUCTION_ORDERS": "123456",
        "TABLE_ID_MO_PARTS_USAGE": "123457",
        "TABLE_ID_RAW_MATERIAL_LOTS": "123458",
        "TABLE_ID_INVENTORY_TRANSACTIONS": "123459",
        "TABLE_ID_FINISHED_GOODS": "123460",
        "TABLE_ID_CYCLE_COUNTS": "123461"
      }
    }
  }
}
```

Or if you prefer using a `.env` file:

```json
{
  "mcpServers": {
    "Baserow Custom MCP": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-baserow-server\\dist\\server.js"],
      "cwd": "C:\\path\\to\\mcp-baserow-server"
    }
  }
}
```

### Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the MCP server.

## Available MCP Tools

### 1. list_tables

List all available tables that can be accessed.

**Request:**
```json
{
  "tool": "list_tables"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "name": "production_orders",
        "id": 123456,
        "description": "Manufacturing/Production orders for tracking MO lifecycle"
      },
      {
        "name": "mo_parts_usage",
        "id": 123457,
        "description": "Parts consumption records for manufacturing orders"
      }
    ]
  }
}
```

### 2. read

Read records from a table with optional filtering and pagination.

**Request:**
```json
{
  "tool": "read",
  "table": "mo_parts_usage",
  "filters": {
    "mo_number": "MO-12345"
  },
  "page": 1,
  "size": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 150,
    "next": "https://api.baserow.io/...",
    "previous": null,
    "results": [
      {
        "id": 1,
        "mo_number": "MO-12345",
        "part": "PART-001",
        "quantity_used": 85.5
      }
    ]
  },
  "metadata": {
    "count": 150,
    "page": 1,
    "size": 50
  }
}
```

### 3. create

Create a new record in a table.

**Request:**
```json
{
  "tool": "create",
  "table": "mo_parts_usage",
  "data": {
    "mo": 123,
    "part": 456,
    "quantity_used": 85.5,
    "lot_number": "LOT-2024-001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 999,
    "mo": 123,
    "part": 456,
    "quantity_used": 85.5,
    "lot_number": "LOT-2024-001"
  }
}
```

### 4. update

Update an existing record.

**Request:**
```json
{
  "tool": "update",
  "table": "production_orders",
  "record_id": 987,
  "data": {
    "deduction_method": "real_usage",
    "status": "closed"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 987,
    "deduction_method": "real_usage",
    "status": "closed"
  }
}
```

### 5. delete

Delete a record from a table.

**Request:**
```json
{
  "tool": "delete",
  "table": "mo_parts_usage",
  "record_id": 123
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "record_id": 123
  }
}
```

## Example Usage with Claude

Once configured, you can ask Claude to interact with your Baserow tables:

> "List all parts used in manufacturing order MO-12345"

Claude will use the `read` tool to query the `mo_parts_usage` table.

> "Update production order 987 to status 'completed' with deduction method 'real_usage'"

Claude will use the `update` tool to modify the record.

> "Create a new parts usage record for MO-12345: part WIDGET-001, quantity 50, lot LOT-2024-002"

Claude will use the `create` tool to add the new record.

## Development

### Available Scripts

```bash
# Build TypeScript to JavaScript
npm run build

# Run in development mode with hot reload
npm run dev

# Type check without building
npm run typecheck

# Clean build directory
npm run clean

# Start the built server
npm start
```

### Project Structure

```
mcp-baserow-server/
├── src/
│   ├── server.ts           # Main entry point, MCP server setup
│   ├── mcp/
│   │   ├── handler.ts      # MCP request routing and handling
│   │   └── schema.ts       # Tool definitions for MCP
│   ├── baserow/
│   │   ├── client.ts       # Baserow REST API client
│   │   └── tables.ts       # High-level table operations
│   ├── security/
│   │   └── allowList.ts    # Table access control
│   ├── utils/
│   │   ├── filters.ts      # Filter building utilities
│   │   └── logger.ts       # Logging utility
│   └── types/
│       └── mcp.ts          # TypeScript type definitions
├── dist/                   # Compiled JavaScript (after build)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Adding New Tables

1. Add the table name to `ALLOWED_TABLE_NAMES` in `src/types/mcp.ts`
2. Add the table configuration in `src/security/allowList.ts`
3. Add the environment variable in `.env`

## Error Handling

The server returns structured error responses:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED_TABLE_ACCESS",
    "message": "Access denied: Table \"secret_data\" is not authorized for access",
    "details": {
      "table": "secret_data"
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request parameters failed validation |
| `UNAUTHORIZED_TABLE_ACCESS` | Attempted to access a non-allowed table |
| `BASEROW_API_ERROR` | Baserow API returned an error |
| `CONNECTION_ERROR` | Failed to connect to Baserow |
| `INTERNAL_ERROR` | Unexpected server error |

## Troubleshooting

### Server doesn't start

1. Check that all required environment variables are set
2. Verify the Baserow API token is valid
3. Ensure at least one table ID is configured

### "Table not found" errors

1. Verify the table ID in Baserow API docs
2. Check that the table exists and is accessible with your token
3. Ensure the table is configured in environment variables

### Connection errors

1. Check your internet connection
2. Verify the `BASEROW_API_URL` is correct
3. Ensure your API token has the required permissions

### Enable debug logging

Set `LOG_LEVEL=debug` in your environment to see detailed logs.

## Future Enhancements

This server is designed for extensibility. Planned features:

- [ ] OCR/BPR pipeline integration
- [ ] Batch operations support
- [ ] Field-level access control
- [ ] Caching for frequently accessed data
- [ ] Webhook support for real-time updates

## License

MIT
