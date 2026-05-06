import { getBrowser, closeBrowser } from '../../../lib/browser.js';
import { validateZuploSecret, setCorsHeaders } from '../../../lib/auth.js';
import { applyStealth } from '../../../lib/stealth.js';
import { waitForStability } from '../../../lib/smart-wait.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Authentication check
  if (!validateZuploSecret(req, res)) return;

  const { 
    url, 
    html,
    format = 'A4', 
    landscape = false, 
    margin = { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
    printBackground = true,
    scale = 1,
    wait = 'networkidle2',
    stealth = true,
    headers = {}
  } = req.body;

  if (!url && !html) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Either "url" or "html" must be provided.' 
    });
  }

  let lastError = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let browser = null;
    let page = null;

    try {
      browser = await getBrowser();
      page = await browser.newPage();
      
      // 1. Apply Stealth
      if (stealth) {
        await applyStealth(page);
      }

      // 2. Set Custom Headers
      if (headers && Object.keys(headers).length > 0) {
        await page.setExtraHTTPHeaders(headers);
      }

      if (html) {
        // If HTML is provided, we use setContent
        await page.setContent(html, { waitUntil: 'networkidle0' });
      } else {
        // If URL is provided, use goto with timeout fallback
        try {
          await page.goto(url, { 
            waitUntil: wait === 'auto' ? 'networkidle2' : (wait || 'networkidle2'), 
            timeout: 25000 
          });
        } catch (gotoError) {
          console.warn(`PDF Navigation timeout on attempt ${attempt}. Proceeding.`);
        }
      }

      // 3. Smart Wait Engine
      if (wait === 'auto') {
        await waitForStability(page);
      }

      const pdfBuffer = await page.pdf({
        format,
        landscape: !!landscape,
        printBackground: !!printBackground,
        scale: Number(scale),
        margin: {
          top: margin.top || '1cm',
          right: margin.right || '1cm',
          bottom: margin.bottom || '1cm',
          left: margin.left || '1cm'
        }
      });

      // Cleanup page but keep browser alive
      await page.close();

      if (process.env.DEBUG_PREVIEW === 'true') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.end(pdfBuffer, 'binary');
      }

      return res.status(200).json({
        success: true,
        pdf_base64: pdfBuffer.toString('base64'),
        format,
        landscape: !!landscape,
        attempt,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      lastError = error;
      console.error(`PDF Attempt ${attempt} failed:`, error.message);
      
      if (page) await page.close().catch(() => {});
      
      if (error.message.includes('navigating to') || error.message.includes('Target closed') || error.message.includes('Session closed')) {
        await closeBrowser(true); 
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
    }
  }

  return res.status(500).json({ 
    status: 'error', 
    message: `All ${maxRetries} PDF attempts failed. Last error: ${lastError.message}` 
  });
}
