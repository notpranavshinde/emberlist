import { getOrigin, json, methodNotAllowed, setNoStore } from '../../../api/_lib/auth.js';

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const issuer = getOrigin(req);
  return json(res, 200, {
    issuer,
    authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/api/mcp/oauth/token`,
    registration_endpoint: `${issuer}/api/mcp/oauth/register`,
    revocation_endpoint: `${issuer}/api/mcp/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['emberlist.workspace', 'offline_access'],
  });
}
