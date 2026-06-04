/**
 * Code Map explorer (STORY-014).
 *
 * Renders the structural map from /api/codemap: files grouped by architectural
 * layer, each with its symbols + endpoints; click a file for its edges. Supports
 * fuzzy search and a diff-impact overlay (from /api/codemap/diff-impact). Reads
 * only real API data — empty states are shown, never mock data.
 */
(function () {
  "use strict";

  const LAYERS = ["db", "backend", "frontend", "shared"];
  const state = { map: null, loaded: false, impactedFiles: new Set(), changedFiles: new Set() };

  const el = (id) => document.getElementById(id);

  function symbolsByFile(map) {
    const byFile = new Map();
    for (const n of map.nodes || []) {
      if (n.kind === "file") {
        if (!byFile.has(n.file)) byFile.set(n.file, { layer: n.layer || "shared", symbols: [], endpoints: [] });
        else byFile.get(n.file).layer = n.layer || "shared";
      } else {
        const entry = byFile.get(n.file) || { layer: n.layer || "shared", symbols: [], endpoints: [] };
        entry.symbols.push(n);
        byFile.set(n.file, entry);
      }
    }
    for (const e of map.endpoints || []) {
      const entry = byFile.get(e.file) || { layer: "backend", symbols: [], endpoints: [] };
      entry.endpoints.push(e);
      byFile.set(e.file, entry);
    }
    return byFile;
  }

  function renderSummary(map) {
    const summary = el("codemap-summary");
    if (map.available === false) {
      summary.innerHTML = `<p class="codemap-empty">${map.reason || "No code map available."}</p>`;
      return false;
    }
    const counts = (map.nodes || []).reduce((acc, n) => ((acc[n.kind] = (acc[n.kind] || 0) + 1), acc), {});
    summary.innerHTML =
      `<span>${counts.file || 0} files</span> · <span>${(counts.function || 0) + (counts.method || 0)} functions</span> · ` +
      `<span>${counts.class || 0} classes</span> · <span>${counts.model || 0} models</span> · ` +
      `<span>${(map.endpoints || []).length} endpoints</span> · <span>${(map.unresolvedImports || []).length} unresolved imports</span>` +
      `<br><small>built from ${map.builtFromRevision ? map.builtFromRevision.slice(0, 8) : "(no git)"}</small>`;
    return true;
  }

  function renderLegend() {
    el("codemap-legend").innerHTML = LAYERS.map(
      (l) => `<span class="codemap-chip layer-${l}">${l}</span>`
    ).join(" ");
  }

  function render() {
    const map = state.map;
    if (!map) return;
    if (!renderSummary(map)) {
      el("codemap-grid").innerHTML = "";
      el("codemap-legend").innerHTML = "";
      return;
    }
    renderLegend();
    const query = (el("codemap-search").value || "").toLowerCase();
    const byFile = symbolsByFile(map);
    const grid = el("codemap-grid");

    const cols = LAYERS.map((layer) => {
      const files = [...byFile.entries()]
        .filter(([, v]) => v.layer === layer)
        .filter(([file, v]) =>
          !query ||
          file.toLowerCase().includes(query) ||
          v.symbols.some((s) => s.name.toLowerCase().includes(query)) ||
          v.endpoints.some((e) => `${e.method} ${e.path}`.toLowerCase().includes(query))
        )
        .sort(([a], [b]) => a.localeCompare(b));

      const cards = files
        .map(([file, v]) => {
          const cls =
            "codemap-file" +
            (state.changedFiles.has(file) ? " changed" : "") +
            (state.impactedFiles.has(file) ? " impacted" : "");
          const eps = v.endpoints
            .map((e) => `<span class="codemap-endpoint">${e.method} ${e.path}</span>`)
            .join("");
          return (
            `<div class="${cls}" data-file="${encodeURIComponent(file)}" tabindex="0">` +
            `<div class="codemap-file-name">${file}</div>` +
            (eps ? `<div class="codemap-endpoints">${eps}</div>` : "") +
            `<div class="codemap-symcount">${v.symbols.length} symbols</div>` +
            `</div>`
          );
        })
        .join("");

      return `<div class="codemap-col"><h3 class="layer-${layer}">${layer} (${files.length})</h3>${cards || '<p class="codemap-empty">—</p>'}</div>`;
    }).join("");

    grid.innerHTML = cols;
    grid.querySelectorAll(".codemap-file").forEach((node) => {
      const handler = () => showDetail(decodeURIComponent(node.dataset.file));
      node.addEventListener("click", handler);
      node.addEventListener("keypress", (ev) => {
        if (ev.key === "Enter") handler();
      });
    });
  }

  function showDetail(file) {
    const map = state.map;
    const detail = el("codemap-detail");
    const fileSymbolIds = new Set((map.nodes || []).filter((n) => n.file === file).map((n) => n.id));
    const importsOut = (map.edges || []).filter((e) => e.kind === "imports" && e.from === file).map((e) => e.to);
    const importedBy = (map.edges || []).filter((e) => e.kind === "imports" && e.to === file).map((e) => e.from);
    const routes = (map.edges || []).filter((e) => e.kind === "declares-route" && fileSymbolIds.has(e.from));

    detail.hidden = false;
    detail.innerHTML =
      `<h3>${file}</h3>` +
      `<p><strong>Imports:</strong> ${importsOut.length ? importsOut.join(", ") : "—"}</p>` +
      `<p><strong>Imported by:</strong> ${importedBy.length ? importedBy.join(", ") : "—"}</p>` +
      `<p><strong>Declares routes:</strong> ${routes.length}</p>` +
      `<button class="btn" id="codemap-detail-close">Close</button>`;
    el("codemap-detail-close").addEventListener("click", () => (detail.hidden = true));
  }

  async function loadMap() {
    try {
      const res = await fetch("/api/codemap");
      state.map = await res.json();
      state.loaded = true;
      render();
    } catch (err) {
      el("codemap-grid").innerHTML = `<p class="codemap-error">Failed to load code map: ${err.message}</p>`;
    }
  }

  async function toggleDiff(on) {
    if (!on) {
      state.impactedFiles = new Set();
      state.changedFiles = new Set();
      render();
      return;
    }
    try {
      const res = await fetch("/api/codemap/diff-impact");
      const data = await res.json();
      if (data.available === false) {
        el("codemap-summary").insertAdjacentHTML("beforeend", `<p class="codemap-empty">${data.reason}</p>`);
        return;
      }
      state.impactedFiles = new Set((data.impacted || []).map((n) => n.file));
      state.changedFiles = new Set((data.changed || []).map((n) => n.file));
      render();
    } catch (err) {
      el("codemap-grid").insertAdjacentHTML("beforeend", `<p class="codemap-error">Diff impact failed: ${err.message}</p>`);
    }
  }

  function init() {
    const tab = document.querySelector('.tab[data-tab="codemap"]');
    if (tab) tab.addEventListener("click", () => { if (!state.loaded) loadMap(); });
    const search = el("codemap-search");
    if (search) search.addEventListener("input", () => state.loaded && render());
    const toggle = el("codemap-diff-toggle");
    if (toggle) toggle.addEventListener("change", (e) => toggleDiff(e.target.checked));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
