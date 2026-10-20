/**
 * Local Supabase-compatible stack for END-TO-END TESTS ONLY.
 *
 *  - Supabase Auth (GoTrue) binary          → /auth/v1
 *  - PostgREST binary                        → /rest/v1
 *  - Storage emulator (this file)            → /storage/v1  (enforces storage.objects RLS by
 *                                              inserting rows as the caller's database role)
 *  - SMTP sink (this file) for auth emails   → GET /__test/mail?to=
 *  - Paystack test double (paystack-mock.mjs)
 *
 * Env: E2E_DATABASE_URL, AUTH_BIN, POSTGREST_BIN, E2E_STORAGE_DIR (optional).
 */
import { spawn } from "node:child_process";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { ANON_KEY, APP_URL, JWT_SECRET, PORTS } from "./keys.mjs";
import { startPaystackMock } from "./paystack-mock.mjs";

const DB = process.env.E2E_DATABASE_URL;
const AUTH_BIN = process.env.AUTH_BIN;
const PGRST_BIN = process.env.POSTGREST_BIN;
if (!DB || !AUTH_BIN || !PGRST_BIN) throw new Error("Set E2E_DATABASE_URL, AUTH_BIN and POSTGREST_BIN");
const STORAGE_DIR = process.env.E2E_STORAGE_DIR ?? path.join(process.cwd(), ".e2e-storage");
rmSync(STORAGE_DIR, { recursive: true, force: true });
mkdirSync(STORAGE_DIR, { recursive: true });

const children = [];
function run(name, cmd, args, env) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const log = (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`);
  child.stdout.on("data", log);
  child.stderr.on("data", log);
  child.on("exit", (code) => code && console.error(`[${name}] exited with ${code}`));
  children.push(child);
}

const dbUrl = new URL(DB);
const authenticatorUrl = `postgres://authenticator:${process.env.E2E_AUTHENTICATOR_PASSWORD ?? "e2e-authenticator"}@${dbUrl.host}${dbUrl.pathname}`;

run("postgrest", PGRST_BIN, [], {
  PGRST_DB_URI: authenticatorUrl,
  PGRST_DB_SCHEMAS: "public",
  PGRST_DB_ANON_ROLE: "anon",
  PGRST_JWT_SECRET: JWT_SECRET,
  PGRST_SERVER_PORT: String(PORTS.rest),
  PGRST_SERVER_HOST: "127.0.0.1",
});

run("auth", AUTH_BIN, ["serve"], {
  GOTRUE_DB_DRIVER: "postgres",
  DATABASE_URL: `${DB}?search_path=auth`,
  GOTRUE_DB_MIGRATIONS_PATH: path.join(path.dirname(AUTH_BIN), "migrations"),
  GOTRUE_API_HOST: "127.0.0.1",
  PORT: String(PORTS.auth),
  API_EXTERNAL_URL: `http://localhost:${PORTS.gateway}/auth/v1`,
  GOTRUE_SITE_URL: APP_URL,
  GOTRUE_URI_ALLOW_LIST: `${APP_URL}/**`,
  GOTRUE_JWT_SECRET: JWT_SECRET,
  GOTRUE_JWT_EXP: "3600",
  GOTRUE_JWT_AUD: "authenticated",
  GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
  GOTRUE_JWT_ADMIN_ROLES: "service_role",
  GOTRUE_DISABLE_SIGNUP: "false",
  GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
  GOTRUE_MAILER_AUTOCONFIRM: "false",
  GOTRUE_SMTP_HOST: "127.0.0.1",
  GOTRUE_SMTP_PORT: String(PORTS.smtp),
  GOTRUE_SMTP_ADMIN_EMAIL: "auth@hiddenkenya.test",
  GOTRUE_SMTP_SENDER_NAME: "Hidden Kenya",
  GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
  GOTRUE_MAILER_URLPATHS_INVITE: "/auth/v1/verify",
  GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify",
  GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
  GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
  GOTRUE_RATE_LIMIT_VERIFY: "1000",
  GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000",
  GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true",
  GOTRUE_PASSWORD_MIN_LENGTH: "10",
  GOTRUE_LOG_LEVEL: "warn",
});

/* ------------------------------------------------------------------ SMTP sink */
const mail = [];
net
  .createServer((socket) => {
    let data = false;
    let buf = "";
    let msg = "";
    socket.write("220 e2e-sink ESMTP\r\n");
    socket.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === ".") {
            data = false;
            const to = /^To:\s*(.*)$/im.exec(msg)?.[1] ?? "";
            const raw = msg.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
            mail.push({ to: to.toLowerCase(), subject: /^Subject:\s*(.*)$/im.exec(msg)?.[1] ?? "", raw, at: Date.now() });
            msg = "";
            socket.write("250 OK\r\n");
          } else msg += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") socket.write("250 e2e-sink\r\n");
        else if (cmd === "DATA") {
          data = true;
          socket.write("354 End with .\r\n");
        } else if (cmd === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  })
  .listen(PORTS.smtp, "127.0.0.1");

/* ------------------------------------------------------------------ Storage emulator */
const pool = new pg.Pool({ connectionString: DB, max: 10 });

function claimsFrom(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || req.headers.apikey || ANON_KEY;
  const [h, b, s] = String(token).split(".");
  const expected = createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest();
  const given = Buffer.from(s ?? "", "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(b, "base64url").toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

async function asRole(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const role = ["anon", "authenticated", "service_role"].includes(claims.role) ? claims.role : "anon";
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const readBody = (req, limit = 12 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    const parts = [];
    let n = 0;
    req.on("data", (d) => {
      n += d.length;
      if (n > limit) reject(Object.assign(new Error("Payload too large"), { status: 413 }));
      else parts.push(d);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const filePath = (bucket, name) => path.join(STORAGE_DIR, bucket, ...name.split("/").map((p) => p.replace(/\.\./g, "_")));
const signToken = (bucket, name, exp) => `${exp}.${createHmac("sha256", JWT_SECRET).update(`${bucket}/${name}:${exp}`).digest("base64url")}`;

async function storage(req, res, sub) {
  const claims = claimsFrom(req);
  if (!claims) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "invalid JWT" });
  const url = new URL(sub, "http://x");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); // object, ...
  if (parts[0] !== "object") return send(res, 404, { message: "not found" });

  if (req.method === "GET" && (parts[1] === "public" || parts[1] === "sign")) {
    const [, kind, bucket, ...rest] = parts;
    const name = rest.join("/");
    if (kind === "public") {
      const { rows } = await pool.query("select public from storage.buckets where id = $1", [bucket]);
      if (!rows[0]?.public) return send(res, 400, { message: "Bucket not public" });
    } else {
      const token = url.searchParams.get("token") ?? "";
      const exp = Number(token.split(".")[0]);
      if (!exp || exp < Date.now() / 1000 || token !== signToken(bucket, name, exp)) return send(res, 400, { message: "invalid signature" });
    }
    const f = filePath(bucket, name);
    if (!existsSync(f)) return send(res, 404, { message: "Object not found" });
    const { rows } = await pool.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name]);
    res.writeHead(200, { "content-type": rows[0]?.metadata?.mimetype ?? "application/octet-stream" });
    return res.end(readFileSync(f));
  }

  if (req.method === "POST" && parts[1] === "sign") {
    const [, , bucket, ...rest] = parts;
    const name = rest.join("/");
    const { expiresIn = 60 } = JSON.parse((await readBody(req)).toString() || "{}");
    const found = await asRole(claims, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
    if (!found.rowCount) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const exp = Math.floor(Date.now() / 1000) + Number(expiresIn);
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${signToken(bucket, name, exp)}` });
  }

  if (req.method === "POST") {
    const [, bucket, ...rest] = parts;
    const name = rest.join("/");
    const { rows: b } = await pool.query("select * from storage.buckets where id = $1", [bucket]);
    if (!b[0]) return send(res, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    const body = await readBody(req);
    const mime = String(req.headers["content-type"] ?? "").split(";")[0];
    if (b[0].file_size_limit && body.length > Number(b[0].file_size_limit)) return send(res, 400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    if (b[0].allowed_mime_types?.length && !b[0].allowed_mime_types.includes(mime)) return send(res, 400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${mime} is not supported` });
    try {
      const id = randomUUID();
      await asRole(claims, (c) =>
        c.query("insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, $2, $3, $4, $5)", [id, bucket, name, claims.sub ?? null, { mimetype: mime, size: body.length }]),
      );
      mkdirSync(path.dirname(filePath(bucket, name)), { recursive: true });
      writeFileSync(filePath(bucket, name), body);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: id });
    } catch (e) {
      if (e.code === "42501") return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (e.code === "23505") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      return send(res, 500, { message: e.message });
    }
  }

  if (req.method === "DELETE") {
    const [, bucket] = parts;
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
    const { rows } = await asRole(claims, (c) => c.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name", [bucket, prefixes]));
    for (const r of rows) rmSync(filePath(bucket, r.name), { force: true });
    return send(res, 200, rows.map((r) => ({ name: r.name, bucket_id: bucket })));
  }
  return send(res, 405, { message: "method not supported by emulator" });
}

