#!/usr/bin/env node
/**
 * MCP Server Entry Point
 * Custom Baserow MCP Server for Claude Desktop integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

import { logger } from './utils/logger.js';
import { allowListManager } from './security/allowList.js';
import { getMCPHandler } from './mcp/handler.js';
import { getToolDefinitions } from './mcp/schema.js';

// ============================================================================
// Environment Configuration
// ============================================================================

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// Server Initialization
// ============================================================================

const SERVER_NAME = 'baserow-mcp-server';
const SERVER_VERSION = '1.0.0';

async function initializeServer(): Promise<Server> {
  // Initialize logger
  logger.initialize();
  logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);

  // Initialize allow list from environment variables
  try {
    allowListManager.initialize();
    logger.info('Security allow list initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize allow list', error);
    throw error;
  }

  // Verify Baserow API token is configured
  if (!process.env['BASEROW_API_TOKEN']) {
    throw new Error(
      'BASEROW_API_TOKEN environment variable is required. ' +
      'Please set it in your .env file or environment.'
    );
  }

  // Create MCP server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  return server;
}

// ============================================================================
// Tool Handlers
// ============================================================================

function registerToolHandlers(server: Server): void {
  const mcpHandler = getMCPHandler();

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
    logger.debug('Received list_tools request');

    const tools = getToolDefinitions();

    logger.debug(`Returning ${tools.length} tools`);

    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    logger.info(`Received tool call: ${name}`);
    logger.debug('Tool arguments:', args);

    try {
      const response = await mcpHandler.handleToolCall(name, args);

      // Format response for MCP
      if (response.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } else {
        // Return error response
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      logger.error(`Error handling tool call ${name}:`, error);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
              },
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  try {
    // Initialize server
    const server = await initializeServer();

    // Register tool handlers
    registerToolHandlers(server);

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    logger.info('MCP server started successfully');
    logger.info(`Listening on stdio for MCP requests...`);

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down MCP server...');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

// Run the server
main();
