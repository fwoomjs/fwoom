import type { Context } from "../context/Context";

export type Handler = (ctx: Context) => any | Promise<any>;

export type Middleware = (ctx: Context, next: () => Promise<void>) => any | Promise<void>;

export interface CompiledPipeline {
  steps: Middleware[]; // flattened middleware + handler-wrapper
}

const pipelineCache: WeakMap<Middleware[], WeakMap<Handler, CompiledPipeline>> = new WeakMap();

export function compilePipeline(
  middlewares: Middleware[],
  handler: Handler
): CompiledPipeline {
  let inner = pipelineCache.get(middlewares);
  if (!inner) {
    inner = new WeakMap();
    pipelineCache.set(middlewares, inner);
  }

  const cached = inner.get(handler);
  if (cached) return cached;

  // Copy middleware list (we assume caller created snapshot already)
  const steps: Middleware[] = [...middlewares];

  // Wrap handler into a final-step middleware
  const handlerWrapper: Middleware = async (ctx, _next) => {
    const result = await handler(ctx);

    const resAny: any = (ctx as any).res;
    const manual = (ctx as any)._manualResponse === true;
    const headersSent =
      !!(resAny && (resAny.headersSent || resAny.writableEnded));

    if (!manual && !headersSent) {
      if (result === undefined || result === null) ctx.send(undefined);
      else ctx.send(result);
    }
  };

  steps.push(handlerWrapper);

  const compiled: CompiledPipeline = { steps };
  inner.set(handler, compiled);
  return compiled;
}

export async function runCompiledPipeline(
  compiled: CompiledPipeline,
  ctx: Context
): Promise<void> {
  const steps = compiled.steps;
  const len = steps.length;

  let index = 0;

  const next = async (): Promise<void> => {
    if (index >= len) return;
    const currentIdx = index++;
    await steps[currentIdx](ctx, next);
  };

  try {
    await next();
    return;
  } catch (err) {
    throw err;
  }
}
