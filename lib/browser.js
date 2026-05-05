import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/**
 * getBrowser - SaaS-grade browser handler.
 * Supports local Chrome, Vercel-native Chromium, or Remote Browser Services (WebSocket).
 */
export async function getBrowser() {
  // 1. Production SaaS approach: Connect to a hosted browser service (Browserless, etc)
  // This is the most reliable way to avoid 'libnss3.so' and memory issues.
  if (process.env.BROWSER_WSE_ENDPOINT) {
    return await puppeteer.connect({
      browserWSEndpoint: process.env.BROWSER_WSE_ENDPOINT,
    });
  }

  const isLocal = process.env.NODE_ENV === 'development' || !!process.env.IS_LOCAL;
  
  // 2. Local Development approach
  if (isLocal) {
    return await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  // 3. Fallback: Vercel-native Chromium
  // Using explicit stable flags for Node 20 / AL2023 compatibility.
  const executablePath = await chromium.executablePath();

  return await puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process' // Mandatory for many serverless environments
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

export async function closeBrowser(browser) {
  if (browser) {
    // If it's a connected browser, we should disconnect instead of close 
    // to let the remote service handle cleanup, but .close() usually works too.
    await browser.close();
  }
}
