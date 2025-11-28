'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';

interface PersonSummaryResponse {
  summary: string;
  photoUrl?: string;
  photoCaption?: string;
}

export default function PersonSummary() {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [photoCaption, setPhotoCaption] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;

    setLoading(true);
    setSummary('');
    setPhotoUrl(undefined);
    setPhotoCaption(undefined);

    try {
      const response = await fetch('/api/summarize-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmedTopic }),
      });

      if (!response.ok) {
        const text = await response.text();
        setSummary(`Error ${response.status}: ${response.statusText}\n${text}`);
        return;
      }

      const data: PersonSummaryResponse = await response.json();

      setSummary(data.summary || 'No summary returned.');
      setPhotoUrl(data.photoUrl);
      setPhotoCaption(data.photoCaption);
    } catch {
      setSummary('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Summarize about</h1>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a name (e.g., Ada Lovelace)"
          className="border rounded p-2 flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          maxLength={35}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !topic.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {summary && (
        <div className="mt-4 p-4 rounded border whitespace-pre-wrap">
          {photoUrl && (
            <figure className="float-left mr-4 mb-2 max-w-[120px]">
              <Image
                src={photoUrl}
                alt={photoCaption || 'Photo of the person'}
                width={120}
                height={120}
                className="rounded"
              />
              {photoCaption && (
                <figcaption className="text-xs text-gray-500">{photoCaption}</figcaption>
              )}
            </figure>
          )}
          {summary}
        </div>
      )}
    </div>
  );
}