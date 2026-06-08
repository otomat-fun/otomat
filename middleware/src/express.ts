import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { evaluatePayment, resolveConfig, to402 } from './index.js';
import type { OtomatConfig } from './types.js';

function fullUrl(req: Request): string {
  try {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto =
      (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : undefined) ??
      req.protocol ??
      'http';
    const host = req.get?.('host') ?? (req.headers.host as string | undefined) ?? 'localhost';
    const path = (req as unknown as { originalUrl?: string }).originalUrl ?? req.url ?? '/';
    return `${proto}://${host}${path}`;
  } catch {
    return req.url ?? '/';
  }
}

/** Express adapter: `app.get(path, otomat.express({ price, payTo }), handler)`. */
export function otomatExpress(config: OtomatConfig): RequestHandler {
  const resolved = resolveConfig(config);
  return (req: Request, res: Response, next: NextFunction): void => {
    const reqLike = {
      method: req.method,
      url: fullUrl(req),
      header: (name: string): string | undefined => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] : value;
      },
    };

    void (async () => {
      try {
        const decision = await evaluatePayment(resolved, reqLike);
        if (decision.outcome === 'proceed') {
          res.setHeader(decision.header.name, decision.header.value);
          next();
          return;
        }
        if (decision.outcome === 'error') {
          res.status(decision.status).json({ error: decision.message });
          return;
        }
        const rendered = to402(decision);
        for (const [key, value] of Object.entries(rendered.headers)) {
          res.setHeader(key, value);
        }
        res.status(rendered.status).json(rendered.body);
      } catch (err) {
        next(err as Error);
      }
    })();
  };
}
