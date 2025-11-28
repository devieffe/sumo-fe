'use client';

import React, { useState, useCallback } from 'react';

interface SummaryResponse {
  summary: string;
  photoUrl?: string | null;
  photoUncertain?: boolean;
  error?: string;
}

export default function PersonSummary() {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUncertain, setPhotoUncertain] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setLoading(true);
    setSummary('');
    setPhotoUrl(null);
    setPhotoUncertain(false);

    try {
      const response = await fetch('/api/summarize-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed }),
      });

      if (!response.ok) {
        const text = await response.text();
        setSummary(`Error ${response.status}: ${response.statusText}`);
        return;
      }

      let data: SummaryResponse;
      try {
        data = await response.json();
      } catch {
        const text = await response.text();
        setSummary(`Unexpected response: ${text}`);
        return;
      }

      if (data.error) {
        setSummary(`Error: ${data.error}`);
        return;
      }

      setSummary(data.summary || 'No summary returned.');
      setPhotoUrl(data.photoUrl ?? null);
      setPhotoUncertain(Boolean(data.photoUncertain));
    } catch (err) {
      setSummary('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      {/* Title */}
      <h1 className="text-2xl font-bold">Summarize about</h1>

      {/* Input + Button on same line */}
      <div className="flex gap-3">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a name (e.g., Ada Lovelace)"
          className="flex-1 border rounded p-2"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          maxLength={35}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !topic.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded w-32 flex-shrink-0"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Summary with left-aligned photo as <figure> */}
      {summary && (
        <div className="mt-4 p-4 rounded border shadow-sm overflow-hidden">
          {photoUrl && (
            <figure className="float-left mr-6 mb-4 text-center">
              <img
                src={photoUrl}
                alt="Subject photo"
                className="w-42 h-42 object-cover rounded border"
              />
              {photoUncertain && (
                <figcaption className="text-xs text-gray-500 mt-1">
                  ⚠️ Photo may not be accurate.
                </figcaption>
              )}
            </figure>
          )}
          <div className="whitespace-pre-wrap">{summary}</div>
        </div>
      )}
    </div>
  );
}