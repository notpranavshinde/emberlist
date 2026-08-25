import { resolveMcpRequest } from '../../api/_lib/mcp-auth-adapter.js';
import { getMcpConfig } from '../../api/_lib/mcp-auth.js';
import { handleMcpRequest } from '../../api/_lib/mcp-server.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version');
  try {
    await enforceRateLimit(req, res, { name: 'mcp-resource', limit: 120, windowSeconds: 60 });
    const principal = await resolveMcpRequest(req);
    await handleMcpRequest(req, res, principal);
  } catch (error) {
    if (res.headersSent || res.writableEnded) return;
    const status = error?.statusCode ?? 500;
    if (status === 401) {
      const resource = new URL(getMcpConfig(req).resource);
      const metadata = new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin);
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error?.code ?? (status === 401 ? 'invalid_token' : 'server_error'),
      error_description: status < 500 && error instanceof Error ? error.message : 'Request failed.' }));
  }
}
