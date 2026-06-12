# 🗂️ MultiMedia

A Letterboxd-style tracker for **movies, TV shows, and video games**, with live data from outside databases and a file-explorer-style sidebar.

## Features

- 📁 **File-browser sidebar** — each section (🎬 Movies, 📺 TV Shows, 🎮 Games) expands like a folder into **Browse**, **Vibe Finder**, and **Diary**.
- 🔌 **Live databases** — Movies & TV are powered by [TMDB](https://www.themoviedb.org/), games by [RAWG](https://rawg.io/). Browse shows what's trending right now, and search covers the entire databases with real poster art.
- ✨ **Vibe Finder** (its own tab) — answer three quick questions (*How much time do you have? Energy level? Tonight's vibe?*) and hit **Find my game / movie / show** for tailored picks.
- ⭐ **Log finished media** — rate 1–5 stars with a finish date and optional notes.
- 📌 **Watchlist / Playlist** — save things for later; logging something as finished clears it off the list automatically.
- 📔 **Diaries** — one per section plus a combined **Diary — everything**, filterable by type and minimum rating, sortable by date finished, rating, title, or release year.

## Setup

The site works out of the box with a small built-in catalog. To unlock live data, add two free API keys under **⚙️ Settings**:

| Database | Used for | Get a key |
|----------|----------|-----------|
| TMDB | Movies & TV shows | https://www.themoviedb.org/settings/api |
| RAWG | Games | https://rawg.io/apidocs |

Keys are stored only in your browser's localStorage, alongside your diary, ratings, and watchlists.

## Running it

No build step, no dependencies — pure HTML/CSS/JS. Either:

- Open `index.html` directly in a browser, or
- Serve the folder: `python3 -m http.server 8000` then visit http://localhost:8000

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Page shell, sidebar mount, rating modal |
| `styles.css` | Dark theme + file-explorer sidebar |
| `data.js` | Section config, vibe questionnaires, fallback catalog |
| `api.js` | TMDB & RAWG clients, vibe-to-query mapping, offline fallbacks |
| `app.js` | Routing, rendering, diary, persistence |
