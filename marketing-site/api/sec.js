// Vercel Serverless Function: SEC EDGAR Proxy
// Allows web frontends to fetch live SEC submissions, company facts, tickers,
// and arbitrary SEC filing documents (HTML/XML/JSON) with SEC Fair Access
// compliant User-Agent headers and strictly scoped CORS security.

const https = require("https");
const zlib = require("zlib");

const SEC_USER_AGENT = "CalioPlatform research@calio.io";
const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB payload safety limit
const MAX_REDIRECTS = 3;

function isSecHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase().trim();
  return h === "sec.gov" || h === "data.sec.gov" || h.endsWith(".sec.gov");
}

function fetchSec(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error("Invalid target URL"));
    }

    if (parsed.protocol !== "https:") {
      return reject(new Error("Only HTTPS protocol is permitted for SEC requests."));
    }

    if (!isSecHost(parsed.hostname)) {
      return reject(new Error("Target host is not an authorized sec.gov domain."));
    }

    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error("Too many redirects encountered."));
    }

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": SEC_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json,text/plain,*/*",
        "Accept-Encoding": "gzip, deflate, br"
      }
    };

    const req = https.request(options, (res) => {
      // Handle redirects (e.g. 301/302) safely with domain and protocol re-validation
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectTarget = res.headers.location;
        if (!redirectTarget.startsWith("http://") && !redirectTarget.startsWith("https://")) {
          redirectTarget = `https://${parsed.hostname}${redirectTarget.startsWith("/") ? "" : "/"}${redirectTarget}`;
        }
        
        let parsedRedirect;
        try {
          parsedRedirect = new URL(redirectTarget);
        } catch {
          return reject(new Error("Invalid redirect URL encountered"));
        }

        if (parsedRedirect.protocol !== "https:" || !isSecHost(parsedRedirect.hostname)) {
          return reject(new Error("Redirect to non-SEC host was blocked for security."));
        }

        return resolve(fetchSec(parsedRedirect.href, redirectCount + 1));
      }

      let stream = res;
      const encoding = res.headers["content-encoding"];
      if (encoding === "gzip") {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === "deflate") {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === "br") {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      let data = "";
      let totalBytes = 0;

      stream.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_SIZE) {
          req.destroy();
          stream.destroy();
          return reject(new Error("Response size exceeded maximum allowed limit (15MB)."));
        }
        data += chunk;
      });

      stream.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("SEC EDGAR request timed out"));
    });

    req.end();
  });
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = !origin || 
    origin === "https://calio-pink.vercel.app" ||
    origin.endsWith(".vercel.app") ||
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");

  if (isAllowedOrigin && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "https://calio-pink.vercel.app");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, User-Agent");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const { type, cik, url } = req.query || {};

  try {
    let targetUrl = "";

    if (url) {
      let parsedTarget;
      try {
        parsedTarget = new URL(String(url).trim());
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: false, error: "Invalid URL provided." }));
      }

      if (parsedTarget.protocol !== "https:") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: false, error: "Only HTTPS requests are supported." }));
      }

      const host = parsedTarget.hostname.toLowerCase();
      if (!isSecHost(host)) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: false, error: "Only sec.gov domains are permitted." }));
      }

      // If ix viewer URL (e.g. /ix?doc=/Archives/edgar/data/...), resolve to underlying document
      if (parsedTarget.pathname.startsWith("/ix")) {
        const docParam = parsedTarget.searchParams.get("doc");
        if (docParam) {
          targetUrl = `https://www.sec.gov${docParam.startsWith("/") ? docParam : "/" + docParam}`;
        } else {
          targetUrl = parsedTarget.href;
        }
      } else {
        targetUrl = parsedTarget.href;
      }
    } else if (type === "submissions" && cik) {
      const padded = String(cik).replace(/\D/g, "").padStart(10, "0");
      targetUrl = `https://data.sec.gov/submissions/CIK${padded}.json`;
    } else if (type === "companyfacts" && cik) {
      const padded = String(cik).replace(/\D/g, "").padStart(10, "0");
      targetUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
    } else if (type === "tickers") {
      targetUrl = "https://www.sec.gov/files/company_tickers.json";
    } else {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        ok: false,
        error: "Invalid parameters. Provide 'url' (any sec.gov URL) or 'type' (submissions|companyfacts|tickers with 'cik')."
      }));
    }

    const secRes = await fetchSec(targetUrl);

    if (secRes.statusCode !== 200) {
      res.statusCode = secRes.statusCode;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({
        ok: false,
        status: secRes.statusCode,
        error: `SEC returned status ${secRes.statusCode}`
      }));
    }

    const ct = secRes.headers["content-type"] || (targetUrl.endsWith(".json") ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", ct);
    return res.end(secRes.body);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: err.message || "Failed to proxy SEC request" }));
  }
};
