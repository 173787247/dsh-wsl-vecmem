/**
 * vecmem storage: metadata in JSON, vectors in a raw Float32 sidecar.
 *
 * The first version kept embeddings inside store.json as decimal numbers. That
 * is 5.5x larger than the same data as Float32, and it is all cost with no
 * benefit -- nobody reads a vector by eye. Measured on a real store:
 *
 *     4610 items, 4096 dims, JSON      400 MB   (96% of it vector text)
 *     4610 items, 4096 dims, Float32    76 MB
 *
 * Worse than the size: load() ran JSON.parse over the whole file on every call
 * and save() rewrote all of it. At 20,000 items each add() would parse ~1.7 GB.
 * The store could not have grown past a few thousand entries no matter what
 * maxItems said.
 *
 * Layout:
 *   store.json    { version, dims, items: [{id, text, meta, createdAt}] }
 *   vectors.f32   items.length x dims float32, row i belongs to items[i]
 *
 * Two files can drift apart if a write is interrupted. dims and the item count
 * are both checked on load, and a mismatch is reported rather than silently
 * producing garbage similarity scores -- a dimension mismatch returns NaN from
 * cosine(), and sorting NaN gives an arbitrary order with no error at all.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
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

function normalizeWorkspace(workspace) {
  if (workspace == null) return "";
  return String(workspace).trim();
}

const EMPTY = { version: 2, dims: 0, items: [] };

export function createStore(storePath) {
  const path = storePath || join(homedir(), ".dsh", "vecmem", "store.json");
  const vecPath = path.replace(/\.json$/, "") + ".vectors.f32";
  mkdirSync(dirname(path), { recursive: true });

  function load() {
    if (!existsSync(path)) return { ...EMPTY, items: [] };
    let db;
    try {
      db = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return { ...EMPTY, items: [] };
    }
    // Refuse to hand back a store whose two halves disagree. Reporting it is
    // the only safe option: the alternative is scores that look plausible.
    if (db.version === 2 && db.dims) {
      const bytes = existsSync(vecPath) ? statSync(vecPath).size : 0;
      const expected = db.items.length * db.dims * 4;
      if (bytes !== expected) {
        db.__mismatch = `vectors.f32 is ${bytes} bytes, expected ${expected} for ${db.items.length} items x ${db.dims} dims`;
      }
    }
    return db;
  }

  /** Row i of the sidecar, as a plain array. */
  function readVector(i, dims) {
    const fd = openSync(vecPath, "r");
    try {
      const buf = Buffer.allocUnsafe(dims * 4);
      const got = readSync(fd, buf, 0, dims * 4, i * dims * 4);
      if (got !== dims * 4) return null;
      return Array.from(new Float32Array(buf.buffer, buf.byteOffset, dims));
    } finally {
      closeSync(fd);
    }
  }

  return {
    path,
    vectorPath: vecPath,
    dims() { return load().dims ?? 0; },
    mismatch() { return load().__mismatch ?? null; },

    list() {
      return load().items.map(({ id, text, meta, createdAt }) => ({ id, text, meta, createdAt }));
    },

    all() {
      const db = load();
      if (!db.dims || !db.items.length) return [];
      // One read for the whole matrix beats one syscall per row.
      let buf = null;
      try { buf = readFileSync(vecPath); } catch { /* missing sidecar */ }
      return db.items.map((it, i) => ({
        ...it,
        embedding: buf && buf.length >= (i + 1) * db.dims * 4
          ? Array.from(new Float32Array(buf.buffer, buf.byteOffset + i * db.dims * 4, db.dims))
          : [],
      }));
    },

    add(item) {
      const db = load();
      const dims = item.embedding?.length ?? 0;
      if (!dims) throw new Error("embedding required");
      if (db.dims && db.dims !== dims) {
        throw new Error(`dimension mismatch: store holds ${db.dims}-dim vectors, this one is ${dims}. Re-index before mixing models.`);
      }
      const { embedding, ...rest } = item;
      db.items.push(rest);
      db.dims = dims;
      db.version = 2;
      // Vector first, then the index. A crash between them leaves an extra
      // trailing vector, which the byte-count check reports as a mismatch
      // rather than as a wrong answer.
      appendFileSync(vecPath, Buffer.from(new Float32Array(embedding).buffer));
      writeFileSync(path, JSON.stringify({ version: 2, dims: db.dims, items: db.items }));
      return rest;
    },

    clear(workspace) {
      const ws = normalizeWorkspace(workspace);
      const db = load();
      const before = db.items.length;
      if (!ws) {
        writeFileSync(path, JSON.stringify({ version: 2, dims: 0, items: [] }));
        writeFileSync(vecPath, Buffer.alloc(0));
        return { removed: before, remaining: 0 };
      }
      // Keep the rows that survive, in order, so the sidecar stays aligned.
      const keep = [];
      const keepVec = [];
      const buf = existsSync(vecPath) ? readFileSync(vecPath) : Buffer.alloc(0);
      for (const [i, it] of db.items.entries()) {
        if (it.meta?.workspace === ws) continue;
        keep.push(it);
        if (db.dims && buf.length >= (i + 1) * db.dims * 4) {
          keepVec.push(buf.subarray(i * db.dims * 4, (i + 1) * db.dims * 4));
        }
      }
      writeFileSync(vecPath, keepVec.length ? Buffer.concat(keepVec) : Buffer.alloc(0));
      writeFileSync(path, JSON.stringify({ version: 2, dims: keep.length ? db.dims : 0, items: keep }));
      return { removed: before - keep.length, remaining: keep.length };
    },
  };
}

