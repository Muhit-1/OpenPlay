# 🎬 OpenPlay

> A modern, open-source ISP open-directory browser and media streaming frontend.

OpenPlay lets you browse and stream video files directly from any HTTP open-directory server (such as ISP LAN file servers) — with TMDB metadata enrichment, Firebase-powered watch progress, and a polished Netflix-style UI.

---

## 📸 Screenshots

<table>
  <tr>
    <td><img src="https://i.ibb.co.com/m53RmZ8c/Screenshot-2026-06-17-044630.png" alt="Home Page" width="100%"/></td>
    <td><img src="https://i.ibb.co.com/Q79v6fMR/Screenshot-2026-06-17-044653.png" alt="Trending Row" width="100%"/></td>
  </tr>
  <tr>
    <td><img src="https://i.ibb.co.com/JWmNTvJm/Screenshot-2026-06-17-044716.png" alt="Browse / Catalog" width="100%"/></td>
    <td><img src="https://i.ibb.co.com/JbDQKj1/Screenshot-2026-06-17-044748.png" alt="Movie Detail" width="100%"/></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="https://i.ibb.co.com/DHS8kTVv/Screenshot-2026-06-17-044843.png" alt="Video Player" width="50%"/></td>
  </tr>
</table>

---

## ✨ Features

- **ISP Open-Directory Browser** — Point OpenPlay at any HTTP directory listing and it automatically parses folders and video files
- **TMDB Metadata Enrichment** — Automatically fetches posters, ratings, overviews, cast, and genres for every file
- **Smart Folder Resolution** — Single-video folders auto-resolve directly to the video file with full TMDB metadata
- **Custom HTML5 Video Player** — Auto-hiding controls, scrubber hover preview, skip ±10s, volume/speed controls, fullscreen, and keyboard shortcuts
- **Trending This Week** — TMDB weekly trending movies and series displayed on the home page; unmatched titles show a "Not on server" ribbon
- **TMDB Catalog Browser** — Browse by genre, trending, animation, drama, sci-fi, and more with infinite scroll and filters
- **Movie Detail Page** — Full TMDB detail view with auto-search against ISP server for direct playback
- **Episode List** — TV series episode list with TMDB stills, ratings, and runtime per episode
- **Firebase Watch History** — Anonymous authentication; watch progress is saved and resumed across sessions
- **Bookmarks** — Save titles to watch later
- **Search** — Recursive search across your ISP directory
- **Subtitle Support** — Auto-detects `.srt` / `.vtt` subtitle files; SRT is converted to WebVTT on-the-fly
- **Appearance Settings** — 8 accent color themes, 3 card size presets, 9 TMDB metadata language options — all persisted via `localStorage`
- **Multiple Server URLs** — Add additional ISP server IPs in Settings
- **Codec Warnings** — Warns when x265/HEVC or 10-bit files are detected (limited browser support)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Routing | React Router v7 |
| HTTP Client | Native `fetch` |
| Metadata | TMDB API |
| Auth & DB | Firebase (Anonymous Auth + Firestore) |
| Backend API | Vercel Serverless Functions (Node.js) |
| HLS Fallback | Video.js (for `.m3u8` streams only) |
| Dev Server | Express (local proxy for API functions) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20
- A TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))
- A Firebase project (for watch history)

### Installation

```bash
git clone https://github.com/your-username/openplay.git
cd openplay
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```env
TMDB_API_KEY=your_tmdb_api_key_here

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

### Running Locally

You need two terminals — one for the Vite dev server, one for the local API server:

```bash
# Terminal 1: API server (port 3001)
npm run dev:api

# Terminal 2: Vite frontend (port 5173)
npm run dev
```

Or run both concurrently:

```bash
npm run dev:all
```

### Building for Production

```bash
npm run build
```

### Deploying to Vercel

