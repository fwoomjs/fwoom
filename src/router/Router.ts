import type { Handler } from "../pipeline/Pipeline";

/**
 * A precompiled, flat, zero-regex router.
 *
 * Design:
 * - Per-method route tables
 * - Static routes in a Map<string, RouteRecord>
 * - Dynamic routes in a small array, with pre-split pattern segments
 * - Shared path-split buffer to avoid allocations on hot path
 */

export interface RouteDefinition {
  method: string; // "GET", "POST", ...
  path: string;
  handler: Handler;
}

interface CompiledRoute {
  method: string;
  path: string;
  handler: Handler;
  segments: string[];       // ["users", ":id"]
  paramIndices: number[];   // [1]
  paramNames: string[];     // ["id"]
  hasParams: boolean;
}

interface MethodTable {
  static: Map<string, CompiledRoute>;
  dynamic: CompiledRoute[];
}

interface MatchResult {
  route: CompiledRoute;
  params: Record<string, string>;
}

const MAX_SEGMENTS = 16;
// Shared array reused for splitting paths at runtime.
// Matching is fully synchronous, so reuse is safe per request.
const sharedSegments: string[] = new Array(MAX_SEGMENTS);

export class Router {
  private methods: Map<string, MethodTable> = new Map();

  addRoute(def: RouteDefinition): void {
    const method = def.method.toUpperCase();
    const table = this.ensureMethodTable(method);

    const compiled = this.compileRoute(def);

    if (!compiled.hasParams) {
      // Static route: exact path match
      table.static.set(def.path, compiled);
    } else {
      // Dynamic route: has params
      table.dynamic.push(compiled);
    }
  }

  match(method: string, path: string): MatchResult | null {
    const m = method.toUpperCase();
    const table = this.methods.get(m);
    if (!table) return null;

    // 1. Static match: O(1)
    const staticRoute = table.static.get(path);
    if (staticRoute) {
      return { route: staticRoute, params: {} };
    }

    // 2. Dynamic routes: O(N * segments)
    if (table.dynamic.length === 0) return null;

    const { length: segLen } = splitPathIntoSharedSegments(path);

    for (let i = 0; i < table.dynamic.length; i++) {
      const route = table.dynamic[i];

      if (segLen !== route.segments.length) continue;

      if (!matchSegments(route, segLen)) continue;

      const params = extractParams(route, segLen);
      return { route, params };
    }

    return null;
  }

  // ----- Internal helpers -----

  private ensureMethodTable(method: string): MethodTable {
    let table = this.methods.get(method);
    if (!table) {
      table = {
        static: new Map(),
        dynamic: [],
      };
      this.methods.set(method, table);
    }
    return table;
  }

  private compileRoute(def: RouteDefinition): CompiledRoute {
    // Normalize path segments at registration time
    const segments = normalizePath(def.path).split("/").filter(Boolean);

    const paramIndices: number[] = [];
    const paramNames: string[] = [];

    segments.forEach((seg, idx) => {
      if (seg.startsWith(":") && seg.length > 1) {
        paramIndices.push(idx);
        paramNames.push(seg.slice(1));
      }
    });

    return {
      method: def.method.toUpperCase(),
      path: def.path,
      handler: def.handler,
      segments,
      paramIndices,
      paramNames,
      hasParams: paramIndices.length > 0,
    };
  }
}

// Normalize: ensure leading slash, no trailing slash (except root)
function normalizePath(path: string): string {
  if (!path) return "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Split the incoming path string into the sharedSegments buffer.
 * Returns length of meaningful segments.
 */
function splitPathIntoSharedSegments(path: string): { length: number } {
  // Basic normalization: ensure leading slash
  if (!path.startsWith("/")) path = "/" + path;

  let len = 0;
  let start = 1; // skip leading '/'

  const n = path.length;
  for (let i = 1; i <= n; i++) {
    const charCode = i === n ? 47 /* '/' sentinel */ : path.charCodeAt(i);
    if (charCode === 47 /* '/' */) {
      if (i > start) {
        if (len === MAX_SEGMENTS) break;
        sharedSegments[len++] = path.slice(start, i);
      }
      start = i + 1;
    }
  }

  return { length: len };
}

/**
 * Compares the sharedSegments buffer with the route's precompiled segments,
 * ignoring positions that are params.
 */
function matchSegments(route: CompiledRoute, segLen: number): boolean {
  const pattern = route.segments;
  const paramsIdx = route.paramIndices;

  outer: for (let i = 0; i < segLen; i++) {
    const isParam = binaryIncludes(paramsIdx, i);
    if (isParam) continue; // always matches

    if (sharedSegments[i] !== pattern[i]) {
      return false;
    }
  }

  return true;
}

// paramIndices is usually very small, so linear scan is okay.
// Could be optimized to a Set if needed.
function binaryIncludes(arr: number[], value: number): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === value) return true;
  }
  return false;
}

/**
 * Extract params from sharedSegments using the route's paramIndices and names.
 */
function extractParams(route: CompiledRoute, segLen: number): Record<string, string> {
  const params: Record<string, string> = {};
  const indices = route.paramIndices;
  const names = route.paramNames;

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx < segLen) {
      const name = names[i];
      params[name] = sharedSegments[idx];
    }
  }

  return params;
}
