/* Backlogd — a Letterboxd-style tracker for movies, TV shows & games.
   All state lives in localStorage; no backend required. */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const STORAGE_KEY = "backlogd-v1";

const state = {
  view: "movies",            // movies | tv | games | diary
  selectedVibes: {},         // per-section vibe selection: { movies: Set, ... }
  search: {},                // per-section search text
  diary: { typeFilter: "all", minRating: 0, vibeFilter: "all", sortBy: "date", sortDir: "desc" },
  modal: { itemId: null, rating: 0 },
  data: load(),
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted storage — start fresh */ }
  return { watchlist: [], finished: [], custom: [] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function allItems() {
  return CATALOG.concat(state.data.custom);
}

function getItem(id) {
  return allItems().find((it) => it.id === id);
}

function getEntry(id) {
  return state.data.finished.find((e) => e.id === id);
}

function vibeLabel(id) {
  const v = VIBES.find((v) => v.id === id);
  return v ? v.label : id;
}

// ---------------------------------------------------------------------------
// Card visuals — deterministic gradient per title (no poster art needed)
// ---------------------------------------------------------------------------
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function posterStyle(item) {
  const h = hashCode(item.title);
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 60)) % 360;
  return `background: linear-gradient(160deg, hsl(${h1},45%,28%), hsl(${h2},55%,16%))`;
}

function stars(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const app = document.getElementById("app");

function render() {
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.nav === state.view)
  );
  if (state.view === "diary") renderDiary();
  else renderSection(state.view);
}

function cardHTML(item) {
  const entry = getEntry(item.id);
  const inList = state.data.watchlist.includes(item.id);
  const section = SECTIONS[item.type];
  return `
    <article class="card" data-id="${item.id}">
      <div class="poster" style="${posterStyle(item)}">
        <span class="poster-icon">${section.icon}</span>
        <span class="poster-title">${esc(item.title)}</span>
        ${entry ? `<span class="poster-badge rated" title="${section.verb}">${stars(entry.rating)}</span>` : ""}
        ${inList && !entry ? `<span class="poster-badge listed">＋ ${section.listName}</span>` : ""}
      </div>
      <div class="card-meta">
        <span class="card-year">${item.year}</span>
        <span class="card-genres">${item.genres.map(esc).join(" · ")}</span>
      </div>
      <div class="card-vibes">${item.vibes.map((v) => `<span class="mini-vibe">${vibeLabel(v).split(" ")[0]}</span>`).join("")}</div>
      <div class="card-actions">
        <button class="btn btn-small ${inList ? "btn-active" : ""}" data-action="toggle-list" title="${inList ? "Remove from" : "Add to"} ${section.listName.toLowerCase()}">
          ${inList ? "✓ Listed" : `＋ ${section.listName}`}
        </button>
        <button class="btn btn-small ${entry ? "btn-rated" : ""}" data-action="finish" title="${entry ? "Edit your log" : "Mark as finished & rate"}">
          ${entry ? `★ ${entry.rating}/5` : "✔ Finished"}
        </button>
      </div>
    </article>`;
}