This project is designed for Vercel. Simply connect your repository on [vercel.com](https://vercel.com) and add your environment variables in the Vercel dashboard. The `vercel.json` rewrites handle both API routes and SPA routing automatically.

---

## ⚙️ Configuration

Once running, open the app in your browser and navigate to **Settings** to:

1. **Enter your ISP server URL** — e.g. `http://172.16.50.12/DHAKA-FLIX-12/`
2. **Test the connection** to verify the server is reachable
3. **Add additional server URLs** for multi-server ISP setups
4. **Choose an accent color**, card size, and TMDB metadata language

---

## 📁 Project Structure

```
openplay/
├── api/
│   ├── proxy.js          # CORS proxy for ISP directory fetching
│   ├── parse.js          # HTML directory parser → JSON
│   └── tmdb.js           # TMDB API gateway (search, trending, genre, detail, episodes)
├── src/
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── VideoCard.jsx        # Smart video/folder card with TMDB metadata
│   │   ├── CategoryRow.jsx      # Horizontally scrollable ISP content row
│   │   ├── TmdbRow.jsx          # Horizontally scrollable TMDB content row
│   │   ├── EpisodeList.jsx      # TV season/episode list
│   │   └── SubtitleSelector.jsx
│   ├── pages/
│   │   ├── Home.jsx             # Home page with hero + all rows
│   │   ├── Browse.jsx           # ISP directory browser
│   │   ├── Catalog.jsx          # TMDB genre/trending catalog with filters
│   │   ├── MovieDetail.jsx      # Full TMDB detail + ISP server search
│   │   ├── Player.jsx           # Custom HTML5 video player
│   │   ├── Search.jsx           # Recursive ISP directory search
│   │   ├── Channel.jsx          # Genre/actor/studio channel pages
│   │   └── Settings.jsx         # Server URL + appearance settings
│   └── lib/
│       ├── tmdb.js              # Frontend TMDB helpers + directory fetch
│       └── firebase.js          # Firebase auth + watch history + bookmarks
├── dev-server.js         # Local Express server for API functions
├── vite.config.js
└── vercel.json
```

---

## 🎮 Keyboard Shortcuts (Player)

| Key | Action |
|---|---|
| `Space` / `K` | Play / Pause |
| `→` | Skip forward 10 seconds |
| `←` | Skip backward 10 seconds |
| `↑` | Volume up |
| `↓` | Volume down |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |

---

## ⚠️ Legal Disclaimer & Content Notice

> **IMPORTANT — Please read carefully before using this software.**

### Regarding Third-Party Server Content

**OpenPlay is a frontend browser application only.** It does not host, store, upload, distribute, or transmit any media content. OpenPlay functions purely as a client-side interface that connects to HTTP open-directory servers configured by the user.

**The developer(s) of OpenPlay are NOT responsible for:**

- The content available on any ISP or third-party server that a user connects to
- Any pirated, copyrighted, or otherwise illegal material that may be present on third-party servers
- Any use of this application to access, stream, or distribute unauthorized copyrighted content
- Any legal consequences arising from a user's choice of server or content accessed through this application

**ISP open-directory servers configured by users may contain pirated or copyrighted material. The developer(s) of OpenPlay do not condone, encourage, or support copyright infringement in any form.**

Users are solely responsible for ensuring that any content they access through this application is legally available to them in their jurisdiction.

### Copyright & Intellectual Property

- Metadata, posters, and information displayed in OpenPlay are provided by [The Movie Database (TMDB)](https://www.themoviedb.org). This application uses the TMDB API but is **not endorsed or certified by TMDB**.
- All trademarks, service marks, and trade names referenced in this application are the property of their respective owners.
- This application does not claim ownership of any media, metadata, images, or content fetched from external sources.

### No Warranty

This software is provided **"as is"**, without warranty of any kind, express or implied. The developer(s) shall not be held liable for any damages arising from the use of this software.

### User Responsibility

By using OpenPlay, you agree that:

1. You will only use this application to access content that you are legally authorized to access
2. You understand that the developer(s) have no control over, and no responsibility for, the content available on servers you connect to
3. You assume full legal responsibility for all content you access through this application
4. You comply with all applicable laws in your jurisdiction, including copyright law

---

## 📄 License

This project is open-source. See the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [The Movie Database (TMDB)](https://www.themoviedb.org) for their excellent free API
- [Firebase](https://firebase.google.com) for authentication and Firestore
- [Tailwind CSS](https://tailwindcss.com) for the utility-first styling framework
- [React](https://react.dev) and [Vite](https://vitejs.dev) for the frontend tooling
- [Video.js](https://videojs.com) for HLS stream fallback support