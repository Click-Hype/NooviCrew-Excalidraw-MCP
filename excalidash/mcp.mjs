#!/usr/bin/env node
// MCP server do Excalidash — multi-canvas para agentes de IA (Aria e futuros).
// Expõe pastas/subpastas + canvas + render de apresentação sobre o backend Excalidash.
// stdio. Config por env: EXCALIDASH_URL, EXCALIDASH_EMAIL, EXCALIDASH_PASSWORD.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Excalidash, buildPresentation, APPSTATE, boxElements, textElements, arrowElements, stickyElements } from "./lib.mjs";

const client = new Excalidash();

// Monta a árvore de pastas a partir da lista plana (parentId), para o agente enxergar a hierarquia.
function toTree(cols) {
  const byId = new Map(cols.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const p = c.parentId && byId.get(c.parentId);
    if (p) p.children.push(c); else roots.push(c);
  }
  const fmt = (n, d = 0) => [`${"  ".repeat(d)}📁 ${n.name} [${n.id}]`, ...n.children.flatMap((c) => fmt(c, d + 1))];
  return { roots, text: roots.flatMap((r) => fmt(r)).join("\n") || "(nenhuma pasta ainda)" };
}

const TOOLS = [
  { name: "whoami", description: "Retorna o usuário Excalidash autenticado (agente) e a URL base.", inputSchema: { type: "object", properties: {} } },
  { name: "list_folders", description: "Lista as PASTAS (coleções) do agente em árvore, com subpastas aninhadas. Use antes de criar para reaproveitar pastas existentes.", inputSchema: { type: "object", properties: {} } },
  { name: "create_folder", description: "Cria uma pasta (ou subpasta se parentId for informado). Organize por cliente/projeto. Retorna o id.", inputSchema: { type: "object", properties: { name: { type: "string" }, parentId: { type: "string", description: "id da pasta-mãe p/ criar subpasta (opcional)" } }, required: ["name"] } },
  { name: "list_canvases", description: "Lista os canvas/drawings, opcionalmente de uma pasta (folderId).", inputSchema: { type: "object", properties: { folderId: { type: "string" } } } },
  { name: "create_canvas", description: "Cria um canvas/drawing vazio dentro de uma pasta (folderId opcional). Retorna id + url.", inputSchema: { type: "object", properties: { name: { type: "string" }, folderId: { type: "string" } }, required: ["name"] } },
  { name: "get_canvas", description: "Lê um canvas (elements/appState/files) pelo id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "render_presentation",
    description: "Desenha (ou atualiza) uma APRESENTAÇÃO de fluxo em um canvas: título, lane de estágios do fluxo/trilha (com setas) e um painel 'Falta coletar' com pendências. Cria o canvas se drawingId não for dado. Ideal para fluxo comercial + trilha do cliente.",
    inputSchema: {
      type: "object",
      properties: {
        drawingId: { type: "string", description: "atualiza este canvas; se ausente, cria um novo" },
        name: { type: "string", description: "nome do canvas ao criar" },
        folderId: { type: "string", description: "pasta onde criar o canvas (opcional)" },
        title: { type: "string" },
        subtitle: { type: "string" },
        stages: { type: "array", description: "estágios do fluxo, em ordem", items: { type: "object", properties: { title: { type: "string" }, items: { type: "array", items: { type: "string" } } }, required: ["title"] } },
        pending: { type: "array", description: "itens pendentes (falta coletar)", items: { type: "object", properties: { title: { type: "string" }, note: { type: "string" } }, required: ["title"] } },
        meta: { type: "array", description: "pares label/valor de contexto (persona, horário...)", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
      },
      required: ["title", "stages"],
    },
  },
  { name: "write_scene", description: "Substitui a cena de um canvas por elementos Excalidraw crus (escape hatch para layout custom).", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, elements: { type: "array" } }, required: ["drawingId", "elements"] } },
  // organização (seguro; sem delete)
  { name: "move_canvas", description: "Move um canvas para uma pasta (folderId null = tira da pasta).", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, folderId: { type: ["string", "null"] } }, required: ["drawingId"] } },
  { name: "rename_canvas", description: "Renomeia um canvas.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, name: { type: "string" } }, required: ["drawingId", "name"] } },
  { name: "move_folder", description: "Move uma pasta para dentro de outra (parentId null = raiz). Anti-ciclo no backend.", inputSchema: { type: "object", properties: { folderId: { type: "string" }, parentId: { type: ["string", "null"] } }, required: ["folderId"] } },
  { name: "rename_folder", description: "Renomeia uma pasta.", inputSchema: { type: "object", properties: { folderId: { type: "string" }, name: { type: "string" } }, required: ["folderId", "name"] } },
  { name: "share_canvas", description: "Compartilha um canvas com uma pessoa pelo e-mail (permission view|edit). A pessoa precisa ter conta.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, email: { type: "string" }, permission: { type: "string", enum: ["view", "edit"] } }, required: ["drawingId", "email"] } },
  // desenho livre (acrescenta elementos SEM apagar os existentes)
  { name: "add_box", description: "Acrescenta uma caixa rotulada ao canvas. color: blue|green|red|yellow|purple|gray.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, label: { type: "string" }, color: { type: "string" } }, required: ["drawingId", "x", "y"] } },
  { name: "add_text", description: "Acrescenta um texto ao canvas.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, x: { type: "number" }, y: { type: "number" }, text: { type: "string" }, fontSize: { type: "number" } }, required: ["drawingId", "x", "y", "text"] } },
  { name: "add_arrow", description: "Acrescenta uma seta entre dois pontos.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" } }, required: ["drawingId", "x1", "y1", "x2", "y2"] } },
  { name: "add_sticky", description: "Acrescenta um sticky note (bilhete amarelo) ao canvas.", inputSchema: { type: "object", properties: { drawingId: { type: "string" }, x: { type: "number" }, y: { type: "number" }, text: { type: "string" } }, required: ["drawingId", "x", "y", "text"] } },
];

