/* MultiMedia — a Letterboxd-style tracker for movies, TV shows & games.
   Live data from TMDB (movies/TV) and RAWG (games); state in localStorage. */

// ---------------------------------------------------------------------------
// State & storage
// ---------------------------------------------------------------------------
const STORAGE_KEY = "multimedia-v1";
const LEGACY_KEY = "backlogd-v1";

const state = {
  route: { section: "movies", page: "browse" }, // page: browse|vibe|diary, or section:null + page: diary-all|settings
  expanded: { movies: true, tv: false, games: false },
  browse: {
    movies: { query: "", items: null, error: null, seq: 0 },
    tv: { query: "", items: null, error: null, seq: 0 },
    games: { query: "", items: null, error: null, seq: 0 },
  },
  vibe: {
    movies: { answers: [null, null, null], results: null, shown: 12, loading: false, error: null },
    tv: { answers: [null, null, null], results: null, shown: 12, loading: false, error: null },
    games: { answers: [null, null, null], results: null, shown: 12, loading: false, error: null },
  },
  diary: { typeFilter: "all", minRating: 0, sortBy: "date", sortDir: "desc" },
  modal: { itemId: null, rating: 0 },
  data: load(),
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!d.favorites) d.favorites = [];
      return d;
    }
  } catch (e) { /* corrupted storage — fall through */ }

  // Migrate data from the previous version of the site.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      const library = {};
      const lookup = (id) => CATALOG.find((c) => c.id === id) || (old.custom || []).find((c) => c.id === id);
      for (const id of (old.watchlist || [])) { const it = lookup(id); if (it) library[id] = it; }
      for (const e of (old.finished || [])) { const it = lookup(e.id); if (it) library[e.id] = it; }
      return { keys: { tmdb: "", rawg: "" }, watchlist: old.watchlist || [], finished: old.finished || [], favorites: [], library };
    }
  } catch (e) { /* ignore broken legacy data */ }

  return { keys: { tmdb: "", rawg: "" }, watchlist: [], finished: [], favorites: [], library: {} };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

API.keys = state.data.keys;

