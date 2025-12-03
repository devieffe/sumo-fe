import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const ERROR_MSG = "No results.";
const ipRequests = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS = 100;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

// --- Validate query ---
function isValidQuery(q: string) {
  return /^[a-zA-Z\s'.-]+$/.test(q.trim());
}

// --- Fetch with timeout ---
async function fetchWithTimeout(url: string, timeout = 3000): Promise<Response | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch {
    return null;
  }
}

// --- Pick first valid image from SERPAPI ---
function pickSerpImage(images: any[]): string | null {
  if (!images?.length) return null;
  const img = images.find((i) => i.original || i.thumbnail);
  return img?.original || img?.thumbnail || null;
}

// --- Generate summary via OpenAI ---
async function generateSummary(topic: string, links: string[]): Promise<string> {
  try {
    const prompt = links.length
      ? `Write a concise 150-200 word summary about "${topic}" using these links if possible:\n${links.join("\n")}`
      : `Write a concise 150-200 word summary about "${topic}".`;

    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });
    return res.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

// --- Main API ---
export async function POST(req: Request) {
  try {
    const { topic } = await req.json();
    if (!topic || !isValidQuery(topic)) {
      return NextResponse.json({ summary: "Invalid query.", photoUrl: null }, { status: 400 });
    }

    // --- RATE LIMIT ---
    const ip = req.headers.get("x-forwarded-for") || "local";
    const now = Date.now();
    const existing = ipRequests.get(ip);
    if (existing && now - existing.timestamp < WINDOW_MS && existing.count >= MAX_REQUESTS) {
      return NextResponse.json({ summary: "Rate limit exceeded.", photoUrl: null }, { status: 429 });
    }
    ipRequests.set(ip, { count: (existing?.count || 0) + 1, timestamp: now });

    // --- SERPAPI search (web + images) ---
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(
      topic
    )}&num=10&tbm=isch&api_key=${process.env.SERPAPI_API_KEY}`;
    const serpRes = await fetchWithTimeout(serpUrl, 5000);
    const serpData = serpRes ? await serpRes.json() : { organic_results: [], images_results: [] };

    const links: string[] = (serpData.organic_results || [])
      .map((x: any) => x.link)
      .filter(Boolean)
      .slice(0, 10);

    // --- Pick photo ---
    let photoUrl: string | null = pickSerpImage(serpData.images_results);

    // --- Fallback Wikipedia image ---
    if (!photoUrl) {
      const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
      const wikiRes = await fetchWithTimeout(wikiUrl, 2000);
      if (wikiRes?.ok) {
        const wikiData = await wikiRes.json();
        photoUrl = wikiData.originalimage?.source || wikiData.thumbnail?.source || null;
      }
    }

    // --- Fallback LinkedIn image ---
    // (Optionally implement LinkedIn image fetch if you have API/access)

    // --- Summary ---
    let summary = await generateSummary(topic, links);
    if (!summary) summary = ERROR_MSG;

    return NextResponse.json({ summary, photoUrl });
  } catch (err) {
    console.error("API ERROR:", err);
    return NextResponse.json({ summary: ERROR_MSG, photoUrl: null }, { status: 500 });
  }
}