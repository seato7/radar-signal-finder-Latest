/**
 * Direct Google Gemini API utility — ~100x cheaper than the Lovable gateway.
 * Requires GEMINI_API_KEY env var.
 *
 * callGemini     — gemini-2.0-flash  (cheap, for simple/structured tasks)
 * callGeminiPro  — gemini-2.5-flash-preview-04-17  (smarter, for complex tasks)
 */

async function _callGeminiModel(
  model: string,
  prompt: string,
  maxTokens: number,
  responseType: 'json' | 'text' = 'json',
): Promise<string | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('[GEMINI] GEMINI_API_KEY not configured');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0.1,
    maxOutputTokens: maxTokens,
  };
  if (responseType === 'json') {
    generationConfig.responseMimeType = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
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

/** gemini-2.0-flash — cheap, ideal for simple/structured extraction tasks */
export async function callGemini(
  prompt: string,
  maxTokens: number = 300,
  responseType: 'json' | 'text' = 'json',
): Promise<string | null> {
  return _callGeminiModel('gemini-2.0-flash', prompt, maxTokens, responseType);
}

/** gemini-2.5-flash-preview-04-17 — smarter, for moderate/complex reasoning tasks */
export async function callGeminiPro(
  prompt: string,
  maxTokens: number = 1000,
  responseType: 'json' | 'text' = 'text',
): Promise<string | null> {
  return _callGeminiModel('gemini-2.5-flash-preview-04-17', prompt, maxTokens, responseType);
}
