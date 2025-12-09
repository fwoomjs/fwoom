import http from "http";
import type { HttpAdapter, RawRequestNode, RawResponseNode } from "./HttpAdapter";
import type { ServerOptions } from "../core/options";

export class NodeAdapter implements HttpAdapter {
  private server?: http.Server;
  private options?: ServerOptions;

  constructor(options?: ServerOptions) {
    this.options = options;
  }

  async listen(
    port: number,
    host: string,
    handler: (rawReq: RawRequestNode, rawRes: RawResponseNode) => void
  ): Promise<void> {
    this.server = http.createServer((req, res) => {
      handler({ req }, { res });
    });

    if (this.options?.keepAliveTimeout != null) {
      this.server.keepAliveTimeout = this.options.keepAliveTimeout;
    }
    if (this.options?.requestTimeout != null) {
      this.server.requestTimeout = this.options.requestTimeout;
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
