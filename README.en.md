# dsh-wsl-vecmem

> **Languages:** [中文（首页）](./README.md) · **English** (this file)

Tiny local vector memory for dsh: **Ollama embeddings** + `~/.dsh/vecmem/store.json`.

Needs an embedding model (default `nomic-embed-text`). Complements Obsidian — not a vault.

## Install

```sh
dsh plugin --profile web add github:173787247/dsh-wsl-vecmem
ollama pull nomic-embed-text
```

## Tools

| Tool | Role |
|------|------|
| `vecmem_status` | Store path, model, count |
| `vecmem_add` | Embed + store text |
| `vecmem_search` | Semantic search |

## License

MIT
