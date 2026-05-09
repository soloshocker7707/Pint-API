import { ZuploRequest, ZuploContext } from "@zuplo/runtime";

const TIER_CONFIGS = {
  Free: {
    monthly_limit: 250,
    rpm: 5
  },
  Starter: {
    monthly_limit: 5000,
    rpm: 30
  },
  Growth: {
    monthly_limit: 25000,
    rpm: 120
  },
  Scale: {
    monthly_limit: 75000,
    rpm: 300
  }
};

export function getRateLimit(request: ZuploRequest, context: ZuploContext) {
  // Identify group - default to Free if not found
  const groups = request.user?.groups || [];
  const activeTierName = Object.keys(TIER_CONFIGS).find(tier => groups.includes(tier)) || 'Free';
  const config = TIER_CONFIGS[activeTierName];

  return {
    key: request.user?.sub || request.clientIp,
    requestsAllowed: config.rpm,
    timeWindowMinutes: 1
  };
}

export function getQuota(request: ZuploRequest, context: ZuploContext) {
  // Identify group - default to Free if not found
  const groups = request.user?.groups || [];
  const activeTierName = Object.keys(TIER_CONFIGS).find(tier => groups.includes(tier)) || 'Free';
  const config = TIER_CONFIGS[activeTierName];

  return {
    key: request.user?.sub || "anonymous",
    requestsAllowed: config.monthly_limit,
    timeWindowMinutes: 43200 // 30 days in minutes
  };
}