/* ------------------------------------------------------------------ Gateway */
function proxy(req, res, port, sub) {
  const upstream = http.request(
    { host: "127.0.0.1", port, path: sub, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => send(res, 502, { message: "upstream unavailable" }));
  req.pipe(upstream);
}

http
  .createServer(async (req, res) => {
    const u = req.url ?? "/";
    try {
      if (u.startsWith("/auth/v1")) return proxy(req, res, PORTS.auth, u.slice(8) || "/");
      if (u.startsWith("/rest/v1")) return proxy(req, res, PORTS.rest, u.slice(8) || "/");
      if (u.startsWith("/storage/v1")) return await storage(req, res, u.slice(11));
      if (u.startsWith("/__test/mail")) {
        const to = new URL(u, "http://x").searchParams.get("to")?.toLowerCase();
        const items = mail.filter((m) => !to || m.to.includes(to));
        return send(res, 200, items.at(-1) ? { ...items.at(-1), links: [...items.at(-1).raw.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0].replace(/&amp;/g, "&")) } : null);
      }
      if (u === "/__test/health") {
        const [a, r] = await Promise.all([
          fetch(`http://127.0.0.1:${PORTS.auth}/health`).then((x) => x.ok).catch(() => false),
          fetch(`http://127.0.0.1:${PORTS.rest}/`).then((x) => x.status < 500).catch(() => false),
        ]);
        return send(res, a && r ? 200 : 503, { auth: a, rest: r });
      }
      send(res, 404, { message: "not found" });
    } catch (e) {
      send(res, e.status ?? 500, { message: e.message });
    }
  })
  .listen(PORTS.gateway, "127.0.0.1", () => console.log(`e2e gateway on ${PORTS.gateway}`));

startPaystackMock({ port: PORTS.paystack, webhookUrl: `${APP_URL}/api/webhooks/paystack` });

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
