import type { Request } from 'express';

/** IP real do cliente sem depender de `trust proxy`: usa X-Forwarded-For (nginx/GCP) quando presente. */
export function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length) return fwd[0];
  return req.ip || req.socket?.remoteAddress || undefined;
}
