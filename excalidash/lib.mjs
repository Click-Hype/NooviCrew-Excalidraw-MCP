// Excalidash client + Excalidraw scene builder — NooviCrew
// Cliente REST autenticado (cookie + CSRF) para o backend Excalidash multi-canvas,
// e um auto-layout de "apresentação" (fluxo + trilha + pendências) em elementos Excalidraw.
// Usado pelo MCP (mcp.mjs) e pela CLI (cli.mjs). ESM puro, Node >=18 (fetch nativo).

const DEFAULT_URL = process.env.EXCALIDASH_URL || "https://map.noovicrew.com";

// ---------------------------------------------------------------- HTTP client
export class Excalidash {
  constructor({ url = DEFAULT_URL, email = process.env.EXCALIDASH_EMAIL, password = process.env.EXCALIDASH_PASSWORD } = {}) {
    this.url = url.replace(/\/$/, "");
    this.email = email;
    this.password = password;
    this.cookies = new Map();
    this.csrf = null;
    this.loggedIn = false;
  }

  _cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async _fetch(path, { method = "GET", body, headers = {} } = {}) {
    const h = { ...headers };
    const cookie = this._cookieHeader();
    if (cookie) h["cookie"] = cookie;
    const res = await fetch(this.url + path, { method, headers: h, body, redirect: "manual" });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const kv = c.split(";")[0];
      const i = kv.indexOf("=");
      if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
    return res;
  }

  async _getCsrf() {
    const r = await this._fetch("/api/csrf-token");
    const j = await r.json();
    this.csrf = j.token;
    return j.token;
  }

  async login() {
    if (!this.email || !this.password) throw new Error("EXCALIDASH_EMAIL/EXCALIDASH_PASSWORD não definidos");
    await this._getCsrf();
    const r = await this._fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": this.csrf, origin: this.url },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!r.ok) throw new Error(`login falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
    this.loggedIn = true;
    return (await r.json()).user;
  }

  async _ensure() {
    if (!this.loggedIn) await this.login();
  }

