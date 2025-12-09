import { parse as parseUrl } from "url";

export function parsePathAndQuery(url: string | undefined): {
  path: string;
  query: Record<string, string | string[]>;
} {
  const parsed = parseUrl(url || "/", true);
  return {
    path: parsed.pathname || "/",
    query: parsed.query as Record<string, string | string[]>,
  };
}
