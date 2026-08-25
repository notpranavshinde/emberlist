import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { createDriveWorkspaceStore } from './mcp-workspace-store.js';
import { registerMcpTools } from './mcp-tools.js';

export async function handleMcpRequest(req, res, principal) {
  const server = new McpServer({ name: 'Emberlist', version: '1.0.0' }, {
    capabilities: { tools: {} },
    instructions: 'Manage the authenticated user’s Emberlist workspace. Prefer semantic tools; use exact raw replacement only when explicitly requested.',
  });
  const store = createDriveWorkspaceStore(principal);
  registerMcpTools(server, store, principal.timeZone);
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  req.auth = principal.authInfo;
  await server.connect(transport);
  try {
    await transport.handleRequest(req, res, req.body);
  } finally {
    await server.close();
  }
}
