import type { RawRequestNode, RawResponseNode } from "../runtime/HttpAdapter";

export interface FwoomContextOptions {
  rawReq: RawRequestNode;
  rawRes: RawResponseNode;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  di: Record<string, unknown>;
}

export interface ContextSendLike {
  send(body: any): void;
  json(obj: any): void;
  text(str: string): void;
  status(code: number): this;
  set(name: string, value: string): this;
}

export interface Context extends ContextSendLike {
  req: any;
  res: any;

  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  searchParams: URLSearchParams;

  headers: Record<string, string | string[] | undefined>;
  body: any;

  di: Record<string, unknown>;

  throw(status: number, message?: string): never;

  // internal flags
  _manualResponse: boolean;
  _statusSet: boolean;
}

export class FwoomContext implements Context {
  req: any;
  res: any;

  method: string;
  path: string;

  params: Record<string, string>;
  query: Record<string, string | string[]>;

  searchParams: URLSearchParams;

  headers: Record<string, string | string[] | undefined>;

  body: any = undefined;

  di: Record<string, unknown>;

  _manualResponse = false;
  _statusSet = false;

  constructor(opts: FwoomContextOptions) {
    const { rawReq, rawRes } = opts;

    this.req = rawReq.req;
    this.res = rawRes.res;

    this.method = opts.method;
    this.path = opts.path;

    this.params = opts.params;
    this.query = opts.query;

    this.searchParams = new URLSearchParams();

    // Build searchParams once (lazy parse query)
    for (const key in opts.query) {
      const val = opts.query[key];
      if (Array.isArray(val)) {
        val.forEach((v) => this.searchParams.append(key, v));
      } else {
        this.searchParams.set(key, val);
      }
    }

    this.headers = this.req.headers;
    this.di = opts.di;
  }

  status(code: number): this {
    this.res.statusCode = code;
    this._statusSet = true;
    return this;
  }

  set(name: string, value: string): this {
    this.res.setHeader(name.toLowerCase(), value);
    return this;
  }

  send(body: any): void {
    this._manualResponse = true;

    if (body === undefined || body === null) {
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

    // Fallback JSON
    this.res.setHeader("content-type", "application/json; charset=utf-8");
    this.res.end(JSON.stringify(body));
  }

  json(obj: any): void {
    this._manualResponse = true;
    this.res.setHeader("content-type", "application/json; charset=utf-8");
    this.res.end(JSON.stringify(obj));
  }

  text(str: string): void {
    this._manualResponse = true;
    this.res.setHeader("content-type", "text/plain; charset=utf-8");
    this.res.end(str);
  }

  // -------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------

  throw(status: number, message?: string): never {
    const err: any = new Error(message || "Error");
    err.status = status;
    throw err;
  }
}
