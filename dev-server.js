// Local test server: node dev-server.js  ->  http://localhost:3000  (in-memory game state)
const http = require("http"), fs = require("fs"), path = require("path");
const api = require("./api/game.js");
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".mp4": "video/mp4" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/game") return api(req, res);
  let p = decodeURIComponent(u.pathname);
  if (p === "/") p = "/index.html";
  if (!path.extname(p)) p += ".html";
  const f = path.join(__dirname, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(f, (err, d) => {
    if (err) { res.statusCode = 404; return res.end("not found"); }
    res.setHeader("Content-Type", T[path.extname(f)] || "application/octet-stream");
    res.end(d);
  });
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
