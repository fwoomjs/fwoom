import { Router } from "../router/Router";
import { FwoomContext, Context } from "../context/Context";
import {
  compilePipeline,
  runCompiledPipeline,
  Middleware,
  Handler,
} from "../pipeline/Pipeline";
import { parsePathAndQuery } from "../utils/url";
import { defaultErrorHandler, ErrorHandler } from "../error/ErrorHandler";
import type {
  HttpAdapter,
  RawRequestNode,
  RawResponseNode,
} from "../runtime/HttpAdapter";
import { NodeAdapter } from "../runtime/NodeAdapter";
import type { FwoomOptions } from "./options";
import { defaultOptions } from "./options";
import { PluginContext, FwoomPlugin } from "./plugin";

/**
 * Constructor options for Fwoom.
 */
export interface FwoomConstructorOptions extends FwoomOptions {
  adapter?: HttpAdapter;
}

export class Fwoom {
  private adapter: HttpAdapter;
  private router: Router;

  // GLOBAL DI and GLOBAL middlewares
  private di: Record<string, unknown> = {};
  private globalMiddlewares: Middleware[] = [];
  private errorHandler: ErrorHandler = defaultErrorHandler;

  // Plugin System V3
  private globalPlugins: PluginContext[] = []; // plugins without prefix
  private closeHandlers: Array<() => void | Promise<void>> = [];

  private options: Required<FwoomOptions>;
  private started = false;

  constructor(opts?: FwoomConstructorOptions) {
    const mergedOpts: Required<FwoomOptions> = {
      ...defaultOptions,
      ...(opts || {}),
      server: {
        ...defaultOptions.server,
        ...((opts && opts.server) || {}),
      },
    };

    this.options = mergedOpts;
    this.adapter = opts?.adapter ?? new NodeAdapter(mergedOpts.server);

    this.router = new Router();
  }

  // --------------------------------------------------------------------------
  // PUBLIC API: ROUTE REGISTRATION (when not using plugins)
  // --------------------------------------------------------------------------

  private _registerDirectRoute(method: string, path: string, handler: Handler) {
    this._registerRoute(method, path, handler, undefined);
    return this;
  }

  get(path: string, handler: Handler) {
    return this._registerDirectRoute("GET", path, handler);
  }
  post(path: string, handler: Handler) {
    return this._registerDirectRoute("POST", path, handler);
  }
  put(path: string, handler: Handler) {
    return this._registerDirectRoute("PUT", path, handler);
  }
  patch(path: string, handler: Handler) {
    return this._registerDirectRoute("PATCH", path, handler);
  }
  delete(path: string, handler: Handler) {
    return this._registerDirectRoute("DELETE", path, handler);
  }
  head(path: string, handler: Handler) {
    return this._registerDirectRoute("HEAD", path, handler);
  }
  optionsRoute(path: string, handler: Handler) {
    return this._registerDirectRoute("OPTIONS", path, handler);
  }

  // --------------------------------------------------------------------------
  // PLUGINS
  // --------------------------------------------------------------------------

  async register(plugin: FwoomPlugin, opts?: any): Promise<this> {
    const prefix = opts?.prefix || "";

    const pluginCtx = new PluginContext(this, prefix, undefined);

    // Track global plugins: plugins with NO prefix are global
    if (!opts?.prefix) {
      this.globalPlugins.push(pluginCtx);
    }

    const result = plugin(pluginCtx, opts);
    if (result instanceof Promise) await result;

    return this;
  }

  // --------------------------------------------------------------------------
  // PRIVATE: Route registration from PluginContext
  // --------------------------------------------------------------------------

