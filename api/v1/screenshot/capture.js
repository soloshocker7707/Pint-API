import { getPage, releasePage } from "../../../lib/pagePool.js";
import { resetIdleTimer } from "../../../lib/browser.js";
import { closeBrowser } from "../../../lib/browser.js";
import {
  get as cacheGet,
  set as cacheSet,
  has as cacheHas,
} from "../../../lib/cache.js";
import { blockAds } from "../../../lib/blockAds.js";
import { validateZuploSecret, setCorsHeaders } from "../../../lib/auth.js";
import { applyStealth } from "../../../lib/stealth.js";
import { Renderer, renderTemplate } from "../../../lib/renderer.js";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // Feature 9: Proper Headers
  res.setHeader("X-Request-ID", requestId);

  // Authentication check
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
    fullPage = false,
    waitFor = 0,
    waitForSelector,
    wait = "networkidle2",
    format = "jpeg",
    quality = 70,
    stealth = true,
    clean = false,
    freezeAnimations = true,
    css,
    debug = false,
    headers = {},
    noCache = false,
    colorScheme = "light",
    pixelPerfect = false,
    resourcePolicy = pixelPerfect ? "fidelity" : "balanced",
    blockAdsByUrl = !pixelPerfect,
    preserveStickyHeaders = true,
    aggressiveClean = false,
  } = body;

  // Feature 8: Cache Lookup
  const cacheKey = JSON.stringify({
    url,
    template,
    data,
    html,
    width,
    height,
    fullPage,
    waitFor,
    waitForSelector,
    wait,
    format,
    quality,
    stealth,
    clean,
    freezeAnimations,
    css,
    headers,
    colorScheme,
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
      if (debug)
        return res.status(200).json({ ...cached, debug: { cached: true } });

      const buffer = Buffer.from(cached.image_base64, "base64");
      res.setHeader(
        "Content-Type",
        format === "jpeg" ? "image/jpeg" : "image/png",
      );
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
        wait,
        fullPage,
        colorScheme,
        preserveStickyHeaders,
        aggressiveClean,
      });

      // Feature 5: Template Screenshot handling
      if (template) {
        try {
          const templatePath = path.join(
            process.cwd(),
            "templates",
            `${template}.html`,
          );
          if (fs.existsSync(templatePath)) {
            const rawTemplate = fs.readFileSync(templatePath, "utf8");
            const processedHtml = renderTemplate(rawTemplate, data);
            await page.setContent(processedHtml, { waitUntil: "networkidle0" });
          } else {
            throw new Error(`Template ${template} not found`);
          }
        } catch (e) {
          return res.status(404).json({
            success: false,
            error: "template_not_found",
            message: e.message,
          });
        }
      } else if (html) {
        await page.setContent(html, { waitUntil: "networkidle0" });
      } else {
        // Standard URL navigation
        if (stealth) await applyStealth(page);
        if (headers && Object.keys(headers).length > 0)
          await page.setExtraHTTPHeaders(headers);

        await page.setViewport({
          width: Number(width),
          height: Number(height),
        });

        try {
          await page.goto(url, {
            waitUntil:
              wait === "smart" ? "networkidle2" : wait || "networkidle2",
            timeout: 25000,
          });
        } catch (gotoError) {
          console.warn(`Navigation timeout. Proceeding.`);
        }
      }

      // Feature 1-4, 6: Advanced Processing
      const debugInfo = await renderer.process();

      // Selector Wait
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: 5000 });
        } catch (e) {}
      }

      if (waitFor > 0) {
        await new Promise((r) => setTimeout(r, Number(waitFor)));
      }

      const screenshot = await page.screenshot({
        fullPage: !!fullPage,
        type: format === "jpeg" ? "jpeg" : "png",
        quality: format === "jpeg" ? Number(quality) : undefined,
        encoding: "base64",
      });

      await releasePage(page);
      // Reset idle timer so browser stays warm for subsequent requests
      resetIdleTimer();

      const renderTime = Date.now() - startTime;
      res.setHeader("X-Render-Time", `${renderTime}ms`);
      res.setHeader("X-Cache", "MISS");

      const responseData = {
        success: true,
        image_base64: screenshot,
        format,
        width: Number(width),
        height: Number(height),
        url: url || "template",
        render_time: renderTime,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      };

      // Feature 6: Debug Mode
      if (debug) {
        responseData.debug = debugInfo;
      }

      // Cache the result
      cacheSet(cacheKey, responseData);

      // Return binary if requested or JSON default
      if (req.headers["accept"]?.includes("image/")) {
        const buffer = Buffer.from(screenshot, "base64");
        res.setHeader(
          "Content-Type",
          format === "jpeg" ? "image/jpeg" : "image/png",
        );
        return res.end(buffer, "binary");
      }

      return res.status(200).json(responseData);
    } catch (error) {
      lastError = error;
      if (page) await releasePage(page).catch(() => {});
      if (
        error.message.includes("Target closed") ||
        error.message.includes("Session closed")
      ) {
        await closeBrowser(true);
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }

  return res.status(500).json({
    success: false,
    error: "render_failed",
    message: `All attempts failed. Last error: ${lastError.message}`,
    request_id: requestId,
  });
}
