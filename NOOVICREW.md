# NooviCrew — fork do MCP Excalidraw

Fork de [`yctimlin/mcp_excalidraw`](https://github.com/yctimlin/mcp_excalidraw) — servidor
**MCP** que dá aos agentes de IA um canvas Excalidraw programável (26 tools sobre stdio).

- **Origin:** `Click-Hype/NooviCrew-Excalidraw-MCP` · **Upstream:** `yctimlin/mcp_excalidraw`.
- **Localização:** `NooviCrew-Excalidraw/MCP/` (nested dentro do fork do editor).

## Build

```bash
npm install
npm run build   # gera dist/ (dist/index.js = servidor MCP stdio; dist/server.js = canvas local)
```

## Registro no workspace (stdio)

Registrado nos dois modelos do workspace:

- **Claude Code** — `~/.claude.json` › `mcpServers.excalidraw`
- **Codex CLI** — `~/.codex/config.toml` › `[mcp_servers.excalidraw]`

```jsonc
"excalidraw": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/debian/projetos/NooviCrew-Excalidraw/MCP/dist/index.js"]
}
```

## Modo de operação

Roda em **standalone**: na primeira tool que precisa de render (screenshot/describe) o servidor
auto-sobe seu próprio canvas local em `127.0.0.1:3000` (desligar com `EXCALIDRAW_NO_AUTOSTART=1`).
Exporta `.excalidraw`/PNG/SVG como artefatos.

> **Nota de arquitetura:** `map.noovicrew.com` serve o **editor Excalidraw puro** (sem a REST/WS
> API de sync que o canvas server deste MCP expõe). Por isso o MCP **não** sincroniza para o
> domínio público — ele usa canvas local. Para ter agentes desenhando ao vivo num canvas
> público seria preciso publicar o `Dockerfile.canvas` deste repo (canvas server) num subdomínio
> próprio, decisão separada.
