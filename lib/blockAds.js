const BLOCKED_URL_PATTERNS = [
  /.*doubleclick\.net.*/,
  /.*googlesyndication\.com.*/,
  /.*adservice\.google\.com.*/,
  /.*ads\.youtube\.com.*/,
  /.*adservice\.twitter\.com.*/,
  /.*pixel\.adsafeprotected\.com.*/,
  /.*adsystem\.com.*/,
  /.*adroll\.com.*/,
  /.*facebook\.net\/ad\/.*/,
  /.*partnerstack\.com.*/,
  /.*taboola\.com.*/,
  /.*outbrain\.com.*/,
  /.*criteo\.com.*/,
  /.*amazon-adsystem\.com.*/,
  /.*medianet\.com.*/,
  /.*adsafeprotected\.com.*/,
  /.*shopping\.adservice.*/,
  /.*\/ads?\/.*/,
  /.*[?&](ad_|utm_ad|gclid|fbclid).*/,
];

const RESOURCE_POLICIES = {
  fidelity: new Set([]),
  balanced: new Set(['media']),
  performance: new Set(['image', 'media', 'font']),
};

export async function blockAds(page, options = {}) {
  const policyName = options.resourcePolicy || options.mode || 'balanced';
  const blockedResourceTypes = RESOURCE_POLICIES[policyName] || RESOURCE_POLICIES.balanced;
  const blockAdsByUrl = options.blockAdsByUrl !== false;

  await page.setRequestInterception(true);

  page.on('request', (req) => {
    const url = req.url();
    const resourceType = req.resourceType();

    if (blockedResourceTypes.has(resourceType)) {
      return req.abort();
    }

    if (blockAdsByUrl) {
      for (const pattern of BLOCKED_URL_PATTERNS) {
        if (pattern.test(url)) {
          return req.abort();
        }
      }
    }

    return req.continue();
  });
}
