import type { Handler } from "../pipeline/Pipeline";

export interface RouteDefinition {
  method: string;
  path: string;
  handler: Handler;
}

interface CompiledRoute {
  method: string;
  path: string;
  handler: Handler;
  segments: string[];      
  paramIndices: number[];  
  paramNames: string[];    
  hasParams: boolean;

  // WILDCARD SUPPORT
  wildcard: boolean;
  wildcardName?: string;
  wildcardIndex?: number;
}

interface MethodTable {
  static: Map<string, CompiledRoute>;
  dynamic: CompiledRoute[];
  wildcards: CompiledRoute[];
}

interface MatchResult {
  route: CompiledRoute;
  params: Record<string, string>;
}

const MAX_SEGMENTS = 16;
const sharedSegments: string[] = new Array(MAX_SEGMENTS);

export class Router {
  private methods: Map<string, MethodTable> = new Map();

  addRoute(def: RouteDefinition): void {
    const method = def.method.toUpperCase();
    const table = this.ensureMethodTable(method);

    const compiled = this.compileRoute(def);

    if (compiled.wildcard) {
      table.wildcards.push(compiled);
    } else if (!compiled.hasParams) {
      table.static.set(def.path, compiled);
    } else {
      table.dynamic.push(compiled);
    }
  }

  match(method: string, path: string): MatchResult | null {
    const m = method.toUpperCase();
    const table = this.methods.get(m);
    if (!table) return null;

    // 1. Static match
    const staticRoute = table.static.get(path);
    if (staticRoute) return { route: staticRoute, params: {} };

    // 2. Dynamic match
    const { length: segLen } = splitPath(path);
    if (matchDynamic(table.dynamic, segLen)) {
      return matchDynamic(table.dynamic, segLen)!;
    }

    // 3. Wildcard match
    const wcMatch = matchWildcard(table.wildcards, segLen);
    if (wcMatch) return wcMatch;

    return null;
  }

  private ensureMethodTable(method: string): MethodTable {
    let table = this.methods.get(method);
    if (!table) {
      table = {
        static: new Map(),
        dynamic: [],
        wildcards: [],
      };
      this.methods.set(method, table);
    }
    return table;
  }

  private compileRoute(def: RouteDefinition): CompiledRoute {
    const segments = normalizePath(def.path).split("/").filter(Boolean);

    const paramIndices: number[] = [];
    const paramNames: string[] = [];

    let wildcard = false;
    let wildcardName: string | undefined;
    let wildcardIndex: number | undefined;

    // detect param & wildcard
    segments.forEach((seg, idx) => {
      if (seg.startsWith(":")) {
        paramIndices.push(idx);
        paramNames.push(seg.slice(1));
      } else if (seg.startsWith("*")) {
        wildcard = true;
        wildcardName = seg.slice(1);
        wildcardIndex = idx;
      }
    });

    // validation: wildcard only allowed at the end
    if (wildcard && wildcardIndex !== segments.length - 1) {
      throw new Error(
        `Wildcard only allowed at end of path: "${def.path}"`
      );
    }

    return {
      method: def.method,
      path: def.path,
      handler: def.handler,
      segments,
      paramIndices,
      paramNames,
      hasParams: paramIndices.length > 0,
      wildcard,
      wildcardName,
      wildcardIndex
    };
  }
}

function splitPath(path: string): { length: number } {
  if (!path.startsWith("/")) path = "/" + path;

  let len = 0;
  let start = 1;
  const n = path.length;

  for (let i = 1; i <= n; i++) {
    const charCode = i === n ? 47 : path.charCodeAt(i);
    if (charCode === 47) {
      if (i > start) {
        if (len === MAX_SEGMENTS) break;
        sharedSegments[len++] = path.slice(start, i);
      }
      start = i + 1;
    }
  }

  return { length: len };
}

function matchDynamic(dynamic: CompiledRoute[], segLen: number): MatchResult | null {
  for (const route of dynamic) {
    if (route.segments.length !== segLen) continue;

    let ok = true;
    for (let i = 0; i < segLen; i++) {
      const isParam = route.paramIndices.includes(i);
      if (isParam) continue;
      if (sharedSegments[i] !== route.segments[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const params: Record<string, string> = {};
    for (let i = 0; i < route.paramIndices.length; i++) {
      const idx = route.paramIndices[i];
      params[route.paramNames[i]] = sharedSegments[idx];
    }

    return { route, params };
  }
  return null;
}

function matchWildcard(wildcards: CompiledRoute[], segLen: number): MatchResult | null {
  for (const route of wildcards) {
    const baseLen = route.segments.length - 1; // last is wildcard

    if (segLen < baseLen) continue;

    // Compare non-wildcard prefix
    let ok = true;
    for (let i = 0; i < baseLen; i++) {
      if (sharedSegments[i] !== route.segments[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Wildcard collects remainder:
    const wildcardStart = baseLen;
    const collected = sharedSegments.slice(wildcardStart, segLen).join("/");

    const params: Record<string, string> = {
      [route.wildcardName!]: collected
    };

    return { route, params };
  }

  return null;
}

function normalizePath(path: string): string {
  if (!path) return "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}
