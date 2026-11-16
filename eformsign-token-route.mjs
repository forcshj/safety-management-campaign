// Node.js 20+ / Express. Use with an eformsign Signature API key.
import { createPrivateKey, sign } from 'node:crypto';

const tokenUrl = 'https://api.eformsign.com/v2.0/api_auth/access_token';
const pageOrigin = 'https://forcshj.github.io';
const path = '/api/eformsign/bulk-token';

export function mountEformsignBulkTokenRoute(app, { resolveMemberId, rateLimit }) {
  if (typeof resolveMemberId !== 'function' || typeof rateLimit !== 'function') {
    throw new TypeError('Member authorization and rate-limit middleware are required');
  }

  const apiKey = process.env.EFORMSIGN_API_KEY;
  const secretKey = process.env.EFORMSIGN_SECRET_KEY?.trim();
  if (!apiKey || !secretKey || !/^(?:[a-f0-9]{2})+$/i.test(secretKey)) {
    throw new Error('Configure the eformsign API key and hex signing key on the server');
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(secretKey, 'hex'),
    format: 'der',
    type: 'pkcs8'
  });
  if (privateKey.asymmetricKeyType !== 'ec') throw new Error('Expected an EC signing key');

  function cors(req, res, next) {
    res.vary('Origin');
    res.set('Cache-Control', 'no-store');
    if (req.get('Origin') !== pageOrigin) return res.status(403).end();

    res.set({
      'Access-Control-Allow-Origin': pageOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return next();
  }

  app.options(path, cors, (_req, res) => res.status(204).end());
  app.post(path, cors, rateLimit, async (req, res) => {
    if (!req.is('application/json')) return res.status(415).end();

    try {
      // Resolve from a verified session and campaign role, never from req.body.
      const memberId = await resolveMemberId(req);
      if (typeof memberId !== 'string' || !memberId.trim()) return res.status(403).end();

      const executionTime = Date.now();
      const signature = sign('sha256', Buffer.from(String(executionTime), 'utf8'), privateKey)
        .toString('hex');
      const upstream = await fetch(tokenUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Buffer.from(apiKey, 'utf8').toString('base64')}`,
          eformsign_signature: signature
        },
        body: JSON.stringify({ execution_time: executionTime, member_id: memberId })
      });
      if (!upstream.ok) return res.status(502).end();
      const { oauth_token: tokens } = await upstream.json();
      if (!tokens || !isToken(tokens.access_token)) return res.status(502).end();

      const result = { member_id: memberId, access_token: tokens.access_token };
      if (process.env.EFORMSIGN_FORWARD_REFRESH_TOKEN === 'true' && isToken(tokens.refresh_token)) {
        result.refresh_token = tokens.refresh_token;
      }
      return res.json(result);
    } catch {
      return res.status(502).end();
    }
  });
}

function isToken(value) {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value);
}
