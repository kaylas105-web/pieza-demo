// Local preview of dist/ under the same BASE path GitHub Pages uses.
//   BASE=/pieza-demo/ node scripts/serve.mjs   ->  http://localhost:4321/pieza-demo/
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const BASE = (process.env.BASE || "/").replace(/\/?$/, "/");
const PORT = Number(process.env.PORT || 4321);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain" };

createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (!pathname.startsWith(BASE)) { res.writeHead(302, { location: BASE }).end(); return; }
  let file = path.join(DIST, decodeURIComponent(pathname.slice(BASE.length)));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  const found = existsSync(file);
  if (!found) file = path.join(DIST, "404.html");
  res.writeHead(found ? 200 : 404, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}`));
