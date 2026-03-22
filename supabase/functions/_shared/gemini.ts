/**
 * Direct Google Gemini API utility — ~100x cheaper than the Lovable gateway.
 * Requires GEMINI_API_KEY env var.
 */
export async function callGemini(prompt: string, maxTokens: number = 300): Promise<string | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('[GEMINI] GEMINI_API_KEY not configured');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (err) {
    console.error('[GEMINI] fetch error:', err);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const errType =
      response.status === 429 ? 'Rate limited' :
      response.status === 402 ? 'Quota exceeded' :
      response.status === 401 ? 'Auth error' : 'API error';
    console.error(`[GEMINI] ${errType} (${response.status}): ${body.substring(0, 300)}`);
    return null;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  if (text === null) {
    console.warn('[GEMINI] Response ok but no text in candidates:', JSON.stringify(data).substring(0, 300));
  }
  return text;
}
