/* ============================================================
   Communic8 — Marketing & Sales Board
   Vanilla JS. No build step. No frameworks.
   Data persists to localStorage; seed data comes from
   data-embedded.js (a JS copy of data.json) on first run only.
   ============================================================ */

const STORAGE_KEY = "communic8_marketing_state_v1";

const CATEGORY_COLOR_VARS = {
  coral: "coral", amber: "amber", teal: "teal", blue: "blue",
  gray: "gray", purple: "purple", green: "green", pink: "pink"
};

let STATE = {
  categories: [],     // [{id, label, color}]
  ideas: [],           // [{id, category, title, description}]
  children: [],         // [{id, ideaId, type: 'creation'|'application', done:false, scheduledDate: null|'YYYY-MM-DD', canvasX, canvasY}]
  canvasPositions: {}, // ideaId -> {x,y}  (idea card positions on canvas)
};

let viewWeekStart = startOfWeek(new Date());
let dragPayload = null; // { childId } while dragging

/* ---------------------------------------------------------- */
/* Bootstrapping                                                */
/* ---------------------------------------------------------- */

async function boot() {
  const saved = loadFromStorage();
  if (saved) {
    STATE = saved;
  } else {
    // Seed data is loaded via a plain <script> tag (data-embedded.js) rather
    // than fetch(), because fetch() of local files is blocked by browsers
    // under the file:// protocol — this way the app works the moment you
    // double-click index.html, with no local server required.
    const seed = window.__COMMUNIC8_SEED_DATA__;
    if (!seed) {
      console.error("Seed data not found — make sure data-embedded.js is loaded before app.js.");
      return;
    }
    STATE.categories = seed.categories;
    STATE.ideas = seed.ideas;
    STATE.children = [];
    STATE.canvasPositions = {};
    layoutCanvasPositions(); // initial clustered layout
    saveToStorage();
  }
  render();
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not load saved state, starting fresh.", e);
    return null;
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    console.warn("Could not save state.", e);
  }
}

/* ---------------------------------------------------------- */
/* Canvas layout — loose clustering by category, with jitter   */
/* ---------------------------------------------------------- */

function layoutCanvasPositions() {
  const cols = 5;
  const cellW = 430;
  const cellH = 300;
  const catIndex = {};
  STATE.categories.forEach((c, i) => (catIndex[c.id] = i));

  const grouped = {};
  STATE.ideas.forEach((idea) => {
    grouped[idea.category] = grouped[idea.category] || [];
    grouped[idea.category].push(idea);
  });

  STATE.categories.forEach((cat, ci) => {
    const col = ci % cols;
    const row = Math.floor(ci / cols);
    const baseX = 60 + col * cellW;
    const baseY = 50 + row * cellH;
    const ideas = grouped[cat.id] || [];

    ideas.forEach((idea, ii) => {
      const subCol = ii % 2;
      const subRow = Math.floor(ii / 2);
      const jitterX = (Math.random() - 0.5) * 18;
      const jitterY = (Math.random() - 0.5) * 18;
      STATE.canvasPositions[idea.id] = {
        x: baseX + subCol * 205 + jitterX,
        y: baseY + 38 + subRow * 150 + jitterY,
      };
    });
  });
}

function clusterBounds() {
  // compute a bounding box per category from current idea positions, for the halo
  const bounds = {};
  STATE.categories.forEach((cat) => {
    const ideas = STATE.ideas.filter((i) => i.category === cat.id);
    if (!ideas.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ideas.forEach((idea) => {
      const p = STATE.canvasPositions[idea.id];
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + 190);
      maxY = Math.max(maxY, p.y + 130);
    });
    if (minX === Infinity) return;
    bounds[cat.id] = { x: minX - 22, y: minY - 36, w: (maxX - minX) + 44, h: (maxY - minY) + 56 };
  });
  return bounds;
}

/* ---------------------------------------------------------- */
/* Date helpers                                                  */
/* ---------------------------------------------------------- */

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // make Monday the start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return fmtISO(a) === fmtISO(b);
}

function weekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

/* ---------------------------------------------------------- */
/* Rendering                                                     */
/* ---------------------------------------------------------- */

function render() {
  renderStats();
  renderCanvas();
  renderTray();
  renderCalendar();
}

