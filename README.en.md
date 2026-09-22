# dsh-wsl-vecmem

> **Languages:** [中文（首页）](./README.md) · **English** (this file)

Tiny local vector memory for dsh: **Ollama embeddings** + JSON store under `~/.dsh/vecmem/`.

Needs an embedding model (default `nomic-embed-text`). Complements Obsidian — not a vault replacement. Can share the same Ollama host as [dsh-wsl-ollama](https://github.com/173787247/dsh-wsl-ollama).

## Quick start

```sh
ollama pull nomic-embed-text
dsh plugin --profile web add github:173787247/dsh-wsl-vecmem
```

## Tools

| Tool | Role |
|------|------|
| `vecmem_status` | Store path, embed model, entry count |
| `vecmem_add` | Embed + store one text item |
| `vecmem_search` | Semantic nearest-neighbor search |

## Config

```yaml
config:
  enabled: true
  storePath: ""            # empty = ~/.dsh/vecmem/store.json
  ollamaBase: "http://127.0.0.1:11434"
  embedModel: "nomic-embed-text"
  timeoutMs: 60000
  maxItems: 5000
```

If Ollama runs on Windows, set `ollamaBase` to an address reachable from WSL (see the ollama plugin notes).

## License

MIT
