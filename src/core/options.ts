export interface ServerOptions {
	keepAliveTimeout?: number;
	requestTimeout?: number;
	maxHeaderSize?: number;
}

export interface FwoomOptions {
	server?: ServerOptions;
	bodyLimit?: number; // bytes
	caseSensitive?: boolean; // reserved for future
}

export const defaultOptions: Required<FwoomOptions> = {
	server: {},
	bodyLimit: 1024 * 1024, // 1MB
	caseSensitive: false,
};
