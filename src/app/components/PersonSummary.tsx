'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';

interface PersonSummaryResponse {
  summary: string;
  photoUrl?: string;
  photoCaption?: string;
}

interface SummaryResponse {
  summary: string;
  photoUrl?: string | null;
  photoUncertain?: boolean;
  error?: string;
}

export default function PersonSummary() {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
<<<<<<< HEAD
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUncertain, setPhotoUncertain] = useState(false);
=======
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [photoCaption, setPhotoCaption] = useState<string | undefined>();
>>>>>>> photo-caption-update
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setLoading(true);
    setSummary('');
<<<<<<< HEAD
    setPhotoUrl(null);
    setPhotoUncertain(false);
=======
    setPhotoUrl(undefined);
    setPhotoCaption(undefined);
>>>>>>> photo-caption-update

    try {
      const response = await fetch('/api/summarize-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed }),
      });

      if (!response.ok) {
<<<<<<< HEAD
        const text = await response.text();
        setSummary(`Error ${response.status}: ${response.statusText}`);
        return;
      }

      let data: SummaryResponse;
      try {
        data = await response.json();
      } catch {
=======
>>>>>>> photo-caption-update
        const text = await response.text();
        setSummary(`Error ${response.status}: ${response.statusText}\n${text}`);
        return;
      }

<<<<<<< HEAD
      if (data.error) {
        setSummary(`Error: ${data.error}`);
        return;
      }

      setSummary(data.summary || 'No summary returned.');
      setPhotoUrl(data.photoUrl ?? null);
      setPhotoUncertain(Boolean(data.photoUncertain));
    } catch (err) {
=======
      const data: PersonSummaryResponse = await response.json();

      setSummary(data.summary || 'No summary returned.');
      setPhotoUrl(data.photoUrl);
      setPhotoCaption(data.photoCaption);
    } catch {
>>>>>>> photo-caption-update
      setSummary('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      {/* Title */}
      <h1 className="text-2xl font-bold">Summarize about</h1>

<<<<<<< HEAD
      {/* Input + Button on same line */}
      <div className="flex gap-3">
=======
      <div className="flex gap-2 mb-3">
>>>>>>> photo-caption-update
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a name (e.g., Ada Lovelace)"
<<<<<<< HEAD
          className="flex-1 border rounded p-2"
=======
          className="border rounded p-2 flex-1"
>>>>>>> photo-caption-update
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          maxLength={35}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !topic.trim()}
<<<<<<< HEAD
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded w-32 flex-shrink-0"
=======
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50"
>>>>>>> photo-caption-update
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Summary with left-aligned photo as <figure> */}
      {summary && (
<<<<<<< HEAD
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
=======
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
>>>>>>> photo-caption-update
        </div>
      )}
    </div>
  );
}