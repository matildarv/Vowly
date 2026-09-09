// Minimal, dependency-free static file server used ONLY so v0's preview
// environment can detect a running dev server and serve the static Vowly
// files (concept.html and the existing app). It does not modify or bundle
// anything — it just streams files from this directory.

const http = require("http")
const fs = require("fs")
const path = require("path")

const PORT = process.env.PORT || 3000
const ROOT = __dirname

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0])

  // Default the preview root to the concept page so it opens directly.
  let relPath = url === "/" ? "/concept.html" : url

  // Resolve within ROOT and prevent path traversal.
  const filePath = path.normalize(path.join(ROOT, relPath))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("Not found")
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    })
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, () => {
  console.log(`[v0] Static preview server running on http://localhost:${PORT} (serving concept.html)`)
})
