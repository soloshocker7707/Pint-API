import { ZuploRequest, ZuploContext } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized", message: "API Key missing" }), { 
      status: 401, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  // --- MOCK AUTH FOR TIER TESTING ---
  // This allow us to test the rate-limiting tiers without a Supabase connection
  if (apiKey.startsWith("pk_test_")) {
    const tier = apiKey.split("_")[2] || "Starter"; // e.g., pk_test_Pro
    const validTiers = ["Starter", "Pro", "Business", "Enterprise"];
    const activeTier = validTiers.find(t => t.toLowerCase() === tier.toLowerCase()) || "Starter";

    request.user = {
      sub: `mock_${apiKey}`,
      email: "tester@renderkit.com",
      groups: [activeTier]
    };
    
    context.log.info(`Mocking Auth: API Key ${apiKey} -> Tier ${activeTier}`);
    return request;
  }

  // --- REAL AUTH (Requires Environment Variables) ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ 
      error: "Infrastructure Misconfigured", 
      message: "Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Zuplo Portal." 
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?api_key=eq.${apiKey}&select=*`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
    });

    const profiles = await response.json();
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "Unauthorized", message: "Invalid API Key" }), { 
        status: 401, headers: { "Content-Type": "application/json" } 
      });
    }

    const userProfile = profiles[0];
    request.user = {
      sub: userProfile.id,
      email: userProfile.email,
      groups: [userProfile.tier || "Starter"]
    };

    return request;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal Server Error", details: err.message }), { 
      status: 500, headers: { "Content-Type": "application/json" } 
    });
  }
}
