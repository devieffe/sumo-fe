'use client';
import React, { useState, useCallback } from 'react';

export default function PersonSummary() {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;

    setLoading(true);
    setSummary('');

    try {
      const response = await fetch('/api/summarize-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmedTopic }),
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Non-OK response:', errorText);
        setSummary(`Error ${response.status}: ${response.statusText}`);
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error('Failed to parse JSON:', jsonErr);
        const text = await response.text();
        setSummary(`Unexpected response: ${text}`);
        return;
      }

      if (data.error) {
        setSummary(`Error: ${data.error}`);
      } else {
        setSummary(data.summary || 'No summary returned.');
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setSummary('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Summarize about</h1>

      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Enter a name (e.g., Ada Lovelace)"
        className="border rounded p-2 w-full mb-3"
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

      {summary && (
        <div className="mt-4 p-4 rounded border whitespace-pre-wrap">
          {summary}
        </div>
      )}
    </div>
  );
}