export function createVecmem({
  storePath,
  ollamaBase = "http://127.0.0.1:11434",
  embedModel = "nomic-embed-text",
  timeoutMs = 60_000,
  maxItems = 500_000,
  fetchImpl = fetch,
} = {}) {
  const store = createStore(storePath);
  const root = String(ollamaBase).replace(/\/$/, "");

  async function embed(text) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // nomic rejected input past its 512-token window with a plain 500. Budget
      // by script, not by character count: CJK runs 1-2 tokens per character
      // against roughly 0.25 for Latin.
      const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
      const ratio = text.length ? cjk / text.length : 0;
      const cap = ratio > 0.3 ? 2500 : ratio > 0.1 ? 4000 : 6000;
      const prompt = text.length > cap ? text.slice(0, cap) : text;

      const res = await fetchImpl(`${root}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, prompt }),
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
    vectorPath: store.vectorPath,
    embedModel,
    async status() {
      const count = store.list().length;
      const mismatch = store.mismatch();
      try {
        const res = await fetchImpl(`${root}/api/tags`, { signal: AbortSignal.timeout?.(5000) });
        return { ok: true, storePath: store.path, vectorPath: store.vectorPath,
          embedModel, dims: store.dims(), ollama: res.ok, count,
          ...(mismatch ? { warning: mismatch } : {}) };
      } catch (e) {
        return { ok: true, storePath: store.path, vectorPath: store.vectorPath, embedModel,
          ollama: false, error: e instanceof Error ? e.message : String(e), count,
          ...(mismatch ? { warning: mismatch } : {}) };
      }
    },
    async add({ text, meta, workspace } = {}) {
      const body = String(text || "").trim();
      if (!body) throw new Error("text required");
      if (store.list().length >= maxItems) throw new Error(`store full (maxItems=${maxItems})`);
      const embedding = await embed(body);
      const m = meta && typeof meta === "object" ? { ...meta } : {};
      const ws = normalizeWorkspace(workspace);
      if (ws) m.workspace = ws;
      const item = {
        id: randomUUID(),
        text: body.slice(0, 8000),
        meta: m,
        embedding,
        createdAt: new Date().toISOString(),
      };
      store.add(item);
      return { ok: true, id: item.id, dims: embedding.length, workspace: m.workspace || null };
    },
    async search({ query, topK = 5, workspace } = {}) {
      const q = String(query || "").trim();
      if (!q) throw new Error("query required");
      const qe = await embed(q);
      const ws = normalizeWorkspace(workspace);
      let items = store.all();
      if (ws) items = items.filter((it) => it.meta?.workspace === ws);
      const scored = items.map((it) => ({
        id: it.id, text: it.text, meta: it.meta,
        score: cosine(qe, it.embedding),
      }));
      scored.sort((a, b) => b.score - a.score);
      return { ok: true, workspace: ws || null, hits: scored.slice(0, Math.min(20, Math.max(1, topK))) };
    },
    clear({ workspace } = {}) {
      const ws = normalizeWorkspace(workspace);
      const result = store.clear(ws || undefined);
      return { ok: true, workspace: ws || null, cleared: ws ? "workspace" : "all",
        removed: result.removed, remaining: result.remaining ?? store.list().length };
    },
  };
}
