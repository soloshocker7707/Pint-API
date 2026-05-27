const ZUPLO_URL = 'https://pint-api-panel-main-87c9a67.zuplo.app';
const API_KEY = 'pk_b3fe5cf00d7c42be8223ad5ff4a34435';

async function testEndpoint(path, params = {}) {
    const startTime = Date.now();
    try {
        const response = await fetch(`${ZUPLO_URL}${path}`, {
            method: 'POST',
            headers: { 
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });
        
        const duration = Date.now() - startTime;
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, duration, data };
    } catch (error) {
        return { ok: false, status: 0, duration: Date.now() - startTime, error: error.message };
    }
}

async function runTests() {
    console.log('--- STARTING SYSTEM INTEGRATION & STRESS TEST ---');
    console.log(`Target: ${ZUPLO_URL}`);
    console.log(`API Key: ${API_KEY}`);
    
    const results = {
        capture: [],
        pdf: [],
        og: [],
        rateLimitTriggered: false
    };

    // 1. Verify all features first
    console.log('\nTesting feature: SCREENSHOT CAPTURE...');
    const capRes = await testEndpoint('/v1/screenshot/capture', { url: 'https://example.com' });
    results.capture.push(capRes);
    console.log(`Capture: Status ${capRes.status}, Duration: ${capRes.duration}ms, Success: ${capRes.data.success}`);

    console.log('\nTesting feature: PDF GENERATION...');
    const pdfRes = await testEndpoint('/v1/screenshot/pdf', { url: 'https://example.com' });
    results.pdf.push(pdfRes);
    console.log(`PDF: Status ${pdfRes.status}, Duration: ${pdfRes.duration}ms, Success: ${pdfRes.data.success}`);

    console.log('\nTesting feature: OG IMAGE GENERATION...');
    const ogRes = await testEndpoint('/v1/screenshot/og', { url: 'https://example.com', title: 'Stress Test Title' });
    results.og.push(ogRes);
    console.log(`OG Image: Status ${ogRes.status}, Duration: ${ogRes.duration}ms, Success: ${ogRes.data.success}`);

    // 2. Stress Test / Rate Limit Test (Starter tier has 2 RPM limit)
    console.log('\n--- RUNNING RATE LIMIT STRESS TEST (Starter limit is 2 RPM) ---');
    console.log('We will send 3 requests in rapid succession to verify if the 3rd request is blocked with 429.');
    
    // We already sent 1 request for capture, and 1 for PDF, and 1 for OG.
    // However, rate limiting in Zuplo is set per-endpoint or global depending on configuration.
    // Let's see if we get rate limited by hitting /v1/screenshot/capture repeatedly.
    for (let i = 1; i <= 4; i++) {
        console.log(`Sending stress request #${i} to /v1/screenshot/capture...`);
        const res = await testEndpoint('/v1/screenshot/capture', { url: 'https://example.com' });
        console.log(`Req #${i}: Status ${res.status}, Success: ${res.data.success || false}`);
        results.capture.push(res);
        if (res.status === 429) {
            results.rateLimitTriggered = true;
            console.log('🛡️ 429 Rate Limit hit successfully!');
        }
    }

    console.log('\n--- TEST SUMMARY STATISTICS ---');
    const totalRequests = results.capture.length + results.pdf.length + results.og.length;
    const statuses = {};
    let totalDuration = 0;
    let successfulRequests = 0;

    [...results.capture, ...results.pdf, ...results.og].forEach(res => {
        statuses[res.status] = (statuses[res.status] || 0) + 1;
        if (res.ok) {
            successfulRequests++;
            totalDuration += res.duration;
        }
    });

    console.log(`Total Requests Sent: ${totalRequests}`);
    console.log(`Statuses Observed:`, statuses);
    console.log(`Successful Requests: ${successfulRequests}`);
    console.log(`Average Response Time (Success): ${(totalDuration / (successfulRequests || 1)).toFixed(2)}ms`);
    console.log(`Rate Limit (429) Working: ${results.rateLimitTriggered ? 'YES' : 'NO'}`);
}

runTests();
