import type { Context } from "../context/Context";

export type ErrorHandler = (err: any, ctx: Context) => any | Promise<any>;

export const defaultErrorHandler: ErrorHandler = async (err, ctx) => {
  const status = typeof err.status === "number" ? err.status : 500;
  const message = err.message || "Internal Server Error";

  // Prevent crash if handler throws after response was already sent
  const resAny: any = (ctx as any).res;
  const replied = resAny?.headersSent || resAny?.writableEnded;

  if (replied) {
    console.error("Fwoom Error after response was already sent:", err);
    return;
  }

  ctx.status(status);

  const isDev = process.env.NODE_ENV !== "production";

  const errorBody: any = {
    status,
    message,
  };

  if (isDev && err.stack) {
    errorBody.stack = err.stack;
  }

  ctx.json(errorBody);
};
