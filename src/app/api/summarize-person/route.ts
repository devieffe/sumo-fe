import type { NextRequest } from 'next/server';

const MAX_REQUESTS = 100;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const ipRequests = new Map<string, { count: number; timestamp: number }>();

const ERROR_MSG = "No results.";
const LIMIT_MSG = "Rate limit exceeded. Try again in 2 hours.";

function isValidQuery(query: string) {
  return !!query?.trim() && /^[a-zA-Z\s'.-]+$/.test(query);
}

// --- Fetch og:image from fallback link ---
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'GET' });
    const html = await res.text();
    const ogMatch = html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i);
    return ogMatch ? ogMatch[1] : null;
  } catch {
    return null;
  }
}

// --- Get first valid image ---
async function getFirstImage(searchData: any, firstLink?: string): Promise<string | null> {
  // 1. Try SERPAPI images_results
  if (searchData.images_results?.length) {
    for (const img of searchData.images_results.slice(0, 5)) {
      const url = img.original || img.thumbnail;
      if (url) return url;
    }
  }

  // 2. Try og:image from first organic link
  if (firstLink) {
    const fallback = await fetchOgImage(firstLink);
    if (fallback) return fallback;
  }

  // 3. No image found
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // --- Rate limit ---
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const now = Date.now();
    const existing = ipRequests.get(ip);
    if (existing) {
      if (now - existing.timestamp < WINDOW_MS && existing.count >= MAX_REQUESTS)
        return new Response(JSON.stringify({ error: LIMIT_MSG }), { status: 429 });
      existing.count++;
      ipRequests.set(ip, existing);
    } else {
      ipRequests.set(ip, { count: 1, timestamp: now });
    }

    // --- Input validation ---
    const { topic } = await req.json();
    if (!isValidQuery(topic)) return new Response(JSON.stringify({ error: ERROR_MSG }), { status: 400 });

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    // --- SERPAPI search ---
    const searchRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(topic)}&num=25&ijn=0&api_key=${serpApiKey}`
    );
    if (!searchRes.ok) return new Response(JSON.stringify({ error: ERROR_MSG }), { status: 502 });

    const searchData = await searchRes.json();
    const links: string[] = (searchData.organic_results || [])
      .slice(0, 15)
      .map((r: any) => r.link)
      .filter(Boolean);
    if (!links.length) return new Response(JSON.stringify({ error: ERROR_MSG }), { status: 404 });

    // --- Image ---
    const photoUrl = await getFirstImage(searchData, links[0]);

    // --- OpenAI summary ---
    const prompt = `
Summarize the person or character described by the following links in 150-200 words.
Skip mentioning social media profiles.
Use only information from these sources. Do not include social media info.

${links.join('\n')}
`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Summarize a person or character from the links provided.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const openaiData = await openaiRes.json();
    const summary = openaiData?.choices?.[0]?.message?.content || "No summary available.";

    return new Response(JSON.stringify({ summary, photoUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: ERROR_MSG }), { status: 500 });
  }
}