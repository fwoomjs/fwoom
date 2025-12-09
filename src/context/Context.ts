import type {
	IncomingHttpHeaders,
	IncomingMessage,
	ServerResponse,
} from "http";
import type { RawRequestNode, RawResponseNode } from "../runtime/HttpAdapter";
import { HttpError } from "../error/HttpError";

export interface ContextOptions {
	rawReq: RawRequestNode;
	rawRes: RawResponseNode;
	path: string;
	method: string;
	params: Record<string, string>;
	query: Record<string, string | string[]>;
	di: Record<string, unknown>;
}

export class FwoomContext {
	// core
	readonly req: IncomingMessage;
	readonly res: ServerResponse;
	readonly method: string;
	readonly path: string;
	readonly params: Record<string, string>;
	readonly query: Record<string, string | string[]>;
	readonly headers: IncomingHttpHeaders;

	// mutable
	body: any;
	state: Record<string, unknown>;
	di: Record<string, unknown>;
	status: number;

	private _manualResponse = false;

	constructor(opts: ContextOptions) {
		const { rawReq, rawRes, path, method, params, query, di } = opts;
		this.req = rawReq.req;
		this.res = rawRes.res;
		this.method = method.toUpperCase();
		this.path = path;
		this.params = params;
		this.query = query;
		this.headers = this.req.headers;
		this.body = undefined;
		this.state = {};
		this.di = di;
		this.status = 200;
	}

	set(field: string, value: string): void {
		this.res.setHeader(field, value);
	}

	get(field: string): string | undefined {
		const key = field.toLowerCase();
		return this.headers[key] as string | undefined;
	}

	send(body: any): void {
		if (this._manualResponse) return;
		this._manualResponse = true;

		if (!this.res.headersSent) {
			this.res.statusCode = this.status;
		}

		if (body === null || body === undefined) {
			this.res.end();
			return;
		}

		if (Buffer.isBuffer(body)) {
			this.res.end(body);
			return;
		}

		if (typeof body === "string") {
			this.res.end(body);
			return;
		}

		if (!this.res.getHeader("content-type")) {
			this.res.setHeader("content-type", "application/json; charset=utf-8");
		}
		this.res.end(JSON.stringify(body));
	}

	json(body: any): void {
		if (!this.res.getHeader("content-type")) {
			this.res.setHeader("content-type", "application/json; charset=utf-8");
		}
		this.send(JSON.stringify(body));
	}

	throw(status: number, message?: string, details?: any): never {
		throw new HttpError(status, message, details);
	}

	hrtime(): bigint {
		return process.hrtime.bigint();
	}

	hrtimeDiff(start: bigint): number {
		const diff = process.hrtime.bigint() - start;
		return Number(diff) / 1_000_000; // ms
	}
}

export type Context = FwoomContext;
