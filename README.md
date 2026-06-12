# 🎬📺🎮 Backlogd

A Letterboxd-style tracker for **movies, TV shows, and video games** — three divided sections that all share the same features:

- ✨ **Vibe finder** — pick your current mood (cozy, adrenaline rush, mind-bending, spine-chilling…) and get matching recommendations, ranked by how many of your selected vibes they hit.
- ⭐ **Log finished media** — rate anything you've watched or played from 1 to 5 stars, with a finish date and optional notes.
- 📌 **Watchlist / Playlist** — save things you want to watch (movies & TV) or play (games) for later. Logging something as finished automatically clears it off the list.
- 📔 **Diary** — every finished entry in one place, filterable by media type, minimum rating, and vibe, and sortable by date finished, rating, title, or release year (ascending or descending).
- ➕ **Add your own titles** — anything not in the built-in catalog can be added with its own genres and vibe tags.

## Running it

No build step, no dependencies — it's pure HTML/CSS/JS. Either:

- Open `index.html` directly in a browser, or
- Serve the folder: `python3 -m http.server 8000` then visit http://localhost:8000

All your data (ratings, diary, watchlists, custom titles) is stored in your browser's `localStorage`.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Page shell, nav, and the rating / add-title modals |
| `styles.css` | Dark Letterboxd-inspired theme |
| `data.js` | Vibe taxonomy + seeded catalog (18 titles per section) |
| `app.js` | State, rendering, vibe matching, diary filters, localStorage persistence |
