import type { NextRequest } from 'next/server';

const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

interface SerpResult {
  link: string;
  thumbnail?: string;
}

interface OpenAIChoice {
  message?: { content?: string };
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  error?: { message: string };
}

const ERROR_MSG = "Likely not a real person or character.";
const LIMIT_MSG = "Rate limit exceeded. Try again in 2 hours.";

// ----------------- Name validation -----------------
function isValidQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return /^[a-zA-Z\s'.-]+$/.test(trimmed);
}

// ----------------- Resolve canonical name & check person/character -----------------
async function resolveWikipediaCanonical(name: string): Promise<{ canonical: string; famous: boolean; isCharacter: boolean } | null> {
  try {
    // Search Wikipedia
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&utf8=&format=json&srlimit=1`;
    const res = await fetch(searchUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data?.query?.search?.[0];
    if (!first) return null;

    const canonical = first.title;

    // Fetch categories for strict check
    const catUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=categories&titles=${encodeURIComponent(canonical)}&cllimit=50`;
    const catRes = await fetch(catUrl);
    if (!catRes.ok) return null;
    const catData = await catRes.json();
    const pages = catData?.query?.pages;
    const page = Object.values(pages)[0] as any;
    const categories: string[] = (page?.categories || []).map((c: any) => c.title);

    // Allowed categories
    const personRegex = /(Living people|Deaths|Births|People|Historical figures|Politicians|Artists|Writers|Actors|Singers|Athletes)/i;
    const charRegex = /(Fictional characters|Characters|Protagonists|Villains|Heroes|Antagonists)/i;
    const bannedRegex = /(bands|groups|companies|organizations|albums|films|songs)/i;

    if (categories.some((cat) => bannedRegex.test(cat))) return null; // reject groups/companies

    const isPerson = categories.some((cat) => personRegex.test(cat));
    const isCharacter = categories.some((cat) => charRegex.test(cat));
    const famous = !!page?.pageid && !page?.missing && (isPerson || isCharacter);

    return { canonical, famous, isCharacter };
  } catch {
    return null;
  }
}

// ----------------- Wikipedia portrait -----------------
async function getWikipediaPhoto(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    const page = Object.values(pages)[0] as { original?: { source: string } };
    return page?.original?.source ?? null;
  } catch {
    return null;
  }
}

// ----------------- Portrait selection fallback -----------------
function selectPortraitFromImages(images: any[]): string | null {
  if (!images || !images.length) return null;
  const validImages = images.filter((img: any) => img?.original && /\.(jpg|jpeg|png|webp)$/i.test(img.original));
  if (!validImages.length) return null;

  const sorted = validImages.slice(0, 20).sort((a, b) => {
    const aPhoto = a.original?.match(/\.(jpg|jpeg)$/i) ? 1 : 0;
    const bPhoto = b.original?.match(/\.(jpg|jpeg)$/i) ? 1 : 0;
    return bPhoto - aPhoto;
  });

  for (const img of sorted) {
    const w = img.original_width || 0;
    const h = img.original_height || 0;
    if (h / w >= 0.9) return img.original;
  }
  return sorted[0]?.original ?? null;
}

// ----------------- API -----------------
export async function POST(req: NextRequest) {
  try {
    // ---------------- RATE LIMIT ----------------
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const now = Date.now();
    const existing = ipRequests.get(ip);
    if (existing) {
      const timeDiff = now - existing.timestamp;
      if (timeDiff < WINDOW_MS) {
        if (existing.count >= MAX_REQUESTS) {
          return new Response(
            JSON.stringify({ message: LIMIT_MSG }),
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

    // ---------------- INPUT ----------------
    const { topic } = await req.json();
    if (!topic?.trim() || !isValidQuery(topic)) {
      return new Response(
        JSON.stringify({ message: ERROR_MSG }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const serpApiKey = process.env.SERPAPI_API_KEY!;
    const openaiApiKey = process.env.OPENAI_API_KEY!;

    // ---------------- SERPAPI ----------------
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(topic)}&num=20&api_key=${serpApiKey}`
    );
    if (!serpRes.ok) {
      return new Response(
        JSON.stringify({ message: ERROR_MSG }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const serpData = await serpRes.json();
    const organic = serpData.organic_results || [];
    const links = organic.slice(0, 20).map((r: SerpResult) => r.link).filter(Boolean);
    if (!links.length) {
      return new Response(
        JSON.stringify({ message: ERROR_MSG }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ---------------- CANONICAL NAME & STRICT FAME ----------------
    const canonicalResult = await resolveWikipediaCanonical(topic);
    if (!canonicalResult?.famous) {
      return new Response(
        JSON.stringify({ message: ERROR_MSG }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const canonicalName = canonicalResult.canonical;

    // ---------------- GET PORTRAIT ----------------
    let photoUrl = await getWikipediaPhoto(canonicalName);
    if (!photoUrl) {
      photoUrl = selectPortraitFromImages(serpData.images_results || []);
    }
    if (!photoUrl) {
      return new Response(
        JSON.stringify({ message: ERROR_MSG }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ---------------- OPENAI SUMMARY ----------------
    const prompt = `
The user searched for "${topic}" (canonical: "${canonicalName}"). This name may refer to a single real person or fictional character.

Write a 150-250 word summary using ONLY the links below:

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
          { role: 'system', content: 'You summarize single real individuals or fictional characters based on source links.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const openaiData: OpenAIResponse = await openaiRes.json();
    const summary = openaiData.choices?.[0]?.message?.content ?? '';

    return new Response(
      JSON.stringify({ summary, photoUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('API error:', err);
    return new Response(
      JSON.stringify({ message: ERROR_MSG }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}