// ---------------------------------------------------------------------------
// Item lookup — library snapshots, seed catalog, then live result sets
// ---------------------------------------------------------------------------
function findItem(id) {
  if (state.data.library[id]) return state.data.library[id];
  const seed = CATALOG.find((c) => c.id === id);
  if (seed) return seed;
  for (const type of Object.keys(SECTIONS)) {
    const hit = (state.browse[type].items || []).find((i) => i.id === id)
      || (state.vibe[type].results || []).find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

function remember(item) {
  // Snapshot item metadata so watchlist/diary entries survive across sessions.
  state.data.library[item.id] = {
    id: item.id, type: item.type, title: item.title, year: item.year,
    poster: item.poster || null, genres: item.genres || [],
  };
}

function getEntry(id) {
  return state.data.finished.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stars(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function gradient(item) {
  const h = hashCode(item.title);
  const h1 = h % 360, h2 = (h1 + 40 + (h % 60)) % 360;
  return `background:linear-gradient(160deg,hsl(${h1},45%,28%),hsl(${h2},55%,16%))`;
}

function crumbs(parts) {
  return `<div class="crumbs">🗂️ MultiMedia ${parts.map((p) => `<span class="crumb-sep">/</span> ${esc(p)}`).join(" ")}</div>`;
}

// ---------------------------------------------------------------------------
// Sidebar (file-explorer tree)
// ---------------------------------------------------------------------------
const sidebarEl = document.getElementById("sidebar");
const appEl = document.getElementById("app");

const PAGES = [
  { id: "browse", label: "Browse", icon: "🔍" },
  { id: "vibe", label: "Vibe Finder", icon: "✨" },
  { id: "diary", label: "Diary", icon: "📔" },
];

function renderSidebar() {
  const r = state.route;
  sidebarEl.innerHTML = `
    <div class="side-head">🗂️ MultiMedia</div>
    <nav class="tree">
      ${Object.entries(SECTIONS).map(([key, s]) => `
        <div class="tree-folder">
          <button class="folder-row ${r.section === key ? "in-path" : ""}" data-folder="${key}">
            <span class="chevron">${state.expanded[key] ? "▾" : "▸"}</span>
            <span class="folder-icon">${state.expanded[key] ? "📂" : "📁"}</span> ${s.label}
          </button>
          <div class="folder-children ${state.expanded[key] ? "" : "hidden"}">
            ${PAGES.map((p) => `
              <button class="tree-item ${r.section === key && r.page === p.id ? "active" : ""}"
                      data-section="${key}" data-page="${p.id}">
                <span class="tree-guide"></span>${p.icon} ${p.label}
              </button>`).join("")}
          </div>
        </div>`).join("")}
      <div class="tree-sep"></div>
      <button class="tree-item root ${r.page === "favorites" ? "active" : ""}" data-root="favorites">⭐ Favorites</button>
      <button class="tree-item root ${r.page === "diary-all" ? "active" : ""}" data-root="diary-all">🗃️ Diary — everything</button>
      <button class="tree-item root ${r.page === "settings" ? "active" : ""}" data-root="settings">⚙️ Settings</button>
    </nav>
    <div class="side-foot">${countFinished()} logged · ${state.data.watchlist.length} saved</div>`;
}

function countFinished() {
  return state.data.finished.length;
}

sidebarEl.addEventListener("click", (e) => {
  const folder = e.target.closest("[data-folder]");
  if (folder) {
    const key = folder.dataset.folder;
    const opening = !state.expanded[key];
    // Accordion: opening a folder collapses the others.
    for (const k of Object.keys(state.expanded)) state.expanded[k] = false;
    if (opening) {
      state.expanded[key] = true;
      state.route = { section: key, page: "browse" };
    }
    render();
    return;
  }
  const item = e.target.closest("[data-page]");
  if (item) {
    state.route = { section: item.dataset.section, page: item.dataset.page };
    render();
    closeSidebarOnMobile();
    return;
  }
  const root = e.target.closest("[data-root]");
  if (root) {
    state.route = { section: null, page: root.dataset.root };
    render();
    closeSidebarOnMobile();
  }
});

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  sidebarEl.classList.toggle("open");
});

function closeSidebarOnMobile() {
  sidebarEl.classList.remove("open");
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
function cardHTML(item) {
  const entry = getEntry(item.id);
  const inList = state.data.watchlist.includes(item.id);
  const fav = state.data.favorites.includes(item.id);
  const section = SECTIONS[item.type];
  const posterInner = item.poster
    ? `<div class="poster has-img" style="background-image:url('${esc(item.poster)}')">`
    : `<div class="poster" style="${gradient(item)}"><span class="poster-icon">${section.icon}</span><span class="poster-title">${esc(item.title)}</span>`;
  return `
    <article class="card" data-id="${esc(item.id)}">
      ${posterInner}
        ${entry ? `<span class="poster-badge rated">${stars(entry.rating)}</span>` : ""}
        ${inList && !entry ? `<span class="poster-badge listed">＋ ${section.listName}</span>` : ""}
      </div>
      ${item._match !== undefined ? `<span class="match-badge">${item._match}% match</span>` : ""}
      <div class="card-body">
        <h3 class="card-title">${esc(item.title)}</h3>
        <div class="card-meta">
          <span>${item.year || "—"}</span>
          ${item.score ? `<span class="card-score">★ ${esc(item.score)}</span>` : ""}
        </div>
        <div class="card-genres">${(item.genres || []).map(esc).join(" · ")}</div>
        ${item._reasons && item._reasons.length ? `<ul class="card-reasons">${item._reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
        <div class="card-actions">
          <button class="btn btn-small ${inList ? "btn-active" : ""}" data-action="toggle-list">
            ${inList ? "✓ Listed" : `＋ ${section.listName}`}
          </button>
          <button class="btn btn-small ${entry ? "btn-rated" : ""}" data-action="finish">
            ${entry ? `★ ${entry.rating}/5` : "✔ Log it"}
          </button>
          <button class="btn btn-small btn-heart ${fav ? "fav-on" : ""}" data-action="toggle-fav" title="${fav ? "Remove from" : "Add to"} favorites">${fav ? "❤" : "♡"}</button>
        </div>
      </div>
    </article>`;
}

function grid(items) {
  return `<div class="card-grid">${items.map(cardHTML).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
function render() {
  renderSidebar();
  const { section, page } = state.route;
  if (page === "settings") return renderSettings();
  if (page === "favorites") return renderFavorites();
  if (page === "diary-all") return renderDiary(null);
  if (page === "diary") return renderDiary(section);
  if (page === "vibe") return renderVibe(section);
  return renderBrowse(section);
}

// ----- Browse ---------------------------------------------------------------
function renderBrowse(type) {
  const section = SECTIONS[type];
  const b = state.browse[type];
  const listItems = state.data.watchlist
    .map(findItem)
    .filter((it) => it && it.type === type && !getEntry(it.id));

  appEl.innerHTML = `
    <section class="page">
      ${crumbs([section.label, "Browse"])}
      <div class="page-head">
        <h1>${section.icon} ${section.label}</h1>
        ${API.hasKey(type)
          ? `<span class="live-badge">● live — ${type === "games" ? "RAWG" : "TMDB"}</span>`
          : `<span class="live-badge off">○ offline catalog — <a href="#" data-goto="settings">add an API key</a></span>`}
      </div>

      ${listItems.length > 0 ? `
        <div class="panel">
          <h2>📌 Your ${section.listName} <span class="count">${listItems.length}</span></h2>
          ${grid(listItems)}
        </div>` : ""}

      <div class="panel">
        <div class="browse-head">
          <h2>${b.query ? "🔎 Results" : "🔥 Popular right now"}</h2>
          <input type="search" class="search-input" id="browse-search"
                 placeholder="Search ${section.label.toLowerCase()}…" value="${esc(b.query)}" />
        </div>
        <div id="browse-results">${browseResultsHTML(type)}</div>
      </div>
    </section>`;

  if (b.items === null && !b.error) loadBrowse(type);
}

function browseResultsHTML(type) {
  const b = state.browse[type];
  if (b.error) return `<p class="empty error">${esc(b.error)}</p>`;
  if (b.items === null) return `<p class="empty">Loading…</p>`;
  if (b.items.length === 0) return `<p class="empty">No results found.</p>`;
  return grid(b.items);
}

async function loadBrowse(type) {
  const b = state.browse[type];
  const seq = ++b.seq;
  b.error = null;

  if (!API.hasKey(type)) {
    b.items = API.fallbackBrowse(type, b.query);
    paintBrowse(type, seq);
    return;
  }
  try {
    const items = b.query ? await API.search(type, b.query) : await API.popular(type);
    if (seq !== b.seq) return; // a newer request superseded this one
    b.items = items;
  } catch (err) {
    if (seq !== b.seq) return;
    b.items = [];
    b.error = err.message;
  }
  paintBrowse(type, seq);
}

function paintBrowse(type, seq) {
  if (state.route.section !== type || state.route.page !== "browse") return;
  if (seq !== state.browse[type].seq) return;
  const el = document.getElementById("browse-results");
  if (el) el.innerHTML = browseResultsHTML(type);
}

let searchTimer = null;
appEl.addEventListener("input", (e) => {
  if (e.target.id !== "browse-search") return;
  const type = state.route.section;
  state.browse[type].query = e.target.value.trim();
  state.browse[type].items = null;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadBrowse(type), 400);
});

// ----- Vibe finder ------------------------------------------------------------
function renderVibe(type) {
  const section = SECTIONS[type];
  const cfg = VIBE_QUESTIONS[type];
  const v = state.vibe[type];
  const ready = v.answers.every((a) => a !== null);

  appEl.innerHTML = `
    <section class="page">
      ${crumbs([section.label, "Vibe Finder"])}
      <h1 class="vibe-heading">${esc(cfg.heading).replace(/tonight\?$/, "")}<span class="accent">tonight?</span></h1>

      <div class="panel vibe-panel">
        ${cfg.questions.map((q, qi) => `
          <div class="vibe-q">
            <h3>${esc(q.q)}</h3>
            <div class="pill-row">
              ${q.options.map((opt, oi) => `
                <button class="pill ${v.answers[qi] === oi ? "pill-on" : ""}" data-q="${qi}" data-o="${oi}">${esc(opt)}</button>
              `).join("")}
            </div>
          </div>`).join("")}
        <button class="btn btn-find" id="vibe-find" ${ready ? "" : "disabled"}>⚡ ${esc(cfg.button)}</button>
        ${!API.hasKey(type) ? `<p class="panel-hint">Using the built-in catalog — <a href="#" data-goto="settings">add an API key</a> for live results from ${type === "games" ? "RAWG" : "TMDB"}.</p>` : ""}
        ${state.data.finished.length ? `<p class="panel-hint">Learning from ${state.data.finished.length} rating${state.data.finished.length === 1 ? "" : "s"} in your diary.</p>` : `<p class="panel-hint">Tip: rate things in your diary and recommendations will adapt to your taste.</p>`}
      </div>

      <div id="vibe-results">${vibeResultsHTML(type)}</div>
    </section>`;
}

function vibeResultsHTML(type) {
  const v = state.vibe[type];
  if (v.loading) return `<div class="panel"><p class="empty">Finding your ${SECTIONS[type].noun}…</p></div>`;
  if (v.error) return `<div class="panel"><p class="empty error">${esc(v.error)}</p></div>`;
  if (v.results === null) return "";
  if (v.results.length === 0) return `<div class="panel"><p class="empty">Nothing matched — try different answers.</p></div>`;
  const visible = v.results.slice(0, v.shown);
  const remaining = v.results.length - visible.length;
  return `<div class="panel">
    <h2>🎯 Your matches <span class="count">${v.results.length}</span></h2>
    ${grid(visible)}
    ${remaining > 0 ? `<div class="show-more-wrap"><button class="btn" data-action="show-more">Show more (${remaining} left)</button></div>` : ""}
  </div>`;
}

async function runVibeSearch(type) {
  const v = state.vibe[type];
  v.loading = true;
  v.error = null;
  v.results = null;
  v.shown = 12;
  paintVibe(type);
  try {
    v.results = await API.recommend(type, v.answers, {
      finished: state.data.finished,
      watchlist: state.data.watchlist,
      library: state.data.library,
    });
  } catch (err) {
    v.error = err.message;
    v.results = [];
  }
  v.loading = false;
  paintVibe(type);
}

function paintVibe(type) {
  if (state.route.section !== type || state.route.page !== "vibe") return;
  const el = document.getElementById("vibe-results");
  if (el) el.innerHTML = vibeResultsHTML(type);
}

// ----- Diary -----------------------------------------------------------------
function renderDiary(type) {
  const f = state.diary;
  const scopeLabel = type ? SECTIONS[type].label : "Everything";

  let entries = state.data.finished
    .map((e) => ({ entry: e, item: findItem(e.id) }))
    .filter((x) => x.item);

  if (type) entries = entries.filter((x) => x.item.type === type);
  else if (f.typeFilter !== "all") entries = entries.filter((x) => x.item.type === f.typeFilter);
  if (f.minRating > 0) entries = entries.filter((x) => x.entry.rating >= f.minRating);

  const dir = f.sortDir === "asc" ? 1 : -1;
  entries.sort((a, b) => {
    switch (f.sortBy) {
      case "rating": return dir * (a.entry.rating - b.entry.rating);
      case "title":  return dir * a.item.title.localeCompare(b.item.title);
      case "year":   return dir * ((a.item.year || 0) - (b.item.year || 0));
      default:       return dir * a.entry.date.localeCompare(b.entry.date);
    }
  });

  const scoped = type
    ? state.data.finished.filter((e) => { const it = findItem(e.id); return it && it.type === type; })
    : state.data.finished;
  const avg = scoped.length ? (scoped.reduce((s, e) => s + e.rating, 0) / scoped.length).toFixed(1) : "—";

  appEl.innerHTML = `
    <section class="page">
      ${crumbs(type ? [SECTIONS[type].label, "Diary"] : ["Diary"])}
      <div class="page-head">
        <h1>📔 Diary <span class="head-dim">— ${esc(scopeLabel)}</span></h1>
        <span class="diary-stats">${scoped.length} logged · avg ★ ${avg}</span>
      </div>

      <div class="panel filter-bar">
        ${!type ? `
        <label>Type
          <select data-filter="typeFilter">
            <option value="all" ${f.typeFilter === "all" ? "selected" : ""}>Everything</option>
            <option value="movies" ${f.typeFilter === "movies" ? "selected" : ""}>🎬 Movies</option>
            <option value="tv" ${f.typeFilter === "tv" ? "selected" : ""}>📺 TV Shows</option>
            <option value="games" ${f.typeFilter === "games" ? "selected" : ""}>🎮 Games</option>
          </select>
        </label>` : ""}
        <label>Min rating
          <select data-filter="minRating">
            ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${f.minRating === n ? "selected" : ""}>${n === 0 ? "Any" : "★".repeat(n) + "+"}</option>`).join("")}
          </select>
        </label>
        <label>Sort by
          <select data-filter="sortBy">
            <option value="date" ${f.sortBy === "date" ? "selected" : ""}>Date finished</option>
            <option value="rating" ${f.sortBy === "rating" ? "selected" : ""}>Rating</option>
            <option value="title" ${f.sortBy === "title" ? "selected" : ""}>Title</option>
            <option value="year" ${f.sortBy === "year" ? "selected" : ""}>Release year</option>
          </select>
        </label>
        <button class="btn btn-small" data-action="toggle-dir">${f.sortDir === "desc" ? "↓ Desc" : "↑ Asc"}</button>
      </div>

      ${entries.length === 0
        ? `<div class="panel"><p class="empty">${scoped.length === 0
            ? "Nothing logged here yet. Mark something as finished to start your diary."
            : "No entries match these filters."}</p></div>`
        : `<div class="diary-list">
            ${entries.map(({ entry, item }) => `
              <article class="diary-row" data-id="${esc(item.id)}">
                <div class="diary-poster" style="${item.poster ? `background-image:url('${esc(item.poster)}')` : gradient(item)}">${item.poster ? "" : SECTIONS[item.type].icon}</div>
                <div class="diary-info">
                  <h3>${esc(item.title)} <span class="diary-year">${item.year || ""}</span>${entryTags(entry, item)}</h3>
                  <p class="diary-sub">${SECTIONS[item.type].icon} ${entryVerb(entry, item)} ${esc(entry.date)}${item.genres && item.genres.length ? " · " + item.genres.map(esc).join(", ") : ""}</p>
                  ${entry.note ? `<p class="diary-note">"${esc(entry.note)}"</p>` : ""}
                </div>
                <div class="diary-rating">${stars(entry.rating)}</div>
                <button class="btn btn-small btn-heart ${state.data.favorites.includes(item.id) ? "fav-on" : ""}" data-action="toggle-fav">${state.data.favorites.includes(item.id) ? "❤" : "♡"}</button>
                <button class="btn btn-small" data-action="finish">✎ Edit</button>
              </article>`).join("")}
          </div>`}
    </section>`;
}

// ----- Favorites ----------------------------------------------------------------
function renderFavorites() {
  const favs = state.data.favorites.map(findItem).filter(Boolean);
  const groups = Object.entries(SECTIONS)
    .map(([key, s]) => ({ key, s, items: favs.filter((it) => it.type === key) }))
    .filter((g) => g.items.length > 0);

  appEl.innerHTML = `
    <section class="page">
      ${crumbs(["Favorites"])}
      <div class="page-head">
        <h1>⭐ Favorites</h1>
        <span class="diary-stats">${favs.length} favorite${favs.length === 1 ? "" : "s"}</span>
      </div>
      ${favs.length === 0
        ? `<div class="panel"><p class="empty">No favorites yet — tap the ♡ on anything you love and it'll live here.</p></div>`
        : groups.map((g) => `
          <div class="panel">
            <h2>${g.s.icon} ${g.s.label} <span class="count">${g.items.length}</span></h2>
            ${grid(g.items)}
          </div>`).join("")}
    </section>`;
}

// Status tags shown next to a diary entry's title.
function entryTags(entry, item) {
  const tags = [];
  if (item.type === "tv") {
    if (entry.showDone) tags.push(`<span class="tag tag-done">✓ Finished${entry.seasons ? ` · ${entry.seasons} season${entry.seasons === 1 ? "" : "s"}` : ""}</span>`);
    else tags.push(`<span class="tag tag-progress">▶ ${entry.seasons ? `${entry.seasons} season${entry.seasons === 1 ? "" : "s"} in` : "Watching"}</span>`);
  }
  if (item.type === "games") {
    if (entry.mode === "competitive") tags.push(`<span class="tag tag-comp">⚔️ ${entry.rank ? esc(entry.rank) + " · " : ""}~${esc(entry.hours || "?")}h</span>`);
    else tags.push(`<span class="tag tag-done">✓ Finished</span>`);
  }
  return tags.join("");
}

function entryVerb(entry, item) {
  if (item.type === "tv" && !entry.showDone) return "Last logged";
  if (item.type === "games" && entry.mode === "competitive") return "Logged";
  return `${SECTIONS[item.type].verb} on`;
}

// ----- Settings ----------------------------------------------------------------
function renderSettings() {
  appEl.innerHTML = `
    <section class="page">
      ${crumbs(["Settings"])}
      <h1>⚙️ Settings</h1>

      <div class="panel">
        <h2>🔌 Database connections</h2>
        <p class="panel-hint">
          MultiMedia pulls live data from free public databases. Both keys are free —
          paste them below and they're stored only in your browser.
        </p>
        <label class="field">
          <span>TMDB API key <em>(movies & TV shows)</em> — <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">get one here</a></span>
          <input type="text" id="key-tmdb" placeholder="v3 key or v4 read access token" value="${esc(state.data.keys.tmdb)}" />
        </label>
        <label class="field">
          <span>RAWG API key <em>(games)</em> — <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">get one here</a></span>
          <input type="text" id="key-rawg" placeholder="RAWG API key" value="${esc(state.data.keys.rawg)}" />
        </label>
        <div class="modal-actions">
          <span class="save-note" id="keys-saved"></span>
          <button class="btn btn-primary" id="save-keys">Save keys</button>
        </div>
      </div>

      <div class="panel">
        <h2>ℹ️ About your data</h2>
        <p class="panel-hint">
          Your diary, ratings, watchlists and keys live in this browser's localStorage.
          Until a key is added, each section uses a small built-in catalog so everything still works.
        </p>
      </div>
    </section>`;

  document.getElementById("save-keys").addEventListener("click", () => {
    state.data.keys.tmdb = document.getElementById("key-tmdb").value.trim();
    state.data.keys.rawg = document.getElementById("key-rawg").value.trim();
    API.keys = state.data.keys;
    save();
    // Clear caches so Browse refetches with the new keys.
    for (const t of Object.keys(SECTIONS)) { state.browse[t].items = null; state.browse[t].error = null; }
    document.getElementById("keys-saved").textContent = "Saved ✓";
    renderSidebar();
  });
}

// ---------------------------------------------------------------------------
// Rating modal
// ---------------------------------------------------------------------------
const ratingModal = document.getElementById("rating-modal");
const starLabels = ["Tap a star to rate", "★ Awful", "★★ Meh", "★★★ Decent", "★★★★ Great", "★★★★★ Masterpiece"];

function openRatingModal(itemId) {
  const item = findItem(itemId);
  if (!item) return;
  const entry = getEntry(itemId);
  state.modal.itemId = itemId;
  state.modal.rating = entry ? entry.rating : 0;

  document.getElementById("modal-title").textContent = entry ? "Edit your log" : `Log as ${SECTIONS[item.type].verb.toLowerCase()}`;
  document.getElementById("modal-item-title").textContent = `${item.title}${item.year ? ` (${item.year})` : ""}`;
  document.getElementById("finish-date").value = entry ? entry.date : new Date().toISOString().slice(0, 10);
  document.getElementById("finish-note").value = entry ? entry.note || "" : "";
  document.getElementById("modal-delete").classList.toggle("hidden", !entry);

  // Type-specific fields
  document.getElementById("tv-fields").classList.toggle("hidden", item.type !== "tv");
  document.getElementById("game-fields").classList.toggle("hidden", item.type !== "games");
  if (item.type === "tv") {
    document.getElementById("seasons-watched").value = entry && entry.seasons ? entry.seasons : "";
    document.getElementById("show-status").value = entry && !entry.showDone ? "watching" : "finished";
  }
  if (item.type === "games") {
    const comp = entry && entry.mode === "competitive";
    document.getElementById("game-mode").value = comp ? "competitive" : "story";
    document.getElementById("game-rank").value = comp ? entry.rank || "" : "";
    document.getElementById("game-hours").value = comp && entry.hours ? entry.hours : "10";
    syncGameFields();
  }
  document.getElementById("finish-date-label").textContent =
    item.type === "tv" ? "Date" : item.type === "games" ? "Date" : "Date finished";

  paintStars();
  ratingModal.classList.remove("hidden");
}

function syncGameFields() {
  const comp = document.getElementById("game-mode").value === "competitive";
  document.getElementById("comp-fields").classList.toggle("hidden", !comp);
}
document.getElementById("game-mode").addEventListener("change", syncGameFields);

function paintStars() {
  document.querySelectorAll("#star-picker button").forEach((b) =>
    b.classList.toggle("lit", Number(b.dataset.star) <= state.modal.rating)
  );
  document.getElementById("star-label").textContent = starLabels[state.modal.rating];
  document.getElementById("modal-save").disabled = state.modal.rating === 0;
}

function closeRatingModal() {
  ratingModal.classList.add("hidden");
  state.modal.itemId = null;
  state.modal.rating = 0;
}

document.getElementById("star-picker").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-star]");
  if (!btn) return;
  state.modal.rating = Number(btn.dataset.star);
  paintStars();
});

document.getElementById("modal-save").addEventListener("click", () => {
  const id = state.modal.itemId;
  if (!id || state.modal.rating === 0) return;
  const item = findItem(id);
  if (item) remember(item);
  const date = document.getElementById("finish-date").value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById("finish-note").value.trim();

  const entry = { id, rating: state.modal.rating, date, note };
  if (item && item.type === "tv") {
    entry.seasons = Math.max(0, Number(document.getElementById("seasons-watched").value) || 0);
    entry.showDone = document.getElementById("show-status").value === "finished";
  }
  if (item && item.type === "games" && document.getElementById("game-mode").value === "competitive") {
    entry.mode = "competitive";
    entry.rank = document.getElementById("game-rank").value.trim();
    entry.hours = document.getElementById("game-hours").value;
  }

  state.data.finished = state.data.finished.filter((e) => e.id !== id);
  state.data.finished.push(entry);
  // Finishing something takes it off the watchlist.
  state.data.watchlist = state.data.watchlist.filter((w) => w !== id);
  save();
  closeRatingModal();
  render();
});

document.getElementById("modal-delete").addEventListener("click", () => {
  state.data.finished = state.data.finished.filter((e) => e.id !== state.modal.itemId);
  save();
  closeRatingModal();
  render();
});

document.getElementById("modal-close").addEventListener("click", closeRatingModal);
ratingModal.addEventListener("click", (e) => { if (e.target === ratingModal) closeRatingModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRatingModal(); });

// ---------------------------------------------------------------------------
// Main content event handling
// ---------------------------------------------------------------------------
appEl.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) {
    e.preventDefault();
    state.route = { section: null, page: goto.dataset.goto };
    render();
    return;
  }

  const pill = e.target.closest(".pill[data-q]");
  if (pill) {
    const type = state.route.section;
    state.vibe[type].answers[Number(pill.dataset.q)] = Number(pill.dataset.o);
    renderVibe(type);
    return;
  }

  if (e.target.closest("#vibe-find")) {
    runVibeSearch(state.route.section);
    return;
  }

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const card = actionEl.closest("[data-id]");
  const id = card ? card.dataset.id : null;

  switch (action) {
    case "toggle-list": {
      const item = findItem(id);
      if (!item) break;
      if (state.data.watchlist.includes(id)) {
        state.data.watchlist = state.data.watchlist.filter((w) => w !== id);
      } else {
        state.data.watchlist.push(id);
        remember(item);
      }
      save();
      render();
      break;
    }
    case "finish":
      openRatingModal(id);
      break;
    case "toggle-fav": {
      const item = findItem(id);
      if (!item) break;
      if (state.data.favorites.includes(id)) {
        state.data.favorites = state.data.favorites.filter((f) => f !== id);
      } else {
        state.data.favorites.push(id);
        remember(item);
      }
      save();
      render();
      break;
    }
    case "toggle-dir":
      state.diary.sortDir = state.diary.sortDir === "desc" ? "asc" : "desc";
      render();
      break;
    case "show-more": {
      const type = state.route.section;
      state.vibe[type].shown += 12;
      paintVibe(type);
      break;
    }
  }
});

appEl.addEventListener("change", (e) => {
  const filter = e.target.dataset.filter;
  if (!filter) return;
  const val = e.target.value;
  state.diary[filter] = filter === "minRating" ? Number(val) : val;
  render();
});

// ---------------------------------------------------------------------------
render();
