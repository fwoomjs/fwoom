import type { Context } from "../context/Context";
import { HttpError } from "./HttpError";

export type ErrorHandler = (err: Error, ctx: Context) => Promise<void> | void;

export const defaultErrorHandler: ErrorHandler = (err, ctx) => {
	const isHttp = err instanceof HttpError;
	const status = isHttp ? err.statusCode : 500;

	const body: any = {
		error: isHttp ? err.message : "Internal Server Error",
	};

	if (isHttp && err.details) {
		body.details = err.details;
	}

	if (!ctx.res.headersSent) {
		ctx.status = status;
		ctx.json(body);
	} else {
		// Last resort logging
		console.error(err);
	}
};