function renderStats() {
  const total = STATE.ideas.length;
  const spawned = STATE.children.length;
  const scheduled = STATE.children.filter((c) => c.scheduledDate).length;
  const done = STATE.children.filter((c) => c.done).length;
  document.getElementById("header-stats").innerHTML = `
    <span><b>${total}</b> ideas</span>
    <span><b>${spawned}</b> in motion</span>
    <span><b>${scheduled}</b> on the calendar</span>
    <span><b>${done}</b> completed</span>
  `;
}

function categoryById(id) {
  return STATE.categories.find((c) => c.id === id);
}

function ideaById(id) {
  return STATE.ideas.find((i) => i.id === id);
}

function childById(id) {
  return STATE.children.find((c) => c.id === id);
}

function renderCanvas() {
  const canvas = document.getElementById("canvas");
  const filterText = (document.getElementById("search").value || "").toLowerCase().trim();
  canvas.innerHTML = "";

  // halos first (so cards render above them)
  const bounds = clusterBounds();
  STATE.categories.forEach((cat) => {
    const b = bounds[cat.id];
    if (!b) return;
    const halo = document.createElement("div");
    halo.className = "cluster-halo";
    halo.style.left = b.x + "px";
    halo.style.top = b.y + "px";
    halo.style.width = b.w + "px";
    halo.style.height = b.h + "px";
    halo.style.background = `var(--${cat.color}-tint)`;
    canvas.appendChild(halo);

    const label = document.createElement("div");
    label.className = "cluster-label";
    label.style.left = b.x + 10 + "px";
    label.style.top = b.y - 4 + "px";
    label.textContent = cat.label;
    canvas.appendChild(label);
  });

  STATE.ideas.forEach((idea) => {
    if (filterText) {
      const hay = (idea.title + " " + (idea.description || "")).toLowerCase();
      if (!hay.includes(filterText)) return;
    }
    const pos = STATE.canvasPositions[idea.id] || { x: 40, y: 40 };
    const cat = categoryById(idea.category);
    const card = document.createElement("div");
    card.className = "idea-card";
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
    card.dataset.ideaId = idea.id;

    const creationChild = STATE.children.find((c) => c.ideaId === idea.id && c.type === "creation");
    const applicationChild = STATE.children.find((c) => c.ideaId === idea.id && c.type === "application");

    card.innerHTML = `
      <span class="cat-tag" style="color: var(--${cat.color});">${escapeHtml(cat.label)}</span>
      <div class="idea-title">${escapeHtml(idea.title)}</div>
      <div class="idea-desc">${escapeHtml(idea.description || "")}</div>
      <div class="spawn-row">
        <button class="spawn-btn creation ${creationChild ? "spawned" : ""}" data-action="spawn-creation" data-idea="${idea.id}">
          <img src="assets/icon-creation.png" alt="" /> ${creationChild ? "Building ✓" : "Build it"}
        </button>
        <button class="spawn-btn application ${applicationChild ? "spawned" : ""}" data-action="spawn-application" data-idea="${idea.id}">
          <img src="assets/icon-application.png" alt="" /> ${applicationChild ? "Doing ✓" : "Do it"}
        </button>
      </div>
    `;

    canvas.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------- */
/* Idea card dragging (repositioning within canvas)             */
/* One delegated drag controller for the whole canvas, rather   */
/* than per-card window listeners — avoids listener buildup     */
/* across repeated re-renders.                                  */
/* ---------------------------------------------------------- */

let canvasDragState = null; // { ideaId, startX, startY, origX, origY, cardEl }

function wireCanvasDragController() {
  const canvasWrap = document.getElementById("canvas-wrap");

  canvasWrap.addEventListener("mousedown", (e) => {
    const card = e.target.closest(".idea-card");
    if (!card) return;
    if (e.target.closest(".spawn-btn")) return; // don't drag when clicking a button

    const ideaId = card.dataset.ideaId;
    const pos = STATE.canvasPositions[ideaId];
    if (!pos) return;

    canvasDragState = {
      ideaId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      cardEl: card,
    };
    card.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!canvasDragState) return;
    const dx = e.clientX - canvasDragState.startX;
    const dy = e.clientY - canvasDragState.startY;
    const newX = canvasDragState.origX + dx;
    const newY = canvasDragState.origY + dy;
    STATE.canvasPositions[canvasDragState.ideaId] = { x: newX, y: newY };
    canvasDragState.cardEl.style.left = newX + "px";
    canvasDragState.cardEl.style.top = newY + "px";
  });

  window.addEventListener("mouseup", () => {
    if (!canvasDragState) return;
    canvasDragState.cardEl.classList.remove("dragging");
    canvasDragState = null;
    saveToStorage();
    renderCanvas(); // redraw halos to fit new position
  });
}

/* ---------------------------------------------------------- */
/* Spawning children                                             */
/* ---------------------------------------------------------- */

function spawnChild(ideaId, type) {
  const exists = STATE.children.find((c) => c.ideaId === ideaId && c.type === type);
  if (exists) return; // one creation + one application per idea
  const child = {
    id: "c_" + ideaId + "_" + type + "_" + Date.now(),
    ideaId,
    type, // 'creation' | 'application'
    done: false,
    scheduledDate: null,
  };
  STATE.children.push(child);
  saveToStorage();
  render();
}

/* ---------------------------------------------------------- */
/* Tray (unscheduled children)                                   */
/* ---------------------------------------------------------- */

function renderTray() {
  const wrap = document.getElementById("tray-items");
  wrap.innerHTML = "";
  const unscheduled = STATE.children.filter((c) => !c.scheduledDate);

  if (!unscheduled.length) {
    wrap.innerHTML = `<span style="font-size:12px; color:var(--ink-soft); font-style:italic;">Nothing waiting — spawn a "Build it" or "Do it" card from any idea above.</span>`;
    return;
  }

  unscheduled.forEach((child) => {
    wrap.appendChild(buildChildCardEl(child));
  });
}

function buildChildCardEl(child) {
  const idea = ideaById(child.ideaId);
  const el = document.createElement("div");
  el.className = `child-card ${child.type} ${child.done ? "done" : ""}`;
  el.draggable = true;
  el.dataset.childId = child.id;

  const icon = child.type === "creation" ? "assets/icon-creation.png" : "assets/icon-application.png";
  const label = child.type === "creation" ? "Creation" : "Application";

  el.innerHTML = `
    <div class="child-head">
      <img src="${icon}" alt="" />
      ${label}
      <span class="done-toggle" data-action="toggle-done" data-child="${child.id}">${child.done ? "↺" : "✓"}</span>
    </div>
    <div class="child-parent">${escapeHtml(idea ? idea.title : "Unknown idea")}</div>
  `;

  el.addEventListener("dragstart", (e) => {
    dragPayload = { childId: child.id };
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    dragPayload = null;
  });

  return el;
}

/* ---------------------------------------------------------- */
/* Calendar                                                       */
/* ---------------------------------------------------------- */

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const days = weekDays(viewWeekStart);
  const today = new Date();

  const label = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  document.getElementById("week-label").textContent = label;

  days.forEach((day) => {
    const col = document.createElement("div");
    col.className = "day-col" + (isSameDay(day, today) ? " today" : "");

    const header = document.createElement("div");
    header.className = "day-col-header";
    header.innerHTML = `
      <div class="day-name">${day.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div class="day-date">${day.getDate()}</div>
    `;
    col.appendChild(header);

    const dropZone = document.createElement("div");
    dropZone.className = "day-drop-zone";
    dropZone.dataset.date = fmtISO(day);

    const dayChildren = STATE.children.filter((c) => c.scheduledDate === fmtISO(day));
    dayChildren.forEach((child) => dropZone.appendChild(buildChildCardEl(child)));

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (!dragPayload) return;
      const child = childById(dragPayload.childId);
      if (!child) return;
      child.scheduledDate = dropZone.dataset.date;
      saveToStorage();
      render();
    });

    col.appendChild(dropZone);
    grid.appendChild(col);
  });
}

