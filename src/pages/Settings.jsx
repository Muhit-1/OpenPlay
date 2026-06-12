// src/pages/Settings.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();

  const [ispUrl,   setIspUrl]   = useState(localStorage.getItem('isp_url') || '');
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState(null);
  const [saved,    setSaved]    = useState(false);

  const handleTest = async () => {
    if (!ispUrl.trim()) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(ispUrl.trim())}`);
      if (res.ok) {
        const text = await res.text();
        const hasLinks = text.includes('<a ');
        setTestMsg(
          hasLinks
            ? { ok: true,  text: 'Server reached successfully — directory listing detected.' }
            : { ok: true,  text: 'Server reached, but no directory links found. It may not be an open directory.' }
        );
      } else {
        setTestMsg({ ok: false, text: `Server returned HTTP ${res.status}. Check the URL.` });
      }
    } catch (err) {
      setTestMsg({ ok: false, text: `Could not connect: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const url = ispUrl.trim().endsWith('/') ? ispUrl.trim() : ispUrl.trim() + '/';
    localStorage.setItem('isp_url', url);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      navigate('/');
    }, 1200);
  };

  const handleClear = () => {
    localStorage.removeItem('isp_url');
    setIspUrl('');
    setTestMsg(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-6 max-w-2xl mx-auto">

      <h1 className="text-white text-3xl font-bold mb-2">Settings</h1>
      <p className="text-zinc-400 mb-10">Connect OpenPlay to your ISP's open directory server.</p>

      {/* ── Server URL ── */}
      <section className="mb-10">
        <label className="block text-zinc-300 text-sm font-semibold mb-2" htmlFor="isp-url">
          Server URL
        </label>
        <p className="text-zinc-500 text-xs mb-3">
          The base URL of your ISP's open HTTP directory — e.g. <code className="text-zinc-400">http://172.16.50.12/</code>
        </p>
        <input
          id="isp-url"
          type="url"
          value={ispUrl}
          onChange={e => { setIspUrl(e.target.value); setTestMsg(null); setSaved(false); }}
          placeholder="http://172.16.50.12/"
          className="w-full bg-zinc-800 text-white text-sm rounded-xl px-4 py-3 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-zinc-600 font-mono"
        />

        {/* Test result */}
        {testMsg && (
          <p className={`mt-3 text-sm rounded-lg px-4 py-2 ${testMsg.ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
            {testMsg.text}
          </p>
        )}

        <div className="flex gap-3 mt-4 flex-wrap">
          <button
            onClick={handleTest}
            disabled={!ispUrl.trim() || testing}
            className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {testing ? (
              <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Testing…</>
            ) : (
              'Test connection'
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={!ispUrl.trim() || saved}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            {saved ? '✓ Saved!' : 'Save & go home'}
          </button>

          {ispUrl && (
            <button
              onClick={handleClear}
              className="text-zinc-500 hover:text-red-400 text-sm transition-colors px-2"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ── Info section ── */}
      <section className="bg-zinc-900 rounded-2xl p-6 space-y-4 text-sm">
        <h2 className="text-white font-semibold text-base">How it works</h2>
        <div className="text-zinc-400 space-y-2">
          <p>OpenPlay is a smart skin over your ISP's open directory. It:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Reads the folder structure from your server URL</li>
            <li>Turns each folder into a browsable category row</li>
            <li>Looks up posters and metadata from TMDB for each video</li>
            <li>Streams video directly from your ISP — no data passes through this server</li>
            <li>Saves your watch progress via Firebase</li>
          </ul>
        </div>
        <p className="text-zinc-500 text-xs">
          Movie/TV metadata provided by{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </section>
    </div>
  );
}