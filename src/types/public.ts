export interface Context {
	method: string;
	path: string;
	params: Record<string, string>;
	query: Record<string, string>;
	body: any;

	status: number;
	setStatus(code: number): this;

	json(data: any): void;
	text(data: string): void;
	send(data: any): void;

	di: Record<string, any>;

	// plugin-extended property (ex: ctx.log)
	[key: string]: any;
}

export type NextFunction = () => Promise<void>;

export type Middleware = (ctx: Context, next: NextFunction) => any;

export type ErrorHandler = (err: Error, ctx: Context) => any;

export interface FwoomApp {
	use(mw: Middleware): this;
	register(
		plugin: (app: FwoomApp, opts?: any) => any,
		opts?: any
	): Promise<this>;
	setErrorHandler(handler: ErrorHandler): this;
	decorate(key: string, value: any): this;
	listen(port: number, host?: string): Promise<void>;

	errorHandler: ErrorHandler;
}
