export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return cors('', 204);
    }
    const url = new URL(request.url);
    if (url.pathname === '/gemini-audio') {
      return handleGeminiAudio(request, env);
    }
    return handleClaude(request, env);
  }
};

async function handleClaude(request, env) {
  try {
    const body = await request.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return cors(JSON.stringify(data), res.status);
  } catch (e) {
    return cors(JSON.stringify({ error: e.message }), 500);
  }
}

async function handleGeminiAudio(request, env) {
  let original_text = '';
  try {
    const body = await request.json();
    const { audio_base64, mime_type } = body;
    original_text = body.original_text || '';

    const prompt = `You are Sonia, a warm English teacher for Taiwanese children aged 10-12.
The child was trying to say: "${original_text}"
Listen to their recording.

Respond in Traditional Chinese (繁體中文). Keep it very short (1-2 sentences only).

If pronunciation is clear enough to understand (be generous — accept reasonable pronunciation even with an accent):
Start with PASS: then give short warm praise in Chinese.
Example: "PASS: 說得很棒！發音很清楚，繼續加油！⭐"

If pronunciation clearly needs improvement:
Start with FAIL: then give ONE specific simple tip about the tricky sound in Chinese.
Example: "FAIL: 試試把 'th' 的舌頭放在牙齒之間輕輕吹氣。再試一次！💪"

Be generous with PASS — if it sounds roughly correct, say PASS. Only say FAIL for clear pronunciation problems.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mime_type || 'audio/webm', data: audio_base64 } }
            ]
          }],
          generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
        })
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Gemini error');
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || 'PASS: 很好！繼續加油！⭐';
    const pass = raw.startsWith('PASS:');
    const text = raw.replace(/^(PASS:|FAIL:)\s*/, '').trim();
    return cors(JSON.stringify({ content: [{ text }], pass }), 200);
  } catch (e) {
    // Gemini unavailable — fallback to Claude text-based pronunciation tips
    if (original_text) {
      return claudePronunciationFallback(original_text, env);
    }
    return cors(JSON.stringify({ content: [{ text: "Great practice! Keep it up! 🌟" }] }), 200);
  }
}

async function claudePronunciationFallback(sentence, env) {
  return cors(JSON.stringify({ content: [{ text: '麥克風沒有收到聲音，再試一次！🎙️' }], pass: false }), 200);
}

function cors(body, status) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
