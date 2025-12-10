# FwoomJS

A high‑performance, edge‑ready Node.js web framework designed for modern APIs. Fwoom focuses on speed, predictability, minimalism, and plugin‑based extensibility. It delivers a clean developer experience while targeting high performance levels.

> **Status:** Experimental — APIs may evolve as performance and architecture are refined.

---

## Features

* **Extremely Fast FwoomRouter** — Precompiled, zero‑overhead path matching with wildcard support.
* **FwoomPipeline** — Optimized middleware execution path with minimal allocations.
* **Edge‑Ready Architecture** — Adapter‑based runtime (*Node adapter included, edge adapters coming soon*).
* **Universal API Support** — REST‑first, with GraphQL/RPC/etc. supported via plugins.
* **FwoomPlugin: Scoped & Global Plugin System** — Flexible plugin model with full DI support.
* **FwoomContext** — Clean, predictable request/response handling.
* **Zero Opinions on Logging, ORM, Validation** — Bring your own tools; Fwoom stays unopinionated.

---

## Installation

```sh
npm install fwoom
```

---

## Basic Usage

```ts
import { Fwoom } from "fwoom";

const app = new Fwoom();

app.get("/", (ctx) => {
  return { message: "Hello Fwoom" };
});

app.listen(3000).then(() => {
  console.log("Server running at http://localhost:3000");
});
```

---

## Routing

**Fwoom** provides a precompiled, ultra‑fast router.

### Static Route

```ts
app.get("/hello", (ctx) => "Hello!");
```

### Dynamic Params

```ts
app.get("/users/:id", (ctx) => {
  return { id: ctx.params.id };
});
```

### Wildcards

```ts
app.get("/assets/*", (ctx) => {
  return { path: ctx.params.wildcard };
});
```

---

## Middleware (FwoomPipeline)

Middleware executions are extremely lightweight.

```ts
app.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(2);
  console.log(`${ctx.method} ${ctx.path} - ${ms}ms`);
});
```

---

## Plugin System

Plugins can be **global** or **scoped**.

### Global Plugin

```ts
await app.register(async (app, opts) => {
  app.decorate("message", "Hello from plugin");

  app.use((ctx, next) => {
    ctx.pluginMsg = app.message;
    return next();
  });
});
```

### Scoped Plugin

```ts
await app.register(async (app, opts) => {
  app.get("/info", () => ({ ok: true }));
}, { prefix: "/admin" });
```

---

## Request Context

```ts
app.get("/demo", (ctx) => {
  ctx.status = 201;
  return { method: ctx.method, query: ctx.query };
});
```

Available fields:

* `ctx.method`
* `ctx.path`
* `ctx.params`
* `ctx.query`
* `ctx.body`
* `ctx.status`
* `ctx.json()`, `ctx.text()`, `ctx.send()`
* `ctx.di` (dependency container)

---

## Error Handling

**Fwoom** allows customizing the global error handler.

```ts
app.setErrorHandler(async (err, ctx) => {
  ctx.status = 500;
  return { error: err.message };
});
```

---

## Adapters

**Fwoom** can run in different environments through adapters.

### Node Adapter

Included by default.

```ts
const app = new Fwoom();
```

### Edge Adapter (Coming Soon)

Will allow **Fwoom** to run in:

* Cloudflare Workers
* Vercel Edge Runtime
* Deno Deploy

---

## Current Status

This project is still experimental. Breaking changes may occur while refining:

* Router internals
* Middleware pipeline
* Plugin system
* Adapter architecture
* Developer ergonomics

> **FwoomJS** aims to become one of the fastest, cleanest Node.js frameworks available.

---

## License

[MIT](LICENSE)
