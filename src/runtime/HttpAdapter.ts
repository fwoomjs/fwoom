export interface RawRequestNode {
	req: import("http").IncomingMessage;
}

export interface RawResponseNode {
	res: import("http").ServerResponse;
}

export interface HttpAdapter {
	listen(
		port: number,
		host: string,
		handler: (rawReq: RawRequestNode, rawRes: RawResponseNode) => void
	): Promise<void>;

	close(): Promise<void>;
}