function renderSection(type) {
  const section = SECTIONS[type];
  const selected = state.selectedVibes[type] || new Set();
  const query = (state.search[type] || "").toLowerCase();

  const items = allItems().filter((it) => it.type === type);
  const listItems = items.filter((it) => state.data.watchlist.includes(it.id) && !getEntry(it.id));

  // Vibe finder: rank by number of selected vibes matched, hide non-matches.
  let results = items;
  if (selected.size > 0) {
    results = items
      .map((it) => ({ it, score: it.vibes.filter((v) => selected.has(v)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.it.title.localeCompare(b.it.title))
      .map((r) => r.it);
  }
  if (query) {
    results = results.filter(
      (it) => it.title.toLowerCase().includes(query) || it.genres.some((g) => g.toLowerCase().includes(query))
    );
  }

  app.innerHTML = `
    <section class="section-view">
      <div class="section-head">
        <h1>${section.icon} ${section.label}</h1>
        <button class="btn" data-action="open-add">＋ Add your own</button>
      </div>

      <div class="panel vibe-panel">
        <h2>✨ What's your vibe right now?</h2>
        <p class="panel-hint">Pick one or more moods and we'll find something that fits.</p>
        <div class="vibe-chips">
          ${VIBES.map((v) => `<button class="chip ${selected.has(v.id) ? "chip-on" : ""}" data-vibe="${v.id}">${v.label}</button>`).join("")}
        </div>
        ${selected.size > 0 ? `<button class="btn btn-small clear-vibes" data-action="clear-vibes">✕ Clear vibes</button>` : ""}
      </div>

      ${listItems.length > 0 ? `
      <div class="panel">
        <h2>📌 Your ${section.listName} <span class="count">${listItems.length}</span></h2>
        <div class="card-grid">${listItems.map(cardHTML).join("")}</div>
      </div>` : ""}

      <div class="panel">
        <div class="browse-head">
          <h2>${selected.size > 0 ? "🎯 Matching your vibe" : "🗂️ Browse all"} <span class="count">${results.length}</span></h2>
          <input type="search" class="search-input" placeholder="Search ${section.label.toLowerCase()}…" value="${esc(state.search[type] || "")}" data-action="search" />
        </div>
        ${results.length > 0
          ? `<div class="card-grid">${results.map(cardHTML).join("")}</div>`
          : `<p class="empty">Nothing matches — try different vibes or add your own title.</p>`}
      </div>
    </section>`;
}

function renderDiary() {
  const f = state.diary;
  let entries = state.data.finished
    .map((e) => ({ entry: e, item: getItem(e.id) }))
    .filter((x) => x.item);

  if (f.typeFilter !== "all") entries = entries.filter((x) => x.item.type === f.typeFilter);
  if (f.minRating > 0) entries = entries.filter((x) => x.entry.rating >= f.minRating);
  if (f.vibeFilter !== "all") entries = entries.filter((x) => x.item.vibes.includes(f.vibeFilter));

  const dir = f.sortDir === "asc" ? 1 : -1;
  entries.sort((a, b) => {
    switch (f.sortBy) {
      case "rating": return dir * (a.entry.rating - b.entry.rating);
      case "title":  return dir * a.item.title.localeCompare(b.item.title);
      case "year":   return dir * (a.item.year - b.item.year);
      default:       return dir * a.entry.date.localeCompare(b.entry.date); // date finished
    }
  });

  const total = state.data.finished.length;
  const avg = total ? (state.data.finished.reduce((s, e) => s + e.rating, 0) / total).toFixed(1) : "—";

  app.innerHTML = `
    <section class="section-view">
      <div class="section-head">
        <h1>📔 Diary</h1>
        <span class="diary-stats">${total} logged · avg ★ ${avg}</span>
      </div>

      <div class="panel filter-bar">
        <label>Type
          <select data-filter="typeFilter">
            <option value="all" ${f.typeFilter === "all" ? "selected" : ""}>Everything</option>
            <option value="movies" ${f.typeFilter === "movies" ? "selected" : ""}>🎬 Movies</option>
            <option value="tv" ${f.typeFilter === "tv" ? "selected" : ""}>📺 TV Shows</option>
            <option value="games" ${f.typeFilter === "games" ? "selected" : ""}>🎮 Games</option>
          </select>
        </label>
        <label>Min rating
          <select data-filter="minRating">
            ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${f.minRating === n ? "selected" : ""}>${n === 0 ? "Any" : "★".repeat(n) + "+"}</option>`).join("")}
          </select>
        </label>
        <label>Vibe
          <select data-filter="vibeFilter">
            <option value="all" ${f.vibeFilter === "all" ? "selected" : ""}>Any vibe</option>
            ${VIBES.map((v) => `<option value="${v.id}" ${f.vibeFilter === v.id ? "selected" : ""}>${v.label}</option>`).join("")}
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
        <button class="btn btn-small" data-action="toggle-dir" title="Toggle sort direction">${f.sortDir === "desc" ? "↓ Desc" : "↑ Asc"}</button>
      </div>

      ${entries.length === 0
        ? `<div class="panel"><p class="empty">${total === 0
            ? "Your diary is empty. Mark something as finished to start logging!"
            : "No entries match these filters."}</p></div>`
        : `<div class="diary-list">
            ${entries.map(({ entry, item }) => `
              <article class="diary-row" data-id="${item.id}">
                <div class="diary-poster" style="${posterStyle(item)}">${SECTIONS[item.type].icon}</div>
                <div class="diary-info">
                  <h3>${esc(item.title)} <span class="diary-year">${item.year}</span></h3>
                  <p class="diary-sub">${SECTIONS[item.type].verb} on ${entry.date}${item.genres.length ? " · " + item.genres.map(esc).join(", ") : ""}</p>
                  ${entry.note ? `<p class="diary-note">“${esc(entry.note)}”</p>` : ""}
                </div>
                <div class="diary-rating">${stars(entry.rating)}</div>
                <button class="btn btn-small" data-action="finish" title="Edit this entry">✎ Edit</button>
              </article>`).join("")}
          </div>`}
    </section>`;
}

// ---------------------------------------------------------------------------
// Rating modal
// ---------------------------------------------------------------------------
const ratingModal = document.getElementById("rating-modal");
const starLabels = ["Tap a star to rate", "★ Awful", "★★ Meh", "★★★ Decent", "★★★★ Great", "★★★★★ Masterpiece"];

function openRatingModal(itemId) {
  const item = getItem(itemId);
  if (!item) return;
  const entry = getEntry(itemId);
  state.modal.itemId = itemId;
  state.modal.rating = entry ? entry.rating : 0;

  document.getElementById("modal-title").textContent = entry ? "Edit your log" : `Log as ${SECTIONS[item.type].verb.toLowerCase()}`;
  document.getElementById("modal-item-title").textContent = `${item.title} (${item.year})`;
  document.getElementById("finish-date").value = entry ? entry.date : new Date().toISOString().slice(0, 10);
  document.getElementById("finish-note").value = entry ? entry.note || "" : "";
  document.getElementById("modal-delete").classList.toggle("hidden", !entry);
  paintStars();
  ratingModal.classList.remove("hidden");
}

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
  const date = document.getElementById("finish-date").value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById("finish-note").value.trim();

  state.data.finished = state.data.finished.filter((e) => e.id !== id);
  state.data.finished.push({ id, rating: state.modal.rating, date, note });
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

// ---------------------------------------------------------------------------
// Add-custom-title modal
// ---------------------------------------------------------------------------
const addModal = document.getElementById("add-modal");
const addVibesEl = document.getElementById("add-vibes");
let addSelectedVibes = new Set();

function openAddModal() {
  const section = SECTIONS[state.view];
  document.getElementById("add-modal-title").textContent = `Add a ${section.label.replace(/s$/, "").toLowerCase()}`;
  document.getElementById("add-title").value = "";
  document.getElementById("add-year").value = "";
  document.getElementById("add-genres").value = "";
  addSelectedVibes = new Set();
  addVibesEl.innerHTML = VIBES.map((v) => `<button type="button" class="chip" data-vibe="${v.id}">${v.label}</button>`).join("");
  addModal.classList.remove("hidden");
}

addVibesEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-vibe]");
  if (!chip) return;
  const v = chip.dataset.vibe;
  addSelectedVibes.has(v) ? addSelectedVibes.delete(v) : addSelectedVibes.add(v);
  chip.classList.toggle("chip-on", addSelectedVibes.has(v));
});

document.getElementById("add-save").addEventListener("click", () => {
  const title = document.getElementById("add-title").value.trim();
  if (!title) { document.getElementById("add-title").focus(); return; }
  const year = Number(document.getElementById("add-year").value) || new Date().getFullYear();
  const genres = document.getElementById("add-genres").value.split(",").map((g) => g.trim()).filter(Boolean);
  state.data.custom.push({
    id: "c" + Date.now(),
    type: state.view,
    title,
    year,
    genres,
    vibes: [...addSelectedVibes],
  });
  save();
  addModal.classList.add("hidden");
  render();
});

document.getElementById("add-modal-close").addEventListener("click", () => addModal.classList.add("hidden"));

// Close modals on backdrop click / Escape
[ratingModal, addModal].forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); })
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { ratingModal.classList.add("hidden"); addModal.classList.add("hidden"); }
});

// ---------------------------------------------------------------------------
// Global event handling
// ---------------------------------------------------------------------------
document.querySelector(".site-header").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (!nav) return;
  e.preventDefault();
  state.view = nav.dataset.nav;
  render();
});

app.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip[data-vibe]");
  if (chip) {
    const type = state.view;
    if (!state.selectedVibes[type]) state.selectedVibes[type] = new Set();
    const set = state.selectedVibes[type];
    const v = chip.dataset.vibe;
    set.has(v) ? set.delete(v) : set.add(v);
    render();
    return;
  }

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const card = actionEl.closest("[data-id]");
  const id = card ? card.dataset.id : null;

  switch (action) {
    case "toggle-list": {
      if (state.data.watchlist.includes(id)) {
        state.data.watchlist = state.data.watchlist.filter((w) => w !== id);
      } else {
        state.data.watchlist.push(id);
      }
      save();
      render();
      break;
    }
    case "finish":
      openRatingModal(id);
      break;
    case "clear-vibes":
      state.selectedVibes[state.view] = new Set();
      render();
      break;
    case "open-add":
      openAddModal();
      break;
    case "toggle-dir":
      state.diary.sortDir = state.diary.sortDir === "desc" ? "asc" : "desc";
      render();
      break;
  }
});

app.addEventListener("input", (e) => {
  if (e.target.matches("[data-action='search']")) {
    state.search[state.view] = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = app.querySelector("[data-action='search']");
    if (input) { input.focus(); input.setSelectionRange(pos, pos); }
  }
});

app.addEventListener("change", (e) => {
  const filter = e.target.dataset.filter;
  if (!filter) return;
  const val = e.target.value;
  state.diary[filter] = filter === "minRating" ? Number(val) : val;
  render();
});

// ---------------------------------------------------------------------------
render();
