/**
 * Smart Wait Engine - Detects page stability before capture.
 */

/**
 * waitForStability - Analyzes the DOM to ensure animations and network-triggered changes are settled.
 */
export async function waitForStability(page, timeout = 10000) {
  console.log('Smart Wait Engine: Analyzing page stability...');

  const checkInterval = 500; // ms
  const minStableIterations = 3; // stability must hold for 1.5s
  let stableIterations = 0;
  let lastState = '';

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // 1. Capture current state (DOM size + visible text count)
    const currentState = await page.evaluate(() => {
      return document.documentElement.innerHTML.length + document.querySelectorAll('*').length;
    });

    if (currentState === lastState) {
      stableIterations++;
    } else {
      stableIterations = 0;
      lastState = currentState;
    }

    // 2. If we've been stable for enough time, we're done
    if (stableIterations >= minStableIterations) {
      console.log('Smart Wait Engine: Page reached stable state.');
      return true;
    }

    await new Promise(r => setTimeout(r, checkInterval));
  }

  console.warn('Smart Wait Engine: Stability timeout reached. Proceeding anyway.');
  return false;
}