  /**
   * _registerRoute
   *
   * Builds the middleware chain and DI chain for a route,
   * compiles pipeline, and registers wrapper handler.
   */
  _registerRoute(
    method: string,
    path: string,
    handler: Handler,
    pluginCtx?: PluginContext,
  ) {
    // ----------------------------------------------------------------------
    // 1. BUILD FINAL MIDDLEWARE STACK
    // ----------------------------------------------------------------------

    const mws: Middleware[] = [];

    // (a) global middlewares from app.use()
    mws.push(...this.globalMiddlewares);

    // (b) global plugins' middlewares
    for (const gp of this.globalPlugins) {
      mws.push(...gp.middlewares);
    }

    // (c) plugin chain middlewares (parent → child)
    const pluginChain: PluginContext[] = [];
    let cur = pluginCtx;
    while (cur) {
      pluginChain.push(cur);
      cur = cur.parent;
    }
    pluginChain.reverse(); // ensure parent → child order

    for (const p of pluginChain) {
      mws.push(...p.middlewares);
    }

    // Snapshot for pipeline caching
    const mwsSnapshot = [...mws];

    // ----------------------------------------------------------------------
    // 2. BUILD DI CHAIN
    // ----------------------------------------------------------------------

    // Start with global app DI
    const scopedDI = Object.create(this.di);

    // (a) apply global plugin decorations
    for (const gp of this.globalPlugins) {
      Object.assign(scopedDI, gp.decorations);
    }

    // (b) apply plugin chain decorations (parent → child)
    for (const p of pluginChain) {
      Object.assign(scopedDI, p.decorations);
    }

    // ----------------------------------------------------------------------
    // 3. DETERMINE ERROR HANDLER
    // ----------------------------------------------------------------------

    let routeErrorHandler: ErrorHandler | undefined = undefined;

    // check plugin chain from child → parent
    for (let i = pluginChain.length - 1; i >= 0; i--) {
      if (pluginChain[i].errorHandler) {
        routeErrorHandler = pluginChain[i].errorHandler;
        break;
      }
    }

    // if none, fallback to app error handler
    if (!routeErrorHandler) {
      routeErrorHandler = this.errorHandler;
    }

    // ----------------------------------------------------------------------
    // 4. COMPILE PIPELINE FOR THIS ROUTE
    // ----------------------------------------------------------------------

    const compiled = compilePipeline(mwsSnapshot, handler);

    // ----------------------------------------------------------------------
    // 5. CREATE WRAPPER HANDLER
    // ----------------------------------------------------------------------

    const routeWrapper: Handler = async (ctx) => {
      // attach scoped DI
      ctx.di = scopedDI;

      try {
        await runCompiledPipeline(compiled, ctx);
      } catch (err: any) {
        try {
          await routeErrorHandler!(err, ctx);
        } catch (fallbackErr) {
          await this.errorHandler(fallbackErr, ctx);
        }
      }
    };

    // ----------------------------------------------------------------------
    // 6. REGISTER TO ROUTER
    // ----------------------------------------------------------------------

    this.router.addRoute({
      method: method.toUpperCase(),
      path,
      handler: routeWrapper,
    });
  }

  // --------------------------------------------------------------------------
  // GLOBAL MIDDLEWARE
  // --------------------------------------------------------------------------

  use(mw: Middleware) {
    this.globalMiddlewares.push(mw);
    return this;
  }

  // --------------------------------------------------------------------------
  // GLOBAL DI
  // --------------------------------------------------------------------------

  decorate(name: string, value: unknown) {
    this.di[name] = value;
    return this;
  }

  // --------------------------------------------------------------------------
  // ERROR HANDLER
  // --------------------------------------------------------------------------

  setErrorHandler(handler: ErrorHandler) {
    this.errorHandler = handler;
    return this;
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // --------------------------------------------------------------------------

  onClose(fn: () => void | Promise<void>) {
    this.closeHandlers.push(fn);
    return this;
  }

  async close(): Promise<void> {
    // run close handlers in reverse registration order
    for (let i = this.closeHandlers.length - 1; i >= 0; i--) {
      try {
        await this.closeHandlers[i]();
      } catch (err) {
        console.error("Error in onClose:", err);
      }
    }

    await this.adapter.close();
  }

  // --------------------------------------------------------------------------
  // START SERVER
  // --------------------------------------------------------------------------

  async listen(port = 3000, host = "0.0.0.0") {
    if (this.started) {
      throw new Error("Fwoom server already started");
    }
    this.started = true;

    await this.adapter.listen(port, host, (rawReq, rawRes) => {
      this.handleRequest(rawReq, rawRes).catch((err) => {
        console.error("Unhandled Fwoom internal error:", err);
      });
    });

    console.log(`Fwoom running at http://${host}:${port}`);
  }

  // --------------------------------------------------------------------------
  // REQUEST HANDLER
  // --------------------------------------------------------------------------

  private async handleRequest(
    rawReq: RawRequestNode,
    rawRes: RawResponseNode,
  ): Promise<void> {
    const req = rawReq.req;
    const res = rawRes.res;

    const { path, query } = parsePathAndQuery(req.url);
    const method = (req.method || "GET").toUpperCase();

    const match = this.router.match(method, path);

    if (!match) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    const ctx: Context = new FwoomContext({
      rawReq,
      rawRes,
      method,
      path,
      params: match.params,
      query,
      di: this.di, // overridden in routeWrapper
    });

    try {
      await match.route.handler(ctx);
    } catch (err) {
      await this.errorHandler(err, ctx);
    }
  }
}
