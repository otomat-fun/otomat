import type { NextRequest } from 'next/server';
import { evaluatePayment, resolveConfig, to402 } from './index.js';
import type { OtomatConfig } from './types.js';

export type NextRouteHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx,
) => Response | Promise<Response>;

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ 'content-type': 'application/json', ...(extraHeaders ?? {}) });
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Next.js App Router adapter. Wraps a route handler:
 *
 * ```ts
 * export const GET = otomat.next({ price: '$0.002', payTo }, async (req) => Response.json({ ok: true }));
 * ```
 */
export function otomatNext<Ctx = unknown>(
  config: OtomatConfig,
  handler: NextRouteHandler<Ctx>,
): NextRouteHandler<Ctx> {
  const resolved = resolveConfig(config);
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const request = req as unknown as Request;
    const reqLike = {
      method: request.method,
      url: request.url,
      header: (name: string): string | undefined => request.headers.get(name) ?? undefined,
    };

    const decision = await evaluatePayment(resolved, reqLike);

    if (decision.outcome === 'error') {
      return jsonResponse({ error: decision.message }, decision.status);
    }
    if (decision.outcome !== 'proceed') {
      const rendered = to402(decision);
      return jsonResponse(rendered.body, rendered.status, rendered.headers);
    }

    const res = await handler(req, ctx);
    const headers = new Headers(res.headers);
    headers.set(decision.header.name, decision.header.value);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
