import { Router } from "../router/Router";
import { FwoomContext, Context } from "../context/Context";
import { runPipeline, Middleware, Handler } from "../pipeline/Pipeline";
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

export interface FwoomConstructorOptions extends FwoomOptions {
	adapter?: HttpAdapter;
}

export class Fwoom {
	private adapter: HttpAdapter;
	private router: Router;
	private middlewares: Middleware[] = [];
	private di: Record<string, unknown> = {};
	private errorHandler: ErrorHandler = defaultErrorHandler;
	private options: Required<FwoomOptions>;
	private started = false;

	constructor(opts?: FwoomConstructorOptions) {
		// Merge base options
		const mergedOpts: Required<FwoomOptions> = {
			...defaultOptions,
			...(opts || {}),
			server: {
				...defaultOptions.server,
				...((opts && opts.server) || {}),
			},
		};

		// Adapter: use provided adapter or default NodeAdapter
		const adapter = opts?.adapter ?? new NodeAdapter(mergedOpts.server);

		this.adapter = adapter;
		this.router = new Router();
		this.options = mergedOpts;
	}

	// ---------- ROUTING HELPERS ----------

	private addRoute(method: string, path: string, handler: Handler): this {
		this.router.addRoute({ method: method.toUpperCase(), path, handler });
		return this;
	}

	get(path: string, handler: Handler): this {
		return this.addRoute("GET", path, handler);
	}

	post(path: string, handler: Handler): this {
		return this.addRoute("POST", path, handler);
	}

	put(path: string, handler: Handler): this {
		return this.addRoute("PUT", path, handler);
	}

	patch(path: string, handler: Handler): this {
		return this.addRoute("PATCH", path, handler);
	}

	delete(path: string, handler: Handler): this {
		return this.addRoute("DELETE", path, handler);
	}

	head(path: string, handler: Handler): this {
		return this.addRoute("HEAD", path, handler);
	}

	optionsRoute(path: string, handler: Handler): this {
		return this.addRoute("OPTIONS", path, handler);
	}

	// ---------- MIDDLEWARE ----------

	use(mw: Middleware): this {
		this.middlewares.push(mw);
		return this;
	}

	// ---------- DEPENDENCY INJECTION ----------

	decorate(name: string, value: unknown): this {
		this.di[name] = value;
		return this;
	}

	// ---------- ERROR HANDLING ----------

	setErrorHandler(handler: ErrorHandler): this {
		this.errorHandler = handler;
		return this;
	}

	// ---------- SERVER LIFECYCLE ----------

	async listen(port = 3000, host = "0.0.0.0"): Promise<void> {
		if (this.started) {
			throw new Error("Fwoom server already started");
		}
		this.started = true;

		await this.adapter.listen(port, host, (rawReq, rawRes) => {
			this.handleRequest(rawReq, rawRes).catch((err) => {
				console.error("Unhandled Fwoom internal error:", err);
			});
		});
	}

	async close(): Promise<void> {
		await this.adapter.close();
	}

	// ---------- REQUEST HANDLING CORE ----------

	private async handleRequest(
		rawReq: RawRequestNode,
		rawRes: RawResponseNode
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
			path,
			method,
			params: match.params,
			query,
			di: this.di,
		});

		try {
			await this.readBody(ctx);
			await runPipeline(this.middlewares, match.route.handler, ctx);
		} catch (err: any) {
			await this.errorHandler(err, ctx);
		}
	}

	// ---------- BODY PARSER ----------

	private async readBody(ctx: Context): Promise<void> {
		const req = ctx.req;
		const method = ctx.method;

		if (!["POST", "PUT", "PATCH"].includes(method)) {
			ctx.body = undefined;
			return;
		}

		const contentType =
			(ctx.headers["content-type"] as string | undefined) || "";
		const isJson = contentType.includes("application/json");

		const chunks: Buffer[] = [];
		let total = 0;
		const limit = this.options.bodyLimit;

		await new Promise<void>((resolve, reject) => {
			req.on("data", (chunk: Buffer) => {
				total += chunk.length;
				if (total > limit) {
					reject(new Error("Payload too large"));
					req.destroy();
					return;
				}
				chunks.push(chunk);
			});
			req.on("end", () => resolve());
			req.on("error", reject);
		});

		if (!chunks.length) {
			ctx.body = undefined;
			return;
		}

		const buf = Buffer.concat(chunks);

		if (isJson) {
			try {
				ctx.body = JSON.parse(buf.toString("utf8"));
			} catch {
				ctx.body = undefined;
				ctx.throw(400, "Invalid JSON body");
			}
		} else {
			ctx.body = buf;
		}
	}
}
