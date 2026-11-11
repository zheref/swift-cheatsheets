/**
 * Serves the built site (`public/`) to every device on the local network, over
 * HTTP, or HTTPS when `--cert` and `--key` are both given. Node built-ins only.
 *
 *   node scripts/serve.mts [--port 8000] [--dir public] [--host 0.0.0.0] [--lan <ip>] [--cert c.pem --key k.pem]
 *
 * `--lan` is the address printed for other devices; serve-https.command passes the
 * one its certificate is issued for, so the printed URL always matches it.
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".png": "image/png", ".webmanifest": "application/manifest+json",
};

/** The file a request path names inside `root`, or null when it escapes the folder or cannot be decoded. */
export function resolveRequest(root: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const file = path.resolve(root, `.${rel}`);
  if (file !== root && !file.startsWith(root + path.sep)) return null; // no escaping the site folder
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return path.join(file, "index.html");
  return file;
}

export function createHandler(rootDir: string): http.RequestListener {
  const root = path.resolve(rootDir);
  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let file = resolveRequest(root, req.url ?? "/");
    let status = 200;
    if (!file || !fs.existsSync(file)) {
      file = path.join(root, "404.html");
      status = 404;
      if (!fs.existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }).end("Not found\n");
        return;
      }
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    // A file that vanishes or cannot be read mid-request ends that response, never the server.
    fs.createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  };
}

/** The first non-internal IPv4 address, the fallback when no `--lan` is given. */
export const lanAddress = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "127.0.0.1";

function main() {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "8000" },
      dir: { type: "string", default: "public" },
      host: { type: "string", default: "0.0.0.0" },
      lan: { type: "string" },
      cert: { type: "string" },
      key: { type: "string" },
    },
  });

  const root = path.resolve(values.dir);
  if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(`  ${root}/index.html is missing — run \`npm run build\` first.`);
    process.exit(1);
  }
  if (Boolean(values.cert) !== Boolean(values.key)) {
    console.error("  --cert and --key go together: give both for HTTPS, or neither for HTTP.");
    process.exit(1);
  }

  const secure = Boolean(values.cert && values.key);
  const handler = createHandler(root);
  const server = secure
    ? https.createServer({ cert: fs.readFileSync(values.cert!), key: fs.readFileSync(values.key!) }, handler)
    : http.createServer(handler);
  const scheme = secure ? "https" : "http";
  const port = Number(values.port);
  const lan = values.lan || lanAddress();

  server.listen(port, values.host, () => {
    console.log("");
    console.log(`  Reference Cheat Sheets  (${scheme.toUpperCase()})`);
    console.log("  ---------------------------------------------------------");
    console.log(`  This Mac : ${scheme}://localhost:${port}/`);
    console.log(`  iPad etc : ${scheme}://${lan}:${port}/`);
    console.log("  ---------------------------------------------------------");
    console.log(secure ? "  Self-signed: accept the certificate warning once per device." : "  Type the http:// prefix explicitly on the other device.");
    console.log("  Same Wi-Fi network required. Ctrl-C to stop.");
    console.log("");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
