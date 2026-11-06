// src/lib/useServerTitle.js
//
// What is known about a title on the server: its TMDB match, and the single
// video inside it when it is a folder holding exactly one. Shared by the poster
// card and the side panel, so both read the same (cached) lookups.

import { useEffect, useState } from 'react';
import { fetchMeta, fetchDirectory } from './tmdb.js';
import { libraryKindFor } from './server.js';

export function useServerTitle(file) {
  const [meta, setMeta] = useState(null);
  const [videoUrl, setVideoUrl] = useState(file.type === 'video' ? file.url : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    (async () => {
      setLoading(true);
      try {
        let lookupName = file.name;

        // A folder holding exactly one video is really just that video.
        if (file.type === 'folder') {
          const data = await fetchDirectory(file.url);
          const videos = data.files.filter(f => f.type === 'video');
          if (live && videos.length === 1) {
            setVideoUrl(videos[0].url);
            lookupName = videos[0].name;
          }
        }

        const m = await fetchMeta(lookupName, libraryKindFor(file.url));
        if (live && m?.found) setMeta(m);
      } catch { /* a title without metadata still works */ }
      finally { if (live) setLoading(false); }
    })();

    return () => { live = false; };
  }, [file.url, file.name, file.type]);

  return { meta, videoUrl, loading };
}
