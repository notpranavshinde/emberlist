import driveSync from '../../server/drive-sync.js';
import cleanup from '../../server/mcp/cleanup.js';
import grants from '../../server/mcp/grants.js';
import resource from '../../server/mcp/resource.js';
import authorizationServer from '../../server/mcp/oauth/authorization-server.js';
import authorize from '../../server/mcp/oauth/authorize.js';
import googleCallback from '../../server/mcp/oauth/google/callback.js';
import protectedResource from '../../server/mcp/oauth/protected-resource.js';
import register from '../../server/mcp/oauth/register.js';
import revoke from '../../server/mcp/oauth/revoke.js';
import token from '../../server/mcp/oauth/token.js';

export { readJsonBody } from '../../server/drive-sync.js';

const routes = {
  resource,
  grants,
  'oauth-authorization-server': authorizationServer,
  'oauth-authorize': authorize,
  'oauth-google-callback': googleCallback,
  'oauth-protected-resource': protectedResource,
  'oauth-register': register,
  'oauth-revoke': revoke,
  'oauth-token': token,
  cleanup,
};

export default function handler(req, res) {
  const route = req.query?.mcp_route
    ?? new URL(req.url ?? '/api/drive/sync-file', 'https://emberlist.invalid').searchParams.get('mcp_route');
  if (!route) return driveSync(req, res);
  const routeHandler = routes[route];
  if (routeHandler) return routeHandler(req, res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'not_found' }));
}
