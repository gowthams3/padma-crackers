/**
 * Local same-origin API proxy for Padma Crackers Bazaar.
 * Run with: npm start
 * Frontend: http://localhost:5500
 *
 * This avoids browser CORS restrictions without changing Padma's server.
 * It does NOT bypass authentication, CSRF validation, or backend permissions.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 5500);
const HOST = "www.padmacracker.com";
const UPSTREAM = `https://${HOST}`;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function allowedApiPath(pathname) {
  return (
    pathname === "/products/search" ||
    pathname === "/store_orders" ||
    pathname === "/store_contacts" ||
    pathname === "/language/update-active" ||
    pathname === "/order_details" ||
    /^\/download-pdf\/[A-Za-z0-9_-]+$/.test(pathname)
  );
}

async function proxy(req, res, url) {
  const upstreamPath = url.pathname.slice(4) || "/";
  if (!allowedApiPath(upstreamPath)) {
    return send(res, 404, JSON.stringify({ status: "fail", message: "API route not allowed by local proxy." }));
  }

  const target = new URL(UPSTREAM + upstreamPath + url.search);
  const headers = {
    "Accept": req.headers.accept || "application/json",
    "User-Agent": "PadmaCatalogueLocalProxy/1.0"
  };
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
  if (req.headers["x-csrf-token"]) headers["X-CSRF-TOKEN"] = req.headers["x-csrf-token"];
  if (req.headers.cookie) headers["Cookie"] = req.headers.cookie;

  try {
    const upstreamResponse = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: ["GET", "HEAD"].includes(req.method) ? undefined : "half",
      redirect: "manual"
    });

    const responseHeaders = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    };
    for (const name of ["content-type", "content-disposition", "cache-control", "location"]) {
      const value = upstreamResponse.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    // Browser is talking to localhost, so the response is same-origin.
    res.writeHead(upstreamResponse.status, responseHeaders);
    if (req.method === "HEAD") return res.end();
    const bytes = Buffer.from(await upstreamResponse.arrayBuffer());
    res.end(bytes);
  } catch (error) {
    console.error("Upstream proxy error:", error);
    send(res, 502, JSON.stringify({
      status: "fail",
      message: "Could not reach Padma API from this machine.",
      detail: error.message
    }));
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(ROOT, "." + pathname);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== path.join(ROOT, "index.html")) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }
  fs.readFile(resolved, (error, data) => {
    if (error) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    if (!["GET", "POST", "HEAD"].includes(req.method)) {
      return send(res, 405, JSON.stringify({ status: "fail", message: "Method not allowed." }));
    }
    return proxy(req, res, url);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
  }
  serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Padma catalogue running at http://localhost:${PORT}`);
  console.log(`API proxy target: ${UPSTREAM}`);
});
