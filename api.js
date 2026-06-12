/* External database clients (TMDB for movies & TV, RAWG for games) plus the
   recommendation engine behind the Vibe Finder.

   Every function returns items normalized to:
   { id, type, title, year, poster, genres: [names], score: "7.8"|null }
   Recommended items additionally carry _match (0-99) and _reasons ([strings]). */

const API = {
  keys: { tmdb: "", rawg: "" },

  hasKey(type) {
    return type === "games" ? !!this.keys.rawg : !!this.keys.tmdb;
  },

  // ---------------- TMDB ----------------
  TMDB_IMG: "https://image.tmdb.org/t/p/w342",
  TMDB_GENRES: {
    movies: { 28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western" },
    tv: { 10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics", 37: "Western" },
  },

  genreIdByName(type, name) {
    const map = this.TMDB_GENRES[type];
    const target = name.toLowerCase();
    for (const [id, n] of Object.entries(map)) if (n.toLowerCase() === target) return id;
    return null;
  },

  async tmdbFetch(path, params = {}) {
    const key = this.keys.tmdb.trim();
    const url = new URL("https://api.themoviedb.org/3" + path);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("include_adult", "false");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const opts = {};
    if (key.startsWith("eyJ")) {
      // v4 read access token
      opts.headers = { Authorization: "Bearer " + key };
    } else {
      url.searchParams.set("api_key", key);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`TMDB error ${res.status} — check your API key in Settings`);
    return res.json();
  },

  normalizeTmdb(raw, type) {
    const isMovie = type === "movies";
    const date = (isMovie ? raw.release_date : raw.first_air_date) || "";
    return {
      id: `tmdb-${isMovie ? "m" : "t"}-${raw.id}`,
      type,
      title: isMovie ? raw.title : raw.name,
      year: date ? Number(date.slice(0, 4)) : null,
      poster: raw.poster_path ? this.TMDB_IMG + raw.poster_path : null,
      genres: (raw.genre_ids || []).map((g) => this.TMDB_GENRES[type][g]).filter(Boolean).slice(0, 3),
      score: raw.vote_average ? raw.vote_average.toFixed(1) : null,
      genreIds: raw.genre_ids || [],
      voteAvg: raw.vote_average || 0,
      voteCount: raw.vote_count || 0,
      overview: raw.overview || "",
    };
  },

  // Rich detail for the preview page. Returns { overview, facts: [strings] }.
  async details(item) {
    if (!this.hasKey(item.type)) return null;
    if (item.type === "games") {
      const id = item.id.replace("rawg-", "");
      const url = new URL(`https://api.rawg.io/api/games/${id}`);
      url.searchParams.set("key", this.keys.rawg.trim());
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RAWG error ${res.status}`);
      const d = await res.json();
      const facts = [];
      if (d.playtime) facts.push(`⏱️ ~${d.playtime}h average playtime`);
      if (d.metacritic) facts.push(`🏆 Metacritic ${d.metacritic}`);
      if (d.released) facts.push(`📅 Released ${d.released}`);
      if (d.developers && d.developers.length) facts.push(`🛠️ ${d.developers.map((x) => x.name).slice(0, 2).join(", ")}`);
      const overview = (d.description_raw || "").split("\n")[0] || "";
      return { overview, facts };
    }
    const isMovie = item.type === "movies";
    const tmdbId = item.id.replace(isMovie ? "tmdb-m-" : "tmdb-t-", "");
    const d = await this.tmdbFetch(`/${isMovie ? "movie" : "tv"}/${tmdbId}`);
    const facts = [];
    if (isMovie && d.runtime) facts.push(`⏱️ ${d.runtime} min`);
    if (!isMovie && d.number_of_seasons) facts.push(`📺 ${d.number_of_seasons} season${d.number_of_seasons === 1 ? "" : "s"} · ${d.number_of_episodes} episodes`);
    if (d.vote_average) facts.push(`🏆 TMDB ${d.vote_average.toFixed(1)} (${d.vote_count.toLocaleString()} votes)`);
    if (isMovie && d.release_date) facts.push(`📅 Released ${d.release_date}`);
    if (!isMovie && d.status) facts.push(`📡 ${d.status}`);
    return { overview: d.overview || "", facts };
  },

  // ---------------- RAWG ----------------
  async rawgFetch(params = {}) {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", this.keys.rawg.trim());
    url.searchParams.set("page_size", "18");
    url.searchParams.set("exclude_additions", "true");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RAWG error ${res.status} — check your API key in Settings`);
    return res.json();
  },

  normalizeRawg(raw) {
    return {
      id: `rawg-${raw.id}`,
      type: "games",
      title: raw.name,
      year: raw.released ? Number(raw.released.slice(0, 4)) : null,
      poster: raw.background_image || null,
      genres: (raw.genres || []).map((g) => g.name).slice(0, 3),
      score: raw.metacritic ? String(raw.metacritic) : (raw.rating ? raw.rating.toFixed(1) : null),
      playtime: raw.playtime || 0,
      metacritic: raw.metacritic || null,
      rating5: raw.rating || 0,
      ratingsCount: raw.ratings_count || 0,
      tagSlugs: (raw.tags || []).slice(0, 12).map((t) => t.slug),
    };
  },

  // ---------------- Browse: popular & search ----------------
  async popular(type) {
    if (type === "games") {
      const data = await this.rawgFetch({ ordering: "-added" });
      return data.results.map((r) => this.normalizeRawg(r));
    }
    const data = await this.tmdbFetch(`/trending/${type === "movies" ? "movie" : "tv"}/week`);
    return data.results.map((r) => this.normalizeTmdb(r, type));
  },

  async search(type, query) {
    if (type === "games") {
      const data = await this.rawgFetch({ search: query, search_precise: "true" });
      return data.results.map((r) => this.normalizeRawg(r));
    }
    const data = await this.tmdbFetch(`/search/${type === "movies" ? "movie" : "tv"}`, { query });
    return data.results.map((r) => this.normalizeTmdb(r, type));
  },

  fallbackBrowse(type, query) {
    let items = CATALOG.filter((it) => it.type === type);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((it) => it.title.toLowerCase().includes(q) || it.genres.some((g) => g.toLowerCase().includes(q)));
    }
    return items;
  },

  // =========================================================================
  // Recommendation engine
  // =========================================================================
  // Mood targets per section, indexed by the third questionnaire answer.
  MOODS: {
    movies: [
      { ids: [35], soft: [10751, 16], label: "comedy" },
      { ids: [18, 10749], soft: [10402, 36], label: "emotional" },
      { ids: [53, 27, 9648, 28], soft: [80, 878], label: "thriller" },
      { ids: [878, 9648], soft: [18, 14, 53], label: "thought-provoking" },
      { ids: [10751, 16, 35], soft: [12, 14], label: "comfort" },
    ],
    tv: [
      { ids: [35], soft: [10751, 16], label: "comedy" },
      { ids: [18], soft: [10766, 10765], label: "drama" },
      { ids: [80, 9648], soft: [18, 10768], label: "dark" },
      { ids: [10765], soft: [10759, 16], label: "sci-fi & fantasy" },
      { ids: [10764, 35, 10751], soft: [16, 10767], label: "easy watch" },
    ],
    games: [
      { slugs: "shooter,sports,racing,fighting", tags: null, names: ["shooter", "sports", "racing", "fighting", "massively multiplayer"], tagHits: ["multiplayer", "pvp", "competitive"], label: "competitive" },
      { slugs: "role-playing-games-rpg,adventure", tags: "story-rich", names: ["rpg", "adventure"], tagHits: ["story-rich", "singleplayer", "atmospheric"], label: "story-driven" },
      { slugs: "casual,simulation,puzzle,indie", tags: null, names: ["casual", "simulation", "puzzle", "indie", "family"], tagHits: ["relaxing", "cute", "exploration"], label: "cozy" },
      { slugs: null, tags: "co-op", names: ["family"], tagHits: ["co-op", "multiplayer", "local-co-op", "online-co-op"], label: "co-op" },
    ],
  },

  // Shrunk average: pulls scores with few votes toward the global mean so an
  // obscure 9.5 with 12 votes can't outrank a 8.2 with 40k votes.
  bayes(avg, n, mean, weight) {
    return (n / (n + weight)) * avg + (weight / (n + weight)) * mean;
  },

  // Genre-affinity profile learned from the user's diary.
  // Returns { affinities: Map<genreLower, -1..1>, liked: [{title, rating, genres}] }
  tasteProfile(ctx) {
    const acc = new Map(); // genre -> { sum, n }
    const liked = [];
    for (const entry of ctx.finished) {
      const item = ctx.library[entry.id] || CATALOG.find((c) => c.id === entry.id);
      if (!item || !item.genres) continue;
      const w = (entry.rating - 3) / 2; // 1★ → -1 … 5★ → +1
      for (const g of item.genres) {
        const k = g.toLowerCase();
        const a = acc.get(k) || { sum: 0, n: 0 };
        a.sum += w; a.n += 1;
        acc.set(k, a);
      }
      if (entry.rating >= 4) liked.push({ title: item.title, rating: entry.rating, genres: item.genres.map((g) => g.toLowerCase()) });
    }
    const affinities = new Map();
    for (const [k, a] of acc) affinities.set(k, a.sum / (a.n + 1)); // shrink toward 0
    return { affinities, liked };
  },

  tasteScore(item, profile) {
    const gs = (item.genres || []).map((g) => g.toLowerCase()).filter((g) => profile.affinities.has(g));
    if (gs.length === 0) return 0;
    return gs.reduce((s, g) => s + profile.affinities.get(g), 0) / gs.length; // -1..1
  },

  likedAnchor(item, profile) {
    // The user's highest-rated diary entry sharing a genre with this item.
    const gs = new Set((item.genres || []).map((g) => g.toLowerCase()));
    let best = null;
    for (const l of profile.liked) {
      if (l.genres.some((g) => gs.has(g)) && (!best || l.rating > best.rating)) best = l;
    }
    return best;
  },

  // ---- Candidate generation: several parallel queries, merged & deduped ----
  async gatherTmdb(type, answers, profile) {
    const [time, energy, mood] = answers;
    const m = this.MOODS[type][mood] || this.MOODS[type][0];
    const g = m.ids.join("|");
    const base = { with_genres: g };
    if (type === "movies") {
      if (time === 0) base["with_runtime.lte"] = "100";
      if (time === 1) base["with_runtime.lte"] = "135";
    } else {
      if (time === 0) base["with_runtime.lte"] = "35";
      if (time === 1) base["with_runtime.lte"] = "65";
    }

    const queries = [
      { ...base, sort_by: "popularity.desc", "vote_count.gte": "300" },
      { ...base, sort_by: "popularity.desc", "vote_count.gte": "300", page: "2" },
      { ...base, sort_by: "vote_average.desc", "vote_count.gte": "1000" },
      // Hidden gems: well-rated but not blockbuster-famous.
      { ...base, sort_by: "vote_average.desc", "vote_count.gte": "150", "vote_count.lte": "1500" },
    ];
    if (energy === 2) for (const q of queries) q["vote_average.gte"] = "7";

    // One query steered purely by the user's strongest genre affinity.
    let topGenre = null, topVal = 0.15;
    for (const [name, val] of profile.affinities) {
      const id = this.genreIdByName(type, name);
      if (id && val > topVal) { topVal = val; topGenre = id; }
    }
    if (topGenre) queries.push({ ...base, with_genres: String(topGenre), sort_by: "vote_average.desc", "vote_count.gte": "500" });

    const path = `/discover/${type === "movies" ? "movie" : "tv"}`;
    const settled = await Promise.allSettled(queries.map((q) => this.tmdbFetch(path, q)));
    const out = new Map();
    let firstError = null;
    for (const s of settled) {
      if (s.status === "rejected") { firstError = firstError || s.reason; continue; }
      for (const raw of s.value.results || []) {
        const it = this.normalizeTmdb(raw, type);
        if (!out.has(it.id)) out.set(it.id, it);
      }
    }
    if (out.size === 0 && firstError) throw firstError;
    return [...out.values()];
  },

  async gatherRawg(answers) {
    const [time, energy, mood] = answers;
    const m = this.MOODS.games[mood] || this.MOODS.games[0];
    const base = {};
    if (m.slugs) base.genres = m.slugs;
    if (m.tags) base.tags = m.tags;

    const yr = new Date().getFullYear();
    const queries = [
      { ...base, ordering: "-added" },
      { ...base, ordering: "-metacritic" },
      { ...base, ordering: "-rating", dates: `${yr - 4}-01-01,${yr}-12-31` },
      { ...base, metacritic: "78,97", ordering: "-rating" },
    ];
    if (energy === 2) queries.push({ ...base, tags: base.tags ? base.tags + ",difficult" : "difficult", ordering: "-rating" });
    if (energy === 0 && !base.genres) queries.push({ genres: "casual,indie,puzzle", ordering: "-added" });

    const settled = await Promise.allSettled(queries.map((q) => this.rawgFetch(q)));
    const out = new Map();
    let firstError = null;
    for (const s of settled) {
      if (s.status === "rejected") { firstError = firstError || s.reason; continue; }
      for (const raw of s.value.results || []) {
        const it = this.normalizeRawg(raw);
        if (!out.has(it.id)) out.set(it.id, it);
      }
    }
    if (out.size === 0 && firstError) throw firstError;
    return [...out.values()];
  },

  // ---- Per-candidate factor scores, all 0..1 ----
  moodFit(item, type, mood) {
    if (item._vibeHits !== undefined) return Math.min(1, item._vibeHits * 0.5); // offline catalog
    if (type === "games") {
      const m = this.MOODS.games[mood] || this.MOODS.games[0];
      const names = (item.genres || []).map((g) => g.toLowerCase());
      const gHits = names.filter((n) => m.names.includes(n)).length;
      const tHits = (item.tagSlugs || []).filter((t) => m.tagHits.includes(t)).length;
      return Math.min(1, gHits * 0.45 + Math.min(tHits, 2) * 0.35);
    }
    const m = this.MOODS[type][mood] || this.MOODS[type][0];
    const ids = item.genreIds || [];
    const hard = ids.filter((g) => m.ids.includes(g)).length;
    const soft = ids.filter((g) => m.soft.includes(g)).length;
    return Math.min(1, hard * 0.55 + soft * 0.22);
  },

  qualityScore(item) {
    if (item.type === "games") {
      if (item.metacritic) return item.metacritic / 100;
      if (item.rating5) return this.bayes(item.rating5 * 2, item.ratingsCount || 0, 6.5, 300) / 10;
      return 0.55;
    }
    if (!item.voteCount) return 0.55;
    return this.bayes(item.voteAvg, item.voteCount, 6.7, 400) / 10;
  },

  timeFit(item, type, time) {
    if (type !== "games") return 1; // handled by the runtime filter in the query
    const t = item.playtime || 0;
    if (!t) return 0.5; // unknown
    if (time === 0) return t <= 8 ? 1 : Math.max(0, 1 - (t - 8) / 30);
    if (time === 2) return t >= 25 ? 1 : t / 25;
    return t >= 5 && t <= 45 ? 1 : 0.6;
  },

  // ---- Final ranking ----
  rankCandidates(items, type, answers, ctx, profile) {
    const [time, energy, mood] = answers;
    const finishedIds = new Set(ctx.finished.map((e) => e.id));
    const watchlist = new Set(ctx.watchlist);
    const moodLabel = (type === "games" ? this.MOODS.games[mood] : this.MOODS[type][mood])?.label || "mood";

    const w = energy === 2
      ? { mood: 0.28, quality: 0.34, taste: 0.20, time: 0.10 }
      : { mood: 0.32, quality: 0.26, taste: 0.24, time: 0.10 };

    const scored = [];
    for (const item of items) {
      if (finishedIds.has(item.id)) continue; // never recommend what's already logged
      const mf = this.moodFit(item, type, mood);
      const qf = this.qualityScore(item);
      const tasteRaw = this.tasteScore(item, profile);
      const tf = this.timeFit(item, type, time);
      const listed = watchlist.has(item.id);

      let score = w.mood * mf + w.quality * qf + w.taste * ((tasteRaw + 1) / 2) + w.time * tf;
      if (listed) score += 0.12;
      // tiny popularity tiebreak so well-known items win exact ties
      score += 0.02 * Math.min(1, Math.log10(1 + (item.voteCount || item.ratingsCount || 0)) / 5);

      const reasons = [];
      if (listed) reasons.push(`📌 Already on your ${SECTIONS[type].listName.toLowerCase()}`);
      if (mf >= 0.55) reasons.push(`🎯 Strong ${moodLabel} match`);
      if (qf >= 0.76) reasons.push(`🏆 ${item.type === "games" && item.metacritic ? `Metacritic ${item.metacritic}` : `Rated ${item.score}`}`);
      const anchor = tasteRaw >= 0.2 ? this.likedAnchor(item, profile) : null;
      if (anchor) reasons.push(`❤️ Because you rated ${anchor.title} ${"★".repeat(anchor.rating)}`);
      if (type === "games" && time === 0 && tf >= 0.9 && item.playtime) reasons.push(`⏱️ ~${item.playtime}h — fits your session`);

      item._match = Math.max(1, Math.min(99, Math.round(score * 100)));
      item._reasons = reasons.slice(0, 3);
      scored.push({ item, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return this.diversify(scored.map((s) => s.item));
  },

  // Keep the list varied: no primary genre may dominate the ranking.
  diversify(items) {
    const cap = Math.max(3, Math.ceil(items.length / 4));
    const counts = {};
    const out = [], overflow = [];
    for (const it of items) {
      const g = (it.genres && it.genres[0]) || "?";
      if ((counts[g] || 0) >= cap) { overflow.push(it); continue; }
      counts[g] = (counts[g] || 0) + 1;
      out.push(it);
    }
    return out.concat(overflow);
  },

  // ---- Entry point ----
  async recommend(type, answers, ctx) {
    const profile = this.tasteProfile(ctx);

    let candidates;
    if (this.hasKey(type)) {
      candidates = type === "games"
        ? await this.gatherRawg(answers)
        : await this.gatherTmdb(type, answers, profile);
      // Fold in the user's saved-for-later items so the engine can surface
      // "this thing you already saved fits tonight".
      for (const id of ctx.watchlist) {
        const it = ctx.library[id];
        if (it && it.type === type && !candidates.some((c) => c.id === id)) candidates.push(it);
      }
    } else {
      candidates = this.fallbackCandidates(type, answers);
    }
    return this.rankCandidates(candidates, type, answers, ctx, profile);
  },

  // Offline: score the built-in catalog with the same ranking pipeline.
  fallbackCandidates(type, answers) {
    const mood = answers[2];
    const wanted = (FALLBACK_VIBE_MAP[type] || [])[mood] || [];
    return CATALOG
      .filter((it) => it.type === type)
      .map((it) => ({
        ...it,
        // Approximate moodFit via the curated vibe tags.
        genreIds: [],
        _vibeHits: it.vibes.filter((v) => wanted.includes(v)).length,
      }))
      .filter((it) => it._vibeHits > 0 || wanted.length === 0);
  },
};
