import { getBrowser, closeBrowser } from '../../../lib/browser.js';
import { validateZuploSecret, setCorsHeaders } from '../../../lib/auth.js';
import { applyStealth } from '../../../lib/stealth.js';
import { waitForStability } from '../../../lib/smart-wait.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic authentication check
  if (!validateZuploSecret(req, res)) return;

  const { 
    url, 
    width = 1280, 
    height = 800, 
    fullPage = false, 
    waitFor = 0, 
    waitForSelector,
    wait = 'networkidle2', // Support 'auto' or standard waitUntil
    format = 'png', 
    quality = 90,
    stealth = true, // Default to true for better SaaS experience
    headers = {}
  } = req.body;

  if (!url) {
    return res.status(400).json({ status: 'error', message: 'url is required' });
  }

  let lastError = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let browser = null;
    let page = null;

    try {
      browser = await getBrowser();
      page = await browser.newPage();
      
      // 1. Apply Anti-Bot Stealth
      if (stealth) {
        await applyStealth(page);
      }

      // 2. Set Custom Headers if any
      if (headers && Object.keys(headers).length > 0) {
        await page.setExtraHTTPHeaders(headers);
      }

      await page.setViewport({ 
        width: Number(width), 
        height: Number(height) 
      });

      // 3. Navigation with Fallback
      try {
        await page.goto(url, { 
          waitUntil: wait === 'auto' ? 'networkidle2' : (wait || 'networkidle2'), 
          timeout: 25000 
        });
      } catch (gotoError) {
        console.warn(`Navigation timeout on attempt ${attempt}. Proceeding.`);
      }

      // 4. Smart Wait Engine
      if (wait === 'auto') {
        await waitForStability(page);
      }

      // JS Wait Controls
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: 5000 });
        } catch (e) {
          console.warn(`Selector ${waitForSelector} not found within 5s.`);
        }
      }

      if (waitFor > 0) {
        await new Promise(resolve => setTimeout(resolve, Number(waitFor)));
      }

      const screenshot = await page.screenshot({
        fullPage: !!fullPage,
        type: format === 'jpeg' ? 'jpeg' : 'png',
        quality: format === 'jpeg' ? Number(quality) : undefined,
        encoding: 'base64'
      });

      // Cleanup page but keep browser alive for pooling
      await page.close();

      if (process.env.DEBUG_PREVIEW === 'true') {
        const buffer = Buffer.from(screenshot, 'base64');
        res.setHeader('Content-Type', format === 'jpeg' ? 'image/jpeg' : 'image/png');
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer, 'binary');
      }

      return res.status(200).json({
        success: true,
        image_base64: screenshot,
        format,
        width: Number(width),
        height: Number(height),
        url,
        attempt,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      // Cleanup page if it exists
      if (page) await page.close().catch(() => {});
      
      // If the browser crashed, we force a close of the pooled instance so next attempt relaunches
      if (error.message.includes('navigating to') || error.message.includes('Target closed') || error.message.includes('Session closed')) {
        await closeBrowser(true); 
      }

      // If we have attempts left, wait a tiny bit and retry
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
    }
  }

  // If we got here, all retries failed
  return res.status(500).json({ 
    status: 'error', 
    message: `All ${maxRetries} attempts failed. Last error: ${lastError.message}` 
  });
}