  // GET autenticado (re-login em 401)
  async _get(path) {
    await this._ensure();
    let r = await this._fetch(path);
    if (r.status === 401) { this.loggedIn = false; await this.login(); r = await this._fetch(path); }
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  // Write autenticado (POST/PUT/DELETE) com CSRF fresco + retry em 401
  async _write(method, path, payload) {
    await this._ensure();
    const doIt = async () => {
      await this._getCsrf();
      return this._fetch(path, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": this.csrf, origin: this.url },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    };
    let r = await doIt();
    if (r.status === 401 || r.status === 403) { this.loggedIn = false; await this.login(); r = await doIt(); }
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.status === 204 ? { ok: true } : r.json();
  }

  // ---- API de alto nível ----
  async me() { return (await this._get("/api/auth/me")).user; }

  async listCollections() {
    const cols = await this._get("/api/collections");
    return cols.filter((c) => c.id !== "trash").map((c) => ({ id: c.id, name: c.name, parentId: c.parentId ?? null, isOwner: c.isOwner, isShared: c.isShared }));
  }
  async createCollection(name, parentId) { const c = await this._write("POST", "/api/collections", parentId ? { name, parentId } : { name }); return { id: c.id, name: c.name, parentId: c.parentId ?? parentId ?? null }; }
  async deleteCollection(id) { return this._write("DELETE", `/api/collections/${id}`); }

  async listDrawings(collectionId) {
    const q = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : "";
    const res = await this._get(`/api/drawings${q}`);
    const arr = Array.isArray(res) ? res : res.drawings || [];
    return arr.map((d) => ({ id: d.id, name: d.name, collectionId: d.collectionId, url: `${this.url}/editor/${d.id}`, updatedAt: d.updatedAt }));
  }
  async getDrawing(id) {
    const d = await this._get(`/api/drawings/${id}`);
    return { id: d.id, name: d.name, collectionId: d.collectionId, elements: parseMaybe(d.elements), appState: parseMaybe(d.appState), files: parseMaybe(d.files), url: `${this.url}/editor/${d.id}` };
  }
  async createDrawing({ name, collectionId, elements = [], appState = {}, files = {} }) {
    const d = await this._write("POST", "/api/drawings", { name, collectionId: collectionId || null, elements, appState, files });
    return { id: d.id, name: d.name, url: `${this.url}/editor/${d.id}` };
  }
  async updateDrawing(id, { name, collectionId, elements, appState, files } = {}) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (collectionId !== undefined) body.collectionId = collectionId;
    if (elements !== undefined) body.elements = elements;
    if (appState !== undefined) body.appState = appState;
    if (files !== undefined) body.files = files;
    const d = await this._write("PUT", `/api/drawings/${id}`, body);
    return { id: d.id, name: d.name, url: `${this.url}/editor/${d.id}` };
  }

  // Garante uma coleção pelo nome (cria se não existir) — organização por projeto/cliente
  async ensureCollection(name) {
    const cols = await this.listCollections();
    const found = cols.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    return this.createCollection(name);
  }
}

function parseMaybe(v) { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } }

// ------------------------------------------------- Excalidraw element builders
let _idc = 0;
const rid = () => `nc-${Date.now().toString(36)}-${(_idc++).toString(36)}`;
const seed = () => Math.floor(Math.random() * 2 ** 31);

const PALETTE = {
  ink: "#1e1e1e", sub: "#5c5c5c",
  stageBg: "#e7f0ff", stageStroke: "#3b6fd4",
  startBg: "#e6f7ec", startStroke: "#2f9e51",
  endBg: "#fdecef", endStroke: "#d1435b",
  noteBg: "#fff6d6", noteStroke: "#e0b83a",
  metaBg: "#f2effc", metaStroke: "#7b61c9",
  arrow: "#3b3b3b",
};

function baseEl(type, x, y, w, h, extra = {}) {
  return {
    id: rid(), type, x, y, width: w, height: h, angle: 0,
    strokeColor: PALETTE.ink, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1.5, strokeStyle: "solid", roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed: seed(), version: 1,
    versionNonce: seed(), isDeleted: false, boundElements: null, updated: Date.now(),
    link: null, locked: false, ...extra,
  };
}

function rect(x, y, w, h, { bg = "transparent", stroke = PALETTE.ink, rounded = true } = {}) {
  return baseEl("rectangle", x, y, w, h, { backgroundColor: bg, strokeColor: stroke, roundness: rounded ? { type: 3 } : null });
}

const CHAR_W = 0.58; // aproximação de largura por caractere relativa ao fontSize
function wrap(text, maxWidth, fontSize) {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * CHAR_W)));
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if ((line + " " + word).trim().length > maxChars) { if (line) out.push(line); line = word; }
      else line = (line ? line + " " : "") + word;
    }
    out.push(line);
  }
  return out;
}

function text(x, y, str, { fontSize = 16, color = PALETTE.ink, maxWidth = 600, align = "left", bold = false } = {}) {
  const lines = wrap(str, maxWidth, fontSize);
  const lineHeight = 1.25;
  const h = Math.ceil(lines.length * fontSize * lineHeight);
  const w = Math.min(maxWidth, Math.max(...lines.map((l) => l.length)) * fontSize * CHAR_W + 4);
  const body = lines.join("\n");
  return baseEl("text", x, y, w, h, {
    strokeColor: color, text: body, originalText: body, fontSize,
    fontFamily: bold ? 2 : 1, textAlign: align, verticalAlign: "top",
    containerId: null, lineHeight, baseline: Math.round(fontSize * 0.9),
  });
}

