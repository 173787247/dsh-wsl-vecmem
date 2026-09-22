import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

export function createStore(storePath) {
  const path = storePath || join(homedir(), ".dsh", "vecmem", "store.json");
  mkdirSync(dirname(path), { recursive: true });
  function load() {
    if (!existsSync(path)) return { version: 1, items: [] };
    return JSON.parse(readFileSync(path, "utf8"));
  }
  function save(db) {
    writeFileSync(path, JSON.stringify(db), "utf8");
  }
  return {
    path,
    list() {
      return load().items.map(({ id, text, meta, createdAt }) => ({ id, text, meta, createdAt }));
    },
    add(item) {
      const db = load();
      db.items.push(item);
      save(db);
      return item;
    },
    clear() {
      save({ version: 1, items: [] });
    },
    all() {
      return load().items;
    },
  };
}

export function createVecmem({
  storePath,
  ollamaBase = "http://127.0.0.1:11434",
  embedModel = "nomic-embed-text",
  timeoutMs = 60_000,
  maxItems = 5000,
  fetchImpl = fetch,
} = {}) {
  const store = createStore(storePath);
  const root = String(ollamaBase).replace(/\/$/, "");

  async function embed(text) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${root}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, prompt: String(text) }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `embed HTTP ${res.status}`);
      const emb = json.embedding || json.embeddings?.[0];
      if (!emb?.length) throw new Error("empty embedding");
      return emb;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    storePath: store.path,
    embedModel,
    async status() {
      try {
        const res = await fetchImpl(`${root}/api/tags`, { signal: AbortSignal.timeout?.(5000) });
        return {
          ok: true,
          storePath: store.path,
          embedModel,
          ollama: res.ok,
          count: store.list().length,
        };
      } catch (e) {
        return {
          ok: true,
          storePath: store.path,
          embedModel,
          ollama: false,
          error: e instanceof Error ? e.message : String(e),
          count: store.list().length,
        };
      }
    },
    async add({ text, meta }) {
      const body = String(text || "").trim();
      if (!body) throw new Error("text required");
      if (store.list().length >= maxItems) throw new Error(`store full (maxItems=${maxItems})`);
      const embedding = await embed(body);
      const item = {
        id: randomUUID(),
        text: body.slice(0, 8000),
        meta: meta && typeof meta === "object" ? meta : {},
        embedding,
        createdAt: new Date().toISOString(),
      };
      store.add(item);
      return { ok: true, id: item.id, dims: embedding.length };
    },
    async search({ query, topK = 5 }) {
      const q = String(query || "").trim();
      if (!q) throw new Error("query required");
      const qe = await embed(q);
      const scored = store.all().map((it) => ({
        id: it.id,
        text: it.text,
        meta: it.meta,
        score: cosine(qe, it.embedding),
      }));
      scored.sort((a, b) => b.score - a.score);
      return { ok: true, hits: scored.slice(0, Math.min(20, Math.max(1, topK))) };
    },
  };
}
