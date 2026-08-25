import { getOrigin, json, methodNotAllowed, setNoStore } from '../../../api/_lib/auth.js';

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const origin = getOrigin(req);
  return json(res, 200, {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['emberlist.workspace'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/privacy`,
  });
}
