import { readFileSync, existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

const root = new URL("../../", import.meta.url);
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer({ rateLimiting: false }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe("vercel.json routing", () => {
  const match = (re: string, path: string) => new RegExp(`^${re}$`).test(path);

  it("has a static function entry (api/index.ts), not a dynamic catch-all", () => {
    expect(existsSync(new URL("api/index.ts", root))).toBe(true);
    expect(existsSync(new URL("api/[...path].ts", root))).toBe(false);
  });

  it("routes every /api/* path to the function, never to index.html", () => {
    const [api, spa] = vercel.rewrites;
    expect(api.destination).toBe("/api");
    for (const p of ["/api/admin/me", "/api/ping", "/api/poojas"]) {
      expect(match(api.source, p)).toBe(true);
      expect(match(spa.source, p)).toBe(false);
    }
    expect(spa.destination).toBe("/index.html");
    expect(match(spa.source, "/admin")).toBe(true);
  });

  it("marks all /api/* responses private, no-store and Vary: Authorization", () => {
    const h = vercel.headers.find((x: any) => x.source === "/api/(.*)");
    const get = (k: string) =>
      h.headers.find((x: any) => x.key === k)?.value as string;
    expect(get("Cache-Control")).toBe("private, no-store");
    expect(get("Vary")).toBe("Authorization");
  });
});

describe("authenticated API responses", () => {
  it("/api/admin/me: JSON 401 without a token, private no-store, no ETag", async () => {
    const r = await fetch(`${base}/api/admin/me`);
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toMatch(/Authorization/i);
    expect(r.headers.get("etag")).toBeNull();
    expect((await r.json()).code).toBe("UNAUTHENTICATED");
  });

  it("never answers 304 to a conditional request", async () => {
    const r = await fetch(`${base}/api/admin/me`, {
      headers: {
        "if-none-match": '"abc"',
        authorization: "Bearer " + "x".repeat(30),
      },
    });
    expect(r.status).not.toBe(304);
  });

  it("unknown /api paths return JSON 404, not HTML", async () => {
    const r = await fetch(`${base}/api/nope`);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("Vercel function entry (regression: ERR_UNSUPPORTED_DIR_IMPORT)", () => {
  const entry = readFileSync(new URL("api/index.ts", root), "utf8");

  it("imports only the pre-bundled ESM file, never extensionless TS sources", () => {
    const rel = [...entry.matchAll(/from\s+"(\.{1,2}\/[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(rel).toEqual(["./_server.mjs"]);
  });

  it("builds that bundle in the Vercel build command", () => {
    expect(vercel.buildCommand).toMatch(/build:api/);
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    expect(pkg.scripts["build:api"]).toMatch(/vite\.config\.api\.ts/);
  });
});
