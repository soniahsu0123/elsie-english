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

    const prompt = `You are Lemon, a warm and encouraging English teacher for children aged 10-12.
The child was trying to say this sentence: "${original_text}"
Listen to their recording carefully.

If their pronunciation is clear and accurate:
- Celebrate enthusiastically with 3-4 sentences of genuine praise
- Mention something specific they did well
- Do NOT say "try again" or suggest they practice more
- End with something like "Amazing job! You nailed it! ⭐"

If there are pronunciation issues:
- Start with 1-2 sentences of genuine encouragement (find something positive)
- Give exactly 1 simple, specific tip (e.g. "Try saying 'the' as 'thuh'")
- End with: "Give it another try — you can do it! 💪"

Keep it short (3-4 sentences max), warm, and fun. Speak directly to the child.`;

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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Great effort! Keep going! ⭐";
    return cors(JSON.stringify({ content: [{ text }] }), 200);
  } catch (e) {
    // Gemini unavailable — fallback to Claude text-based pronunciation tips
    if (original_text) {
      return claudePronunciationFallback(original_text, env);
    }
    return cors(JSON.stringify({ content: [{ text: "Great practice! Keep it up! 🌟" }] }), 200);
  }
}

async function claudePronunciationFallback(sentence, env) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: 'You are Lemon, a warm encouraging English teacher for Taiwanese kids aged 10-12. Plain text only, no markdown, no bullet points, no bold. Be enthusiastic and friendly.',
        messages: [{
          role: 'user',
          content: `Give a 2-3 sentence pronunciation tip for a Taiwanese student practicing this sentence: "${sentence}". Focus on 1 specific sound tricky for Taiwanese speakers (e.g. th, v/b, final consonants, r). Plain text only, no markdown. Be encouraging. End with "Keep going! 💪"`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "Great practice! Keep it up! 🌟";
    return cors(JSON.stringify({ content: [{ text }] }), 200);
  } catch(e) {
    return cors(JSON.stringify({ content: [{ text: "Great practice! Keep it up! 🌟" }] }), 200);
  }
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