const server = new Server({ name: "excalidash", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

const ok = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    switch (name) {
      case "whoami": { const u = await client.me(); return ok({ user: u, url: client.url }); }
      case "list_folders": { const cols = await client.listCollections(); const t = toTree(cols); return ok({ tree: t.text, folders: cols }); }
      case "create_folder": { const f = await client.createCollection(a.name, a.parentId); return ok(f); }
      case "list_canvases": { return ok(await client.listDrawings(a.folderId)); }
      case "create_canvas": { return ok(await client.createDrawing({ name: a.name, collectionId: a.folderId })); }
      case "get_canvas": { return ok(await client.getDrawing(a.id)); }
      case "render_presentation": {
        const elements = buildPresentation({ title: a.title, subtitle: a.subtitle, stages: a.stages || [], pending: a.pending || [], meta: a.meta || [] });
        let res;
        if (a.drawingId) res = await client.updateDrawing(a.drawingId, { elements, appState: APPSTATE });
        else res = await client.createDrawing({ name: a.name || a.title, collectionId: a.folderId, elements, appState: APPSTATE });
        return ok({ ...res, elementsCount: elements.length });
      }
      case "write_scene": { return ok(await client.updateDrawing(a.drawingId, { elements: a.elements })); }
      case "move_canvas": { return ok(await client.updateDrawing(a.drawingId, { collectionId: a.folderId ?? null })); }
      case "rename_canvas": { return ok(await client.updateDrawing(a.drawingId, { name: a.name })); }
      case "move_folder": { return ok(await client.updateCollection(a.folderId, { parentId: a.parentId ?? null })); }
      case "rename_folder": { return ok(await client.updateCollection(a.folderId, { name: a.name })); }
      case "share_canvas": { return ok(await client.shareDrawing(a.drawingId, a.email, a.permission || "view")); }
      case "add_box": { return ok(await client.appendElements(a.drawingId, boxElements(a.x, a.y, a.width, a.height, a.label, a.color))); }
      case "add_text": { return ok(await client.appendElements(a.drawingId, textElements(a.x, a.y, a.text, { fontSize: a.fontSize }))); }
      case "add_arrow": { return ok(await client.appendElements(a.drawingId, arrowElements(a.x1, a.y1, a.x2, a.y2))); }
      case "add_sticky": { return ok(await client.appendElements(a.drawingId, stickyElements(a.x, a.y, a.text))); }
      default: return { content: [{ type: "text", text: `Tool desconhecida: ${name}` }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: "text", text: `Erro: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[excalidash-mcp] pronto em", client.url);
