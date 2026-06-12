/* External database clients: TMDB (movies & TV) and RAWG (games).
   Every function returns items normalized to:
   { id, type, title, year, poster, genres: [names], score: "7.8"|null } */

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
    };
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
    };
  },

  // ---------------- Public interface ----------------
  // Trending / popular — the default Browse feed.
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
      const data = await this.rawgFetch({ search: query, ordering: "-added" });
      return data.results.map((r) => this.normalizeRawg(r));
    }
    const data = await this.tmdbFetch(`/search/${type === "movies" ? "movie" : "tv"}`, { query });
    return data.results.map((r) => this.normalizeTmdb(r, type));
  },

  // Vibe finder — maps questionnaire answers [time, energy, mood] to
  // discover queries.
  async vibe(type, answers) {
    const [time, energy, mood] = answers;

    if (type === "games") {
      const params = { ordering: "-added", metacritic: "60,100" };
      const moodMap = [
        { genres: "shooter,sports,racing,fighting" },          // Compete & sweat
        { tags: "story-rich" },                                // Get lost in a story
        { genres: "casual,simulation,puzzle,indie" },          // Chill & cozy
        { tags: "co-op" },                                     // Co-op with friends
      ];
      Object.assign(params, moodMap[mood] || {});
      if (energy === 2) params.tags = params.tags ? params.tags + ",difficult" : "difficult";
      if (energy === 0 && !params.genres) params.genres = "casual,indie,arcade";
      const data = await this.rawgFetch(params);
      let items = data.results.map((r) => this.normalizeRawg(r));
      // RAWG can't filter by session length, so nudge the ordering instead:
      // short on time → shorter games first; all night → longer first.
      if (time === 0) items.sort((a, b) => (a.playtime || 999) - (b.playtime || 999));
      if (time === 2) items.sort((a, b) => (b.playtime || 0) - (a.playtime || 0));
      return items;
    }

    const isMovie = type === "movies";
    const params = { sort_by: "popularity.desc", "vote_count.gte": "200" };

    if (isMovie) {
      if (time === 0) params["with_runtime.lte"] = "100";
      if (time === 1) params["with_runtime.lte"] = "135";
      const moodGenres = ["35", "18|10749", "53|27|9648", "878|9648", "10751|16|35"];
      params.with_genres = moodGenres[mood] || "";
    } else {
      if (time === 0) params["with_runtime.lte"] = "35";
      if (time === 1) params["with_runtime.lte"] = "65";
      const moodGenres = ["35", "18", "80|9648", "10765", "10764|35|10751"];
      params.with_genres = moodGenres[mood] || "";
    }
    if (energy === 2) {
      params.sort_by = "vote_average.desc";
      params["vote_count.gte"] = "1000";
      params["vote_average.gte"] = "7.4";
    }
    if (!params.with_genres) delete params.with_genres;

    const data = await this.tmdbFetch(`/discover/${isMovie ? "movie" : "tv"}`, params);
    return data.results.map((r) => this.normalizeTmdb(r, type));
  },

  // Local fallback when no API key is configured yet.
  fallbackVibe(type, answers) {
    const mood = answers[2];
    const wanted = (FALLBACK_VIBE_MAP[type] || [])[mood] || [];
    return CATALOG
      .filter((it) => it.type === type)
      .map((it) => ({ it, score: it.vibes.filter((v) => wanted.includes(v)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  },

  fallbackBrowse(type, query) {
    let items = CATALOG.filter((it) => it.type === type);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((it) => it.title.toLowerCase().includes(q) || it.genres.some((g) => g.toLowerCase().includes(q)));
    }
    return items;
  },
};
