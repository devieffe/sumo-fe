

export async function POST(req: Request): Promise<Response> {
  try {
    const { topic } = await req.json();

    if (!topic || topic.trim() === '') {
      return new Response(JSON.stringify({ error: 'Missing topic' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Received topic:', topic);

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    // 1. Get top 20 links from SerpAPI
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
    const links = (serpData.organic_results || [])
      .slice(0, 20)
      .map((r: any) => r.link)
      .filter(Boolean);

    if (!links.length) {
      return new Response(JSON.stringify({ error: 'No search results found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Build prompt for OpenAI
const prompt = `
The user searched for "${topic}". This name may refer to one or more real people.

1. If it's **not a real person**, respond only: "Not a real person."
2. If it's **a common name with multiple people**, pick **only one** notable person to write about, based on:
   - Relevance (e.g. most known in search results),
   - Country of origin or association,
   - Profession and uniqueness.

Write a single 200-word summary about **that one real person**, using these links:

${links.join('\n')}

Avoid repeating that many people share the same name — instead, focus on summarizing the **most relevant individual** clearly.
`;

    // 3. Request summary from OpenAI
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
            content: 'You are a helpful assistant that summarizes real people based on source links.',
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

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}