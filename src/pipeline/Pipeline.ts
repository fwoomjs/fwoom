import type { Context } from "../context/Context";

export type Handler = (ctx: Context) => any | Promise<any>;
export type Middleware = (ctx: Context, next: () => Promise<void>) => any;

export async function runPipeline(
	middlewares: Middleware[],
	handler: Handler,
	ctx: Context
): Promise<void> {
	// Iterative dispatcher
	let index = -1;

	async function dispatch(i: number): Promise<void> {
		if (i <= index) {
			throw new Error("next() called multiple times");
		}
		index = i;

		if (i === middlewares.length) {
			const result = await handler(ctx);
			if (!ctx.res.headersSent && result !== undefined) {
				ctx.send(result);
			}
			return;
		}

		const fn = middlewares[i];
		if (!fn) return;

		await fn(ctx, () => dispatch(i + 1));
	}

	await dispatch(0);
}
