import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 100;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const ERROR_MSG = "No results.";
const LIMIT_MSG = "Rate limit exceeded. Try again in 2 hours.";

// ---------------- Types ----------------
interface SerpImage {
  original: string;
  original_width?: number;
  original_height?: number;
}

interface SerpResult {
  link: string;
}

interface WikipediaPage {
  original?: { source: string };
  images?: { title: string }[];
}

// ---------------- Validate query ----------------
function isValidQuery(q: string) {
  return /^[a-zA-Z\s'.-]+$/.test(q.trim());
}

// ---------------- Filter portrait images ----------------
function filterPortraitImages(images: SerpImage[]): string[] {
  return images
    .filter(img => img.original && /\.(jpe?g|png|webp)$/i.test(img.original))
    .filter(img => {
      const w = img.original_width || 1;
      const h = img.original_height || 1;
      const ratio = h / w;
      return ratio > 0.6 && ratio < 2; // allow vertical portraits
    })
    .map(img => img.original);
}

// ---------------- Wikipedia portrait ----------------
async function getWikipediaPortrait(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      name
    )}&prop=pageimages|images&format=json&piprop=original`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const pages = Object.values(data.query.pages) as WikipediaPage[];
    const page = pages[0];

    // 1️⃣ Try piprop original first
    if (page?.original?.source) return page.original.source;

    // 2️⃣ Fallback to first valid image from page.images
    if (page.images?.length) {
      for (const img of page.images) {
        if (!img.title) continue;
        const ext = img.title.split('.').pop()?.toLowerCase();
        if (!ext || !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;

        // Convert File: to direct URL
        return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(
          img.title.replace('File:', '')
        )}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ----------------- API ----------------
export async function POST(req: Request) {
  try {
    const { topic } = await req.json();
    if (!topic || !isValidQuery(topic))
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });

    // --- RATE LIMIT ---
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const now = Date.now();
    const existing = ipRequests.get(ip);
    if (existing && now - existing.timestamp < WINDOW_MS && existing.count >= MAX_REQUESTS) {
      return NextResponse.json({ error: LIMIT_MSG }, { status: 429 });
    }
    ipRequests.set(ip, { count: (existing?.count || 0) + 1, timestamp: now });

    // --- SERPAPI SEARCH ---
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(topic)}&num=20&api_key=${process.env.SERPAPI_API_KEY}`
    );
    if (!serpRes.ok) return NextResponse.json({ error: ERROR_MSG }, { status: 502 });

    const serp = await serpRes.json();
    const links: string[] =
      serp.organic_results?.slice(0, 20).map((x: SerpResult) => x.link).filter(Boolean) || [];
    const serpImages = filterPortraitImages(serp.images_results || []);

    if (!links.length) return NextResponse.json({ error: ERROR_MSG }, { status: 404 });

    // --- PICK PHOTO ---
    let photoUrl: string | null = await getWikipediaPortrait(topic);
    if (!photoUrl && serpImages.length) photoUrl = serpImages[0];

    // --- LLM SUMMARY ---
    const prompt = `
Write a concise 150-200 word summary about "${topic}".
Use ONLY the following source links.
Do NOT mention social media, type, or unrelated info.
Return UNKNOWN_PERSON if not a real person or fictional character.

Links:
${links.join('\n')}
`;

    const sumRes = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    let summary = sumRes.choices?.[0]?.message?.content?.trim() || "";
    if (!summary || summary.includes("UNKNOWN_PERSON"))
      summary = `No summary found for "${topic}".`;

    return NextResponse.json({ summary, photoUrl });
  } catch (err) {
    console.error("API ERROR:", err);
    return NextResponse.json({ error: ERROR_MSG }, { status: 500 });
  }
}