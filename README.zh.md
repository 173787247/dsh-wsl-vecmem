# dsh-wsl-vecmem

本地向量小记：用 **Ollama embedding** + `~/.dsh/vecmem/store.json` 存短文本，供语义检索。

补 Obsidian / 笔记库，**不是** vault 替代品。依赖本机 Ollama（可与 [dsh-wsl-ollama](https://github.com/173787247/dsh-wsl-ollama) 同机）。

[English → README.md](./README.md)

## 最短上手

```sh
ollama pull nomic-embed-text
dsh plugin --profile web add github:173787247/dsh-wsl-vecmem
```

## 工具

| 工具 | 作用 |
|------|------|
| `vecmem_status` | store 路径、embed 模型、条数 |
| `vecmem_add` | 写入一条文本并嵌入 |
| `vecmem_search` | 按语义相似度检索 |

## 配置

```yaml
config:
  enabled: true
  storePath: ""            # 空 = ~/.dsh/vecmem/store.json
  ollamaBase: "http://127.0.0.1:11434"
  embedModel: "nomic-embed-text"
  timeoutMs: 60000
  maxItems: 5000
```

Ollama 在 Windows 时，把 `ollamaBase` 改成可从 WSL 访问的地址（见 ollama 插件说明）。

## License

MIT
