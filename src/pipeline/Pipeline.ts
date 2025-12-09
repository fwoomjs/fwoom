import type { Context } from "../context/Context";

export type Handler = (ctx: Context) => any | Promise<any>;

export type Middleware = (ctx: Context, next: () => Promise<void>) => any | Promise<void>;

export interface CompiledPipeline {
  steps: Middleware[]; // flattened middleware + handler-wrapper
}

const pipelineCache = new WeakMap<Handler, CompiledPipeline>();

export function compilePipeline(
  middlewares: Middleware[],
  handler: Handler
): CompiledPipeline {
  const cached = pipelineCache.get(handler);
  if (cached) return cached;

  // Copy middleware list (snapshot for this handler)
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
  pipelineCache.set(handler, compiled);
  return compiled;
}

export async function runCompiledPipeline(
  compiled: CompiledPipeline,
  ctx: Context
): Promise<void> {
  const steps = compiled.steps;
  const len = steps.length;

  let index = 0;
  const calledFlags = new Array<boolean>(len);

  const next = async (): Promise<void> => {
    if (index >= len) return;

    const currentIdx = index++;
    calledFlags[currentIdx] = true;
    await steps[currentIdx](ctx, next);
  };

  try {
    // Kick off the pipeline by invoking next()
    await next();
    return;
  } catch (err) {
    throw err;
  }
}