/* allow dropping back onto the unscheduled tray */
function wireTrayDropTarget() {
  const tray = document.getElementById("unscheduled-tray");
  tray.addEventListener("dragover", (e) => e.preventDefault());
  tray.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragPayload) return;
    const child = childById(dragPayload.childId);
    if (!child) return;
    child.scheduledDate = null;
    saveToStorage();
    render();
  });
}

/* ---------------------------------------------------------- */
/* Event delegation for buttons rendered dynamically             */
/* ---------------------------------------------------------- */

document.addEventListener("click", (e) => {
  const spawnBtn = e.target.closest("[data-action='spawn-creation'], [data-action='spawn-application']");
  if (spawnBtn) {
    const ideaId = spawnBtn.dataset.idea;
    const type = spawnBtn.dataset.action === "spawn-creation" ? "creation" : "application";
    spawnChild(ideaId, type);
    return;
  }

  const toggleBtn = e.target.closest("[data-action='toggle-done']");
  if (toggleBtn) {
    const child = childById(toggleBtn.dataset.child);
    if (child) {
      child.done = !child.done;
      saveToStorage();
      render();
    }
    return;
  }
});

/* ---------------------------------------------------------- */
/* Toolbar interactions                                          */
/* ---------------------------------------------------------- */

function wireToolbar() {
  document.getElementById("search").addEventListener("input", renderCanvas);

  document.getElementById("btn-prev-week").addEventListener("click", () => {
    viewWeekStart.setDate(viewWeekStart.getDate() - 7);
    renderCalendar();
  });
  document.getElementById("btn-next-week").addEventListener("click", () => {
    viewWeekStart.setDate(viewWeekStart.getDate() + 7);
    renderCalendar();
  });
  document.getElementById("btn-today").addEventListener("click", () => {
    viewWeekStart = startOfWeek(new Date());
    renderCalendar();
  });

  /* Divider drag-to-resize between canvas and calendar */
  const divider = document.getElementById("divider");
  const canvasWrap = document.getElementById("canvas-wrap");
  const calendarWrap = document.getElementById("calendar-wrap");
  let resizing = false;

  divider.addEventListener("mousedown", (e) => {
    resizing = true;
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!resizing) return;
    const splitRect = document.getElementById("main-split").getBoundingClientRect();
    const fromTop = e.clientY - splitRect.top;
    const minH = 140;
    const maxH = splitRect.height - minH - 60; // leave room for calendar + tray
    const clamped = Math.max(minH, Math.min(maxH, fromTop));
    canvasWrap.style.flex = `0 0 ${clamped}px`;
    calendarWrap.style.flex = `1 1 auto`;
  });
  window.addEventListener("mouseup", () => (resizing = false));

  /* Modal: add new idea */
  const overlay = document.getElementById("modal-overlay");
  const catSelect = document.getElementById("modal-category");

  document.getElementById("btn-add-idea").addEventListener("click", () => {
    catSelect.innerHTML = STATE.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("");
    document.getElementById("modal-title").value = "";
    document.getElementById("modal-desc").value = "";
    overlay.classList.add("open");
  });

  document.getElementById("btn-cancel-modal").addEventListener("click", () => {
    overlay.classList.remove("open");
  });

  document.getElementById("btn-save-idea").addEventListener("click", () => {
    const title = document.getElementById("modal-title").value.trim();
    if (!title) return;
    const id = "custom_" + Date.now();
    const categoryId = catSelect.value;
    STATE.ideas.push({
      id,
      category: categoryId,
      title,
      description: document.getElementById("modal-desc").value.trim(),
    });

    // place new card near its category cluster, with slight randomness
    const bounds = clusterBounds();
    const b = bounds[categoryId];
    STATE.canvasPositions[id] = b
      ? { x: b.x + 20 + Math.random() * 40, y: b.y + b.h + 10 }
      : { x: 80 + Math.random() * 200, y: 80 + Math.random() * 200 };

    saveToStorage();
    overlay.classList.remove("open");
    render();
  });
}

/* ---------------------------------------------------------- */
/* Go                                                              */
/* ---------------------------------------------------------- */

function init() {
  wireTrayDropTarget();
  wireToolbar();
  wireCanvasDragController();
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  // DOM is already parsed (script is at end of body) — run immediately
  init();
}

/* ---------------------------------------------------------- */
/* PWA service worker registration                               */
/* Only works over https:// (or localhost) — browsers block       */
/* service workers on file:// for security reasons, so this        */
/* silently does nothing when opened as a local file. That's       */
/* expected: the app still works fine locally, it just won't be    */
/* installable as a home-screen app until it's hosted.             */
/* ---------------------------------------------------------- */

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
