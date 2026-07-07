#!/usr/bin/env node
// CLI do Excalidash — mesmas operações do MCP, para agentes (CLI) e humanos.
// Uso: node excalidash/cli.mjs <cmd> [args...] | JSON in/out.
//   whoami
//   folders                          -> árvore de pastas
//   create-folder <nome> [parentId]  -> cria pasta/subpasta
//   canvases [folderId]              -> lista canvas
//   create-canvas <nome> [folderId]  -> cria canvas
//   get-canvas <id>
//   render <folderId|-> <json|@arquivo>   -> render_presentation (spec JSON no stdin/arquivo/arg)
// Env: EXCALIDASH_URL, EXCALIDASH_EMAIL, EXCALIDASH_PASSWORD.
import fs from "node:fs";
import { Excalidash, buildPresentation, APPSTATE } from "./lib.mjs";

const [cmd, ...args] = process.argv.slice(2);
const c = new Excalidash();
const out = (o) => console.log(typeof o === "string" ? o : JSON.stringify(o, null, 2));

function readSpec(arg) {
  let raw = arg;
  if (!raw || raw === "-") raw = fs.readFileSync(0, "utf-8");
  else if (raw.startsWith("@")) raw = fs.readFileSync(raw.slice(1), "utf-8");
  return JSON.parse(raw);
}

try {
  switch (cmd) {
    case "whoami": out(await c.me()); break;
    case "folders": {
      const cols = await c.listCollections();
      const byId = new Map(cols.map((x) => [x.id, { ...x, children: [] }]));
      const roots = [];
      for (const x of byId.values()) { const p = x.parentId && byId.get(x.parentId); if (p) p.children.push(x); else roots.push(x); }
      const fmt = (n, d = 0) => [`${"  ".repeat(d)}📁 ${n.name} [${n.id}]`, ...n.children.flatMap((ch) => fmt(ch, d + 1))];
      out(roots.flatMap((r) => fmt(r)).join("\n") || "(nenhuma pasta)");
      break;
    }
    case "create-folder": out(await c.createCollection(args[0], args[1])); break;
    case "canvases": out(await c.listDrawings(args[0])); break;
    case "create-canvas": out(await c.createDrawing({ name: args[0], collectionId: args[1] })); break;
    case "get-canvas": out(await c.getDrawing(args[0])); break;
    case "render": {
      const folderId = args[0] && args[0] !== "-" ? args[0] : undefined;
      const spec = readSpec(args[1]);
      const elements = buildPresentation(spec);
      const res = spec.drawingId
        ? await c.updateDrawing(spec.drawingId, { elements, appState: APPSTATE })
        : await c.createDrawing({ name: spec.name || spec.title, collectionId: folderId, elements, appState: APPSTATE });
      out({ ...res, elementsCount: elements.length });
      break;
    }
    default:
      out("cmds: whoami | folders | create-folder <nome> [parentId] | canvases [folderId] | create-canvas <nome> [folderId] | get-canvas <id> | render <folderId|-> <@spec.json>");
  }
} catch (e) {
  console.error("ERRO:", e.message);
  process.exit(1);
}
