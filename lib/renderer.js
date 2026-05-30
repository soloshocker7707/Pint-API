import { waitForStability } from './smart-wait.js';

/**
 * Advanced Rendering Engine for RenderKit API
 * Handles: Auto-Clean, Animation Freezing, Smart Stabilization, etc.
 */

const CLEANUP_SELECTORS = [
  // Cookie Banners & Consent Managers
  '#onetrust-consent-sdk',
  '#didomi-host',
  '.didomi-popup',
  '.cookie-notice',
  '#cookie-notice',
  '.cookie-banner',
  '#cookie-banner',
  '[id*="cookie-banner"]',
  '[class*="cookie-banner"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '.cc-window',
  '.cc-banner',
  '#cmp-container',
  '.truste_overlay',
  '.truste_container',
  '#CybotCookiebotDialog',
  '.gdpr-consent',
  
  // Newsletter Popups
  '[id*="newsletter"]',
  '[class*="newsletter"]',
  '.mc-modal',
  '.mc-banner',
  '#mailchimp-popup',
  '.popup-overlay',
  
  // Chat Widgets
  '#hubspot-messages-iframe-container',
  '.intercom-lightweight-app',
  '#intercom-container',
  '.drift-frame-controller',
  '#smile-ui-container',
  '#zendesk-widget',
  
  // Ads & Sticky Overlays
  '.ad-unit',
  '[id*="google_ads"]',
  'iframe[id*="google_ads"]',
  '.sticky-footer',
  '.floating-ad',
  '.at-share-dock',
  
  // General Overlays/Modals
  '.modal-backdrop',
  '.modal-open',
  '.sp-fancybox-overlay',
  '.fancybox-overlay',
  '.blocker'
];

export class Renderer {
  constructor(page, options = {}) {
    this.page = page;
    this.options = options;
    this.debugInfo = {
      startTime: Date.now(),
      timings: {},
      actions: []
    };
  }

  async process() {
    this.mark('start_processing');

    // 0. Emulate Color Scheme
    if (this.options.colorScheme) {
      await this.page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: this.options.colorScheme }
      ]);
    }

    // 1. Freeze Animations
    if (this.options.freezeAnimations !== false) {
      await this.freezeAnimations();
    }

    // 2. Auto Clean Mode
    if (this.options.clean) {
      await this.autoClean();
    }

    // 3. Custom CSS Injection
    if (this.options.css) {
      await this.injectCustomCSS();
    }

    // 4. Smart Stabilization
    if (this.options.wait === 'smart') {
      await this.smartWait();
    }

    this.mark('end_processing');
    return this.debugInfo;
  }

  mark(label) {
    this.debugInfo.timings[label] = Date.now() - this.debugInfo.startTime;
    this.debugInfo.actions.push(label);
  }

  async freezeAnimations() {
    this.mark('freeze_animations_start');
    await this.page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0s !important;
          animation-delay: -1s !important;
          transition-delay: -1s !important;
          caret-color: transparent !important;
        }
        video {
          display: none !important;
        }
      `
    });
    // Also try to pause video elements via JS
    await this.page.evaluate(() => {
      document.querySelectorAll('video').forEach(v => v.pause());
    });
    this.mark('freeze_animations_end');
  }

  async autoClean() {
    this.mark('auto_clean_start');
    const selectors = CLEANUP_SELECTORS.join(', ');
    const options = {
      preserveStickyHeaders: this.options.preserveStickyHeaders !== false,
      aggressiveClean: this.options.aggressiveClean === true,
    };

    await this.page.evaluate((selectors, options) => {
      const hideElement = (el) => {
        if (!el || el === document.body || el === document.documentElement) return;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.opacity = '0';
      };

      // 1. Remove by known intrusive selectors.
      document.querySelectorAll(selectors).forEach(hideElement);

      // 2. Heuristic: remove large fixed overlays and high-z popup-like elements,
      // but preserve normal site chrome such as sticky headers/nav unless aggressiveClean is enabled.
      const all = document.querySelectorAll('*');
      const vWidth = window.innerWidth;
      const vHeight = window.innerHeight;
      const viewportArea = vWidth * vHeight;
      const popupPattern = /(modal|popup|overlay|consent|cookie|banner|subscribe|newsletter|interstitial|paywall|ad-|ads|gdpr|cmp|notice|dialog)/i;

      all.forEach(el => {
        if (el === document.body || el === document.documentElement) return;

        const style = window.getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') return;

        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        const areaRatio = area / viewportArea;
        const zIndex = parseInt(style.zIndex || '0', 10) || 0;
        const identity = `${el.id || ''} ${el.className || ''} ${el.getAttribute('role') || ''} ${el.getAttribute('aria-label') || ''}`;
        const tag = el.tagName.toLowerCase();
        const isSiteChrome = ['header', 'nav'].includes(tag) || ['banner', 'navigation'].includes(el.getAttribute('role') || '');
        const isTopChrome = rect.top <= 2 && rect.height <= vHeight * 0.22 && rect.width >= vWidth * 0.45;
        const isBottomChrome = rect.bottom >= vHeight - 2 && rect.height <= vHeight * 0.22;
        const looksLikePopup = popupPattern.test(identity);
        const coversViewport = areaRatio > 0.4;
        const highZPopup = zIndex > 500 && looksLikePopup;
        const removableStickyAd = zIndex > 500 && isBottomChrome && looksLikePopup;

        if (options.preserveStickyHeaders && isSiteChrome && isTopChrome && !looksLikePopup && !options.aggressiveClean) {
          return;
        }

        if (coversViewport || highZPopup || removableStickyAd || options.aggressiveClean && zIndex > 1200) {
          hideElement(el);
        }
      });

      // 3. Unblock scrolling without hiding body/html.
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';
    }, selectors, options);

    this.mark('auto_clean_end');
  }

  async injectCustomCSS() {
    this.mark('custom_css_start');
    await this.page.addStyleTag({ content: this.options.css });
    this.mark('custom_css_end');
  }

  async smartWait() {
    this.mark('smart_wait_start');
    
    // 1. Wait for Fonts
    try {
      await this.page.evaluateHandle('document.fonts.ready');
    } catch (e) {
      this.debugInfo.actions.push('font_wait_failed');
    }

    // 2. Auto-scroll to trigger lazy loading
    if (this.options.fullPage) {
      await this.autoScroll();
    }

    // 3. Wait for stability
    await waitForStability(this.page, 5000);

    this.mark('smart_wait_end');
  }

  async autoScroll() {
    this.mark('auto_scroll_start');
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 200; // Faster scroll
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 10000) {
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 80);
      });
    });
    this.mark('auto_scroll_end');
  }
}

/**
 * Renders an HTML template with dynamic data.
 */
export function renderTemplate(template, data = {}) {
  let html = template;
  
  // Variable replacement: {{variable}}
  Object.keys(data).forEach(key => {
    const value = data[key];
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value);
  });

  return html;
}
