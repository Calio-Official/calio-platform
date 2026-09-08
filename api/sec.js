// Vercel Serverless Function: SEC EDGAR Proxy
// Allows web frontends to fetch live SEC submissions, company facts, and tickers
// with standard SEC Fair Access compliant User-Agent headers and CORS headers.

const https = require("https");
const zlib = require("zlib");

const SEC_USER_AGENT = "CalioPlatform research@calio.io";

function fetchSec(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": SEC_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br"
      }
    };

    const req = https.request(options, (res) => {
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

    req.setTimeout(8000, () => {
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

  const { type, cik } = req.query || {};

  try {
    let targetUrl = "";

    if (type === "submissions" && cik) {
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
      return res.end(JSON.stringify({ ok: false, error: "Invalid parameters. type=submissions|companyfacts|tickers and cik required." }));
    }

    const secRes = await fetchSec(targetUrl);

    if (secRes.statusCode !== 200) {
      res.statusCode = secRes.statusCode;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, status: secRes.statusCode, error: `SEC returned status ${secRes.statusCode}` }));
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(secRes.body);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: err.message || "Failed to proxy SEC request" }));
  }
};