function arrow(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return baseEl("arrow", x1, y1, Math.abs(dx) || 1, Math.abs(dy) || 1, {
    strokeColor: PALETTE.arrow, points: [[0, 0], [dx, dy]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow",
  });
}

// Constrói a cena de apresentação: título, lane de estágios (fluxo/trilha, serpentina),
// painel de pendências e um card de meta (persona/horário). Retorna array de elementos.
export function buildPresentation({ title, subtitle, stages = [], pending = [], meta = [] }) {
  const els = [];
  const X0 = 60, Y0 = 50;
  const W = 250, H = 150, HGAP = 70, VGAP = 95, PER_ROW = 4;

  // cabeçalho: título + subtítulo (empilhados sem sobrepor, mesmo com título de 2 linhas)
  const headerMax = X0 + PER_ROW * (W + HGAP) - (W + 30) - 40 - X0;
  let headerBottom = Y0;
  if (title) { const t = text(X0, Y0, title, { fontSize: 28, maxWidth: headerMax, bold: true }); els.push(t); headerBottom = t.y + t.height; }
  if (subtitle) { const s = text(X0, headerBottom + 8, subtitle, { fontSize: 15, color: PALETTE.sub, maxWidth: headerMax }); els.push(s); headerBottom = s.y + s.height; }

  // meta card (topo-direita), dimensionado ao conteúdo
  const metaW = W + 30;
  const metaX = X0 + PER_ROW * (W + HGAP) - metaW;
  let metaBottom = Y0;
  if (meta.length) {
    const header = text(metaX + 14, Y0 + 12, "Contexto", { fontSize: 14, color: PALETTE.metaStroke, bold: true });
    let yy = Y0 + 40;
    const placed = [];
    for (const m of meta) { const ln = text(metaX + 14, yy, `${m.label}: ${m.value}`, { fontSize: 12, color: PALETTE.ink, maxWidth: metaW - 28 }); placed.push(ln); yy += ln.height + 6; }
    const mh = yy - Y0 + 8;
    els.push(rect(metaX, Y0, metaW, mh, { bg: PALETTE.metaBg, stroke: PALETTE.metaStroke }), header, ...placed);
    metaBottom = Y0 + mh;
  }

  // lane de estágios (serpentina) — começa abaixo do cabeçalho e do card de contexto
  const startY = Math.max(headerBottom, metaBottom) + 34;
  const pos = [];
  stages.forEach((s, i) => {
    const row = Math.floor(i / PER_ROW);
    const colInRow = i % PER_ROW;
    const physCol = row % 2 === 0 ? colInRow : PER_ROW - 1 - colInRow;
    const x = X0 + physCol * (W + HGAP);
    const y = startY + row * (H + VGAP);
    pos.push({ x, y, row });
    const isStart = i === 0, isEnd = i === stages.length - 1;
    const bg = isStart ? PALETTE.startBg : isEnd ? PALETTE.endBg : PALETTE.stageBg;
    const st = isStart ? PALETTE.startStroke : isEnd ? PALETTE.endStroke : PALETTE.stageStroke;
    els.push(rect(x, y, W, H, { bg, stroke: st }));
    els.push(text(x + 14, y + 12, `${i + 1}. ${s.title}`, { fontSize: 15, color: st, bold: true, maxWidth: W - 28 }));
    const items = (s.items || []).map((it) => `• ${it}`).join("\n");
    if (items) els.push(text(x + 14, y + 44, items, { fontSize: 12, color: PALETTE.ink, maxWidth: W - 28 }));
  });

  // setas entre estágios consecutivos
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i], b = pos[i + 1];
    if (a.row === b.row) {
      const leftToRight = b.x > a.x;
      const ax = leftToRight ? a.x + W : a.x;
      const bx = leftToRight ? b.x : b.x + W;
      els.push(arrow(ax, a.y + H / 2, bx, b.y + H / 2));
    } else {
      // transição de linha: desce da base do atual para o topo do próximo
      els.push(arrow(a.x + W / 2, a.y + H, b.x + W / 2, b.y));
    }
  }

  // painel de pendências
  const lastRow = pos.length ? pos[pos.length - 1].row : 0;
  let py = startY + (lastRow + 1) * (H + VGAP) + 10;
  if (pending.length) {
    els.push(text(X0, py, `Falta coletar — ${pending.length} itens pendentes`, { fontSize: 20, color: PALETTE.endStroke, bold: true, maxWidth: 1000 }));
    py += 40;
    const NW = 300, NH = 96, NG = 22, NCOL = 3;
    pending.forEach((p, i) => {
      const c = i % NCOL, r = Math.floor(i / NCOL);
      const x = X0 + c * (NW + NG);
      const y = py + r * (NH + NG);
      els.push(rect(x, y, NW, NH, { bg: PALETTE.noteBg, stroke: PALETTE.noteStroke }));
      els.push(text(x + 12, y + 10, `${i + 1}. ${p.title}`, { fontSize: 13, color: PALETTE.ink, bold: true, maxWidth: NW - 24 }));
      if (p.note) els.push(text(x + 12, y + 34, p.note, { fontSize: 10, color: PALETTE.sub, maxWidth: NW - 24 }));
    });
  }

  return els;
}

export const APPSTATE = { viewBackgroundColor: "#ffffff", gridSize: null };
