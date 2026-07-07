# Excalidash MCP + CLI — multi-canvas para agentes (Aria & futuros)

Cliente + MCP + CLI para o backend **Excalidash** (`https://map.noovicrew.com`), o app multi-canvas
da NooviCrew. Dá aos agentes de IA ciência de que **há vários canvas e pastas/subpastas aninhadas**,
e a capacidade de **criar pastas/subpastas com canvas dentro** e desenhar apresentações de fluxo.

## Peças
- `lib.mjs` — cliente REST autenticado (cookie + CSRF) + builder de apresentação (auto-layout).
- `mcp.mjs` — servidor **MCP** (stdio) para clients MCP (Claude Code, Codex).
- `cli.mjs` — **CLI** para agentes com terminal (ex.: Aria no Hermes) e humanos.
- `excalidash` — wrapper bash que carrega credenciais (de fora do git) e chama a CLI.

## Config (env)
`EXCALIDASH_URL` · `EXCALIDASH_EMAIL` · `EXCALIDASH_PASSWORD`. A identidade padrão é a **Aria**
(`aria@noovicrew.com`); as credenciais vivem **fora do git** em
`/home/debian/docker/stacks/excalidash/aria.env` (600) e o wrapper as carrega.

## MCP (Claude/Codex) — já registrado
`~/.claude.json` › `mcpServers.excalidash` e `~/.codex/config.toml` › `[mcp_servers.excalidash]`.
Tools: `whoami`, `list_folders` (árvore), `create_folder(name, parentId?)`, `list_canvases(folderId?)`,
`create_canvas(name, folderId?)`, `get_canvas(id)`, `render_presentation(...)`, `write_scene(...)`.

## CLI / wrapper — para a Aria (Hermes, terminal)
```bash
cd /home/debian/projetos/NooviCrew-Excalidash/MCP/excalidash
./excalidash folders                                   # árvore de pastas/subpastas
./excalidash create-folder "Clientes"                  # pasta raiz
./excalidash create-folder "DLG" <parentId>            # subpasta (aninhada)
./excalidash create-canvas "Rascunho" <folderId>       # canvas dentro da pasta
./excalidash render <folderId> @spec.json              # desenha apresentação de fluxo
```

### `render` — spec de apresentação (fluxo comercial + trilha + pendências)
JSON com `title`, `subtitle`, `meta:[{label,value}]`, `stages:[{title, items:[]}]` (serpentina com
setas), `pending:[{title, note}]` (painel "Falta coletar"). Para atualizar um canvas existente, inclua
`drawingId` no spec. Ex.: ver a primeira apresentação do DLG (agente Dan).

## Organização (pastas aninhadas)
O fork estende as Collections do ExcaliDash com `parentId` (subpastas em qualquer profundidade,
anti-ciclo no backend). A Aria organiza por **cliente › projeto › canvas**; o admin/usuário vê a
árvore no sidebar de `map.noovicrew.com`.

> Nota: o `render` **substitui** a cena via `PUT` (idempotente). Não edite o mesmo canvas no navegador
> enquanto um agente escreve nele — o editor aberto reconcilia o cache e pode duplicar elementos.
