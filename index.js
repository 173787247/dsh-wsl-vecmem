import { createVecmem, cosine } from "./lib/store.js";

export const name = "dsh-wsl-vecmem";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx, config = {}) {
  if (config.enabled === false) {
    console.log("[dsh-wsl-vecmem] disabled");
    return;
  }
  const vm = createVecmem({
    storePath: config.storePath || process.env.DSH_VECMEM_PATH || "",
    ollamaBase: config.ollamaBase || process.env.DSH_OLLAMA_BASE || "http://127.0.0.1:11434",
    embedModel: config.embedModel || process.env.DSH_VECMEM_MODEL || "nomic-embed-text",
    timeoutMs: positive(config.timeoutMs, 60_000),
    maxItems: positive(config.maxItems, 5000),
  });
  console.log(`[dsh-wsl-vecmem] store=${vm.storePath} embedModel=${vm.embedModel}`);

  ctx.systemPrompt.section({
    name: "tool:vecmem",
    order: 131,
    text: "dsh-wsl-vecmem stores short text snippets with Ollama embeddings in ~/.dsh/vecmem. Use for project crumbs — not a replacement for Obsidian. Needs an embedding model (default nomic-embed-text).",
  });

  const timeoutMs = positive(config.timeoutMs, 60_000);

  ctx.tools.register({
    name: "vecmem_status",
    description: "Local vector memory path, item count, Ollama reachability.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute() {
      return vm.status();
    },
    presentCall: () => ({ card: "generic", title: "Vecmem status" }),
    presentResult: (_a, r) => ({ card: "generic", title: "Vecmem status", content: r.content }),
  });

  ctx.tools.register({
    name: "vecmem_add",
    description: "Embed and store a text snippet locally.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string" },
        meta: { type: "object", additionalProperties: true },
      },
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => [{ type: "text", text: JSON.stringify(v) }] },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        return await vm.add(args || {});
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    presentCall: () => ({ card: "generic", title: "Vecmem add" }),
    presentResult: (_a, r) => ({ card: "generic", title: "Vecmem add", content: r.content }),
  });

  ctx.tools.register({
    name: "vecmem_search",
    description: "Semantic search over local vector memory.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        topK: { type: "number" },
      },
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_a, v) => [
        {
          type: "text",
          text:
            v.ok === false
              ? v.error
              : (v.hits || []).map((h) => `[${h.score.toFixed(3)}] ${h.text}`).join("\n\n") || "(no hits)",
        },
      ],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        return await vm.search(args || {});
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    presentCall: () => ({ card: "generic", title: "Vecmem search" }),
    presentResult: (_a, r) => ({ card: "generic", title: "Vecmem search", content: r.content }),
  });

  void cosine;
}

function positive(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fb;
}
