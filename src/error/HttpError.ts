export class HttpError extends Error {
	statusCode: number;
	details?: unknown;

	constructor(statusCode: number, message?: string, details?: unknown) {
		super(message || `HTTP ${statusCode}`);
		this.statusCode = statusCode;
		this.details = details;
	}
}
