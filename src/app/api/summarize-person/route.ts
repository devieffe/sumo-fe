import type { NextRequest } from 'next/server';

const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

interface SerpResult {
  link: string;
}

interface ResponseData {
  summary: string;
  photoUrl?: string;
  photoCaption?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const now = Date.now();
    const existing = ipRequests.get(ip);

    if (existing) {
      const timeDiff = now - existing.timestamp;
      if (timeDiff < WINDOW_MS) {
        if (existing.count >= MAX_REQUESTS) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Try again in 2 hours.' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }
        existing.count++;
        ipRequests.set(ip, existing);
      } else {
        ipRequests.set(ip, { count: 1, timestamp: now });
      }
    } else {
      ipRequests.set(ip, { count: 1, timestamp: now });
    }

    const { topic } = await req.json();
    if (!topic?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(topic)}&num=20&api_key=${serpApiKey}`
    );

    if (!serpRes.ok) {
      const text = await serpRes.text();
      console.error('SerpAPI error:', text);
      return new Response(JSON.stringify({ error: 'Failed to fetch search results' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serpData = await serpRes.json();
    const links = (serpData.organic_results as SerpResult[] || [])
      .slice(0, 20)
      .map((r) => r.link)
      .filter(Boolean);

    if (!links.length) {
      return new Response(JSON.stringify({ error: 'No search results found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt = `
The user searched for "${topic}". This name may refer to one or more real people.

1. If it's not a real person, respond only: "Not a real person."
2. If it's a common name with multiple people, pick only one notable individual based on:
   - Relevance (most known in results),
   - Country of origin,
   - Profession and uniqueness.

Write a 200-word summary about that one real person, using these links:

${links.join('\n')}
`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes real people based on source links.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const openaiData = await openaiRes.json();

    if ('error' in openaiData) {
      console.error('OpenAI error:', openaiData.error);
      return new Response(JSON.stringify({ error: openaiData.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extract photo from Wikipedia or fallback
    let photoUrl: string | undefined;
    let photoCaption: string | undefined;
    for (const link of links) {
      if (link.includes('wikipedia.org')) {
        photoUrl = `${link.replace(/\/$/, '')}.jpg`; // naive example
        photoCaption = 'Image from Wikipedia';
        break;
      }
    }

    const summary = openaiData.choices?.[0]?.message?.content || 'No summary returned.';

    const responseData: ResponseData = { summary, photoUrl, photoCaption };
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('API error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}