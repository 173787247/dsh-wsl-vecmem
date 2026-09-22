# dsh-wsl-vecmem

Tiny local vector memory for dsh: **Ollama embeddings** + `~/.dsh/vecmem/store.json`.

Needs an embedding model (default `nomic-embed-text`). Complements Obsidian — not a vault.

[中文 → README.zh.md](./README.zh.md)

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
