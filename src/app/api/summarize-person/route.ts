import type { NextRequest } from 'next/server';

interface SerpResult {
  link: string;
  thumbnail?: string;
}

interface SummaryResponse {
  summary: string;
  photoUrl?: string | null;
  photoUncertain?: boolean;
  error?: string;
}

const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function POST(req: NextRequest) {
  try {
    // --- RATE LIMITING ---
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const now = Date.now();
    const existing = ipRequests.get(ip);

    if (existing) {
      if (now - existing.timestamp < WINDOW_MS) {
        if (existing.count >= MAX_REQUESTS) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Try again in 2 hours.' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }
        existing.count++;
      } else {
        existing.count = 1;
        existing.timestamp = now;
      }
      ipRequests.set(ip, existing);
    } else {
      ipRequests.set(ip, { count: 1, timestamp: now });
    }

    // --- PARSE REQUEST ---
    const body: { topic?: string } = await req.json();
    const topic = body.topic?.trim();
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Missing topic' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    // --- SERPAPI ---
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(topic)}&num=20&api_key=${serpApiKey}`
    );

    if (!serpRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch search results' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const serpData: {
      organic_results?: SerpResult[];
      images_results?: { original?: string }[];
    } = await serpRes.json();

    const organic = serpData.organic_results ?? [];
    const links = organic.map((r) => r.link).filter(Boolean);

    if (links.length === 0) {
      return new Response(JSON.stringify({ error: 'No search results found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- WIKIPEDIA PHOTO ---
    async function getWikipediaPhoto(name: string): Promise<string | null> {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(
          name
        )}`
      );

      if (!res.ok) return null;

      const data = await res.json();
      const pages = data.query?.pages;
      if (!pages) return null;

      const page = Object.values(pages)[0] as { original?: { source: string } };
      return page.original?.source ?? null;
    }

    let photoUrl: string | null = await getWikipediaPhoto(topic);
    let photoUncertain = false;

    // fallback: first SERPAPI image or thumbnail
    if (!photoUrl) {
      const serpImages = serpData.images_results ?? [];
      if (serpImages.length > 0 && serpImages[0].original) {
        photoUrl = serpImages[0].original;
        photoUncertain = true;
      } else if (organic[0]?.thumbnail) {
        photoUrl = organic[0].thumbnail;
        photoUncertain = true;
      }
    }

    // --- OPENAI SUMMARY ---
    const prompt = `
Summarize the individual named "${topic}" using these links. 150-250 words, ignore social media.
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
          { role: 'system', content: 'Summarize real individuals from source links.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const openaiData: {
      choices?: { message?: { content: string } }[];
      error?: { message: string };
    } = await openaiRes.json();

    if (openaiData.error) {
      return new Response(JSON.stringify({ error: openaiData.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const summary = openaiData.choices?.[0].message?.content ?? 'No summary returned.';

    return new Response(
      JSON.stringify({ summary, photoUrl, photoUncertain }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}