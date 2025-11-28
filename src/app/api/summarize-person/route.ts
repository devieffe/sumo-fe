const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

interface SerpResult {
  link: string;
  thumbnail?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    // --- RATE LIMITING ---
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

    // --- PARSE REQUEST ---
    const { topic } = await req.json();
    if (!topic || topic.trim() === '') {
      return new Response(JSON.stringify({ error: 'Missing topic' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    // --- FETCH SERPAPI ---
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
    const organic = serpData.organic_results || [];

    const links = organic
      .slice(0, 20)
      .map((r: SerpResult) => r.link)
      .filter(Boolean);

    if (links.length === 0) {
      return new Response(JSON.stringify({ error: 'No search results found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ====================================================================
    // 📸 FIND BEST PHOTO
    // Priority 1: Wikipedia image
    // ====================================================================

    async function getWikipediaPhoto(name: string) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(
        name
      )}`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return null;

      const page = Object.values(pages)[0] as any;
      return page?.original?.source || null;
    }

    let photoUrl: string | null = null;
    let photoUncertain = false;

    // Try Wikipedia (strict)
    photoUrl = await getWikipediaPhoto(topic);

    // ====================================================================
    // Fallback: SerpAPI images_results or thumbnails
    // ====================================================================
    if (!photoUrl) {
      const serpImages = serpData.images_results || [];
      if (serpImages.length > 0 && serpImages[0].original) {
        photoUrl = serpImages[0].original;
        photoUncertain = true;
      } else {
        const firstThumb = organic[0]?.thumbnail;
        if (firstThumb) {
          photoUrl = firstThumb;
          photoUncertain = true;
        }
      }
    }

    // ====================================================================
    // OPENAI SUMMARY
    // ====================================================================

    const prompt = `
The user searched for "${topic}". This name may refer to one or more real people.

1. If it's not a real person, respond only: "Not a real person."
2. If it's a common name with multiple individuals, select only one notable person based on:
   - Relevance (highest significance in results)
   - Country of origin
   - Profession
   - Uniqueness

Write a 200-word summary about that selected individual using the links below:

${links.join('\n')}

Do not mention ambiguity. Provide a single focused biography.
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
          {
            role: 'system',
            content: 'You summarize real individuals based on source links.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const openaiData = await openaiRes.json();

    if (openaiData.error) {
      console.error('OpenAI error:', openaiData.error);
      return new Response(JSON.stringify({ error: openaiData.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const summary = openaiData.choices?.[0]?.message?.content || 'No summary returned.';

    return new Response(
      JSON.stringify({
        summary,
        photoUrl,
        photoUncertain,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('API error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}