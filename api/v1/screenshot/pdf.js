import { getPage, releasePage } from "../../../lib/pagePool.js";
import { resetIdleTimer } from "../../../lib/browser.js";
import { closeBrowser } from "../../../lib/browser.js";
import {
  get as cacheGet,
  set as cacheSet,
  has as cacheHas,
} from "../../../lib/cache.js";
import { validateZuploSecret, setCorsHeaders } from "../../../lib/auth.js";
import { applyStealth } from "../../../lib/stealth.js";
import { blockAds } from "../../../lib/blockAds.js";
import { Renderer, renderTemplate } from "../../../lib/renderer.js";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  res.setHeader("X-Request-ID", requestId);
  if (!validateZuploSecret(req, res)) return;

  // Robust Body Parser Fallback
  let body = req.body;
  if (!body) {
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const raw = Buffer.concat(buffers).toString();
      if (raw) {
        body = JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error parsing body manually:", e);
    }
  }
  if (!body) body = {};

  const {
    url,
    template,
    data = {},
    html,
    width = 1280,
    height = 800,
    format = "A4",
    landscape = false,
    printBackground = true,
    stealth = true,
    clean = false,
    freezeAnimations = true,
    css,
    debug = false,
    headers = {},
    noCache = false,
    pixelPerfect = false,
    resourcePolicy = pixelPerfect ? "fidelity" : "balanced",
    blockAdsByUrl = !pixelPerfect,
    preserveStickyHeaders = true,
    aggressiveClean = false,
  } = body;

  const cacheKey = JSON.stringify({
    url,
    template,
    data,
    html,
    width,
    height,
    format,
    landscape,
    printBackground,
    stealth,
    clean,
    freezeAnimations,
    css,
    headers,
    pixelPerfect,
    resourcePolicy,
    blockAdsByUrl,
    preserveStickyHeaders,
    aggressiveClean,
  });

  if (!noCache && (await cacheHas(cacheKey))) {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Render-Time", "0ms");
      if (debug) return res.status(200).json(cached);

      const buffer = Buffer.from(cached.pdf_base64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      return res.end(buffer, "binary");
    }
  }

  if (!url && !template && !html) {
    return res.status(400).json({
      success: false,
      error: "validation_error",
      message: "url, template, or html is required",
    });
  }

  let lastError = null;
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let page = null;

    try {
      page = await getPage();
      // Block known ad/tracking URLs while preserving fidelity by default.
      await blockAds(page, { resourcePolicy, blockAdsByUrl });

      const renderer = new Renderer(page, {
        clean,
        freezeAnimations,
        css,
        wait: "smart",
        preserveStickyHeaders,
        aggressiveClean,
      });

      if (template) {
        const templatePath = path.join(
          process.cwd(),
          "templates",
          `${template}.html`,
        );
        if (fs.existsSync(templatePath)) {
          const rawTemplate = fs.readFileSync(templatePath, "utf8");
          await page.setContent(renderTemplate(rawTemplate, data), {
            waitUntil: "networkidle0",
          });
        } else {
          throw new Error(`Template ${template} not found`);
        }
      } else if (html) {
        await page.setContent(html, { waitUntil: "networkidle0" });
      } else {
        if (stealth) await applyStealth(page);
        if (headers && Object.keys(headers).length > 0)
          await page.setExtraHTTPHeaders(headers);
        await page.setViewport({
          width: Number(width),
          height: Number(height),
        });
        await page
          .goto(url, { waitUntil: "networkidle2", timeout: 25000 })
          .catch(() => {});
      }

      const debugInfo = await renderer.process();

      const pdf = await page.pdf({
        format: format,
        landscape: !!landscape,
        printBackground: !!printBackground,
      });

      await releasePage(page);
      // Reset idle timer so browser stays warm
      resetIdleTimer();

      const renderTime = Date.now() - startTime;
      res.setHeader("X-Render-Time", `${renderTime}ms`);
      res.setHeader("X-Cache", "MISS");

      const responseData = {
        success: true,
        pdf_base64: pdf.toString("base64"),
        url: url || "template",
        render_time: renderTime,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      };

      if (debug) responseData.debug = debugInfo;
      cacheSet(cacheKey, responseData);

      if (req.headers["accept"]?.includes("application/pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        return res.end(pdf, "binary");
      }

      return res.status(200).json(responseData);
    } catch (error) {
      lastError = error;
      if (page) await releasePage(page).catch(() => {});
      if (error.message.includes("Target closed")) await closeBrowser(true);
      if (attempt < maxRetries) continue;
    }
  }

  return res.status(500).json({
    success: false,
    error: "render_failed",
    message: lastError.message,
    request_id: requestId,
  });
}
