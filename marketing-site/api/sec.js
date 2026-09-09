// Vercel Serverless Function: SEC EDGAR Proxy
// Allows web frontends to fetch live SEC submissions, company facts, tickers,
// and arbitrary SEC filing documents (HTML/XML/JSON) with SEC Fair Access
// compliant User-Agent headers and CORS headers.

const https = require("https");
const zlib = require("zlib");

const SEC_USER_AGENT = "CalioPlatform research@calio.io";

function fetchSec(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error("Invalid target URL"));
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
      // Handle redirects (e.g. 301/302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://${parsed.hostname}${res.headers.location.startsWith("/") ? "" : "/"}${res.headers.location}`;
        return resolve(fetchSec(redirectUrl));
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
      stream.on("data", (chunk) => {
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, User-Agent");

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

      const host = parsedTarget.hostname.toLowerCase();
      if (host !== "sec.gov" && !host.endsWith(".sec.gov")) {
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
