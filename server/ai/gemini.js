const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = 'gemini-2.0-flash';

function call(systemPrompt, userMessage, maxTokens = 4096) {
  if (!GEMINI_API_KEY) {
    return Promise.reject(Object.assign(new Error('GEMINI_API_KEY not configured on server'), { statusCode: 500 }));
  }

  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            const msg = (parsed.error && parsed.error.message) || ('Gemini API error ' + res.statusCode);
            return reject(Object.assign(new Error(msg), { statusCode: res.statusCode }));
          }
          let text = '';
          if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
            text = parsed.candidates[0].content.parts.map(p => p.text || '').join('');
          }
          resolve(text);
        } catch (e) {
          reject(Object.assign(new Error('Failed to parse Gemini response'), { statusCode: 502 }));
        }
      });
    });
    req.on('error', (err) => reject(Object.assign(new Error('Failed to reach Gemini API: ' + err.message), { statusCode: 502 })));
    req.write(payload);
    req.end();
  });
}

function parseJSON(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* ignore */ } }
    return null;
  }
}

function keyConfigured() { return !!GEMINI_API_KEY; }

module.exports = { call, parseJSON, keyConfigured };
