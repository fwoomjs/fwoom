import type { Fwoom } from "./Fwoom";
import type { Middleware, Handler } from "../pipeline/Pipeline";
import type { ErrorHandler } from "../error/ErrorHandler";

export type FwoomPlugin = (app: PluginContext, opts?: any) => void | Promise<void>;

export class PluginContext {
  private app: Fwoom;
  readonly prefix: string;
  readonly parent?: PluginContext | undefined;

  // plugin-local state
  middlewares: Middleware[] = [];
  decorations: Record<string, unknown> = {};
  errorHandler?: ErrorHandler;
  private closeHandlers: Array<() => Promise<void> | void> = [];

  constructor(app: Fwoom, prefix = "", parent?: PluginContext) {
    this.app = app;
    this.prefix = prefix || "";
    this.parent = parent;
  }

  // Build full path combining this prefix and route path
  private resolvePath(path: string): string {
    if (!path) return this.prefix || "/";
    if (!this.prefix) return path;
    if (path === "/") return this.prefix;
    // ensure slashes
    const left = this.prefix.endsWith("/") ? this.prefix.slice(0, -1) : this.prefix;
    const right = path.startsWith("/") ? path : "/" + path;
    return left + right;
  }

  // Expose route registration (these forward to the app with context)
  get(path: string, handler: Handler) {
    this.app._registerRoute("GET", this.resolvePath(path), handler, this);
    return this;
  }
  post(path: string, handler: Handler) {
    this.app._registerRoute("POST", this.resolvePath(path), handler, this);
    return this;
  }
  put(path: string, handler: Handler) {
    this.app._registerRoute("PUT", this.resolvePath(path), handler, this);
    return this;
  }
  patch(path: string, handler: Handler) {
    this.app._registerRoute("PATCH", this.resolvePath(path), handler, this);
    return this;
  }
  delete(path: string, handler: Handler) {
    this.app._registerRoute("DELETE", this.resolvePath(path), handler, this);
    return this;
  }
  head(path: string, handler: Handler) {
    this.app._registerRoute("HEAD", this.resolvePath(path), handler, this);
    return this;
  }
  optionsRoute(path: string, handler: Handler) {
    this.app._registerRoute("OPTIONS", this.resolvePath(path), handler, this);
    return this;
  }

  // Plugin-local middleware
  use(mw: Middleware) {
    this.middlewares.push(mw);
    return this;
  }

  // Decorate plugin-scoped DI
  decorate(name: string, value: unknown) {
    this.decorations[name] = value;
    return this;
  }

  // Allow plugin to register nested plugins
  async register(plugin: FwoomPlugin, opts?: any) {
    const nestedPrefix = opts?.prefix || "";
    const child = new PluginContext(this.app, this.resolvePath(nestedPrefix), this);
    const res = plugin(child, opts);
    if (res instanceof Promise) await res;
    return this;
  }

  // Plugin-specific error handler
  setErrorHandler(fn: ErrorHandler) {
    this.errorHandler = fn;
    return this;
  }

  // Register close handlers to be executed when the app closes
  onClose(fn: () => void | Promise<void>) {
    this.closeHandlers.push(fn);
    // Also register to app so that app.close() runs it
    this.app.onClose(fn);
    return this;
  }

  // Expose ability to register route-less behavior (like onClose) or global-style use
  // For convenience: register plugin-level "register" hook
  async registerPlugin(plugin: FwoomPlugin, opts?: any) {
    return this.register(plugin, opts);
  }
}
