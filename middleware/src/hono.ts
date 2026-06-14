import type { Context, MiddlewareHandler, Next } from 'hono';
import { evaluatePayment, resolveConfig, to402 } from './index.js';
import type { OtomatConfig } from './types.js';

/** Hono adapter: `app.get(path, otomat.hono({ price, payTo }), handler)`. */
export function otomatHono(config: OtomatConfig): MiddlewareHandler {
  const resolved = resolveConfig(config);
  return async (c: Context, next: Next) => {
    const reqLike = {
      method: c.req.method,
      url: c.req.url,
      header: (name: string): string | undefined => c.req.header(name),
    };

    const decision = await evaluatePayment(resolved, reqLike);

    if (decision.outcome === 'proceed') {
      c.header(decision.header.name, decision.header.value);
      await next();
      return;
    }
    if (decision.outcome === 'error') {
      return c.json({ error: decision.message }, 502);
    }
    const rendered = to402(decision);
    for (const [key, value] of Object.entries(rendered.headers)) {
      c.header(key, value);
    }
    return c.json(rendered.body, 402);
  };
}
