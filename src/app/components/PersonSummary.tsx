'use client';

import React, { useState, useCallback } from 'react';

interface SummaryResponse {
  summary: string;
  photoUrl?: string | null;
  error?: string;
}

export default function PersonSummary() {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!topic.trim()) return;

    setLoading(true);
    setSummary('');
    setPhotoUrl(null);

    try {
      const res = await fetch('/api/summarize-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      const data: SummaryResponse = await res.json();

      if (data.error) {
        setSummary(`Error: ${data.error}`);
      } else {
        setSummary(data.summary || 'No summary returned.');
        setPhotoUrl(data.photoUrl ?? null);
      }
    } catch {
      setSummary('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  if (!hydrated) return null;

  return (
    <div className="summ">
      <div className="search-form">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a name (e.g., Ada Lovelace)"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          maxLength={35}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !topic.trim()}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {summary && (
        <div className="info-container">
          {photoUrl && (
            <figure>
              <img src={photoUrl} alt="Photo" />
            </figure>
          )}
          <div className="whitespace-pre-wrap">{summary}</div>
        </div>
      )}
    </div>
  );
}