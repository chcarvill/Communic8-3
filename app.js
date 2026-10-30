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

/* Boards are the tabs across the top of the app. Each idea lives on   */
/* exactly one board via its category's `board` field — the board     */
/* itself isn't stored on the idea. "random" is the original board;    */
/* the others start out empty aside from a placeholder category so     */
/* there's somewhere for a newly-added idea to file under.             */
const BOARDS = [
  { id: "random", label: "Homepage", subtitle: "utilisable sales strategies" },
  { id: "content", label: "Content creation / marketing", subtitle: "posts, videos, and pieces to make" },
  { id: "f2f", label: "F2F sales campaigns", subtitle: "in-person pitches, meetups, and campaigns" },
  // The repository isn't a canvas board: it's its own page (no categories,
  // no calendar), so it's flagged `page` and skipped by the board logic.
  { id: "repository", label: "Ideas repository", subtitle: "a place to drop ideas before they have a home", page: true },
];

// Mediums offered when filing a repository idea ("Other" lets the person type their own).
const REPO_MEDIUMS = [
  "Video", "Social media post", "Email", "Newsletter", "Blog / article",
  "Podcast", "Episode", "Webinar / live stream", "Face-to-face", "Phone call",
  "Text / DM", "Print / flyer", "Event / workshop",
];
const REPO_OTHER = "Other";
const REPO_EPISODE = "Episode"; // choosing this also asks for the series name
const BOARD_DEFAULT_COLOR = { content: "amber", f2f: "clay" };
// Where Mission Control (and its Do tab) lives -- used by "Send to Do" to
// hand a content idea's brief description and strategic objective across.
const MISSION_CONTROL_URL = "https://chcarvill.github.io/Mission-Control/";

let STATE = {
  categories: [],     // [{id, label, color, board}]
  ideas: [],           // [{id, category, title, description}]
  children: [],         // [{id, ideaId, type: 'creation'|'application', done:false, scheduledDate: null|'YYYY-MM-DD', parked:false, canvasX, canvasY}]
  canvasPositions: {}, // ideaId -> {x,y}  (idea card positions on canvas)
  currentBoard: "random",
  repository: [],      // [{id, text, mediums:[string], created:ISO}]
};

let viewWeekStart = startOfWeek(new Date());
let viewMonthStart = startOfMonth(new Date());
let calendarViewMode = "week"; // 'week' | 'month'
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
  }
  migrateState();
  saveToStorage();
  wireBoardTabs();
  render();
}

/* Brings older saved boards up to date with the tab reorg: tags any     */
/* pre-existing category as "random" (the original, un-tabbed board),    */
/* and makes sure every newer board has at least one category to file    */
/* an idea under. Safe to run every boot — a no-op once already migrated.*/
function migrateState() {
  STATE.categories.forEach((c) => {
    if (!c.board) c.board = "random";
  });
  BOARDS.forEach((b) => {
    if (b.id === "random" || b.page) return;
    const hasCategory = STATE.categories.some((c) => c.board === b.id);
    if (!hasCategory) {
      STATE.categories.push({
        id: b.id + "-general",
        label: "General",
        color: BOARD_DEFAULT_COLOR[b.id] || "gray",
        board: b.id,
      });
    }
  });
  if (!STATE.currentBoard) STATE.currentBoard = "random";
  if (!Array.isArray(STATE.repository)) STATE.repository = [];
}

/* ---------------------------------------------------------- */
/* Board (tab) helpers                                          */
/* ---------------------------------------------------------- */

function currentBoardCategories() {
  return STATE.categories.filter((c) => c.board === STATE.currentBoard);
}

function ideaBoard(idea) {
  const cat = categoryById(idea.category);
  return cat ? cat.board : null;
}

function isIdeaInCurrentBoard(idea) {
  return ideaBoard(idea) === STATE.currentBoard;
}

function isChildInCurrentBoard(child) {
  const idea = ideaById(child.ideaId);
  return !!idea && isIdeaInCurrentBoard(idea);
}

function wireBoardTabs() {
  document.querySelectorAll(".board-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const boardId = btn.dataset.board;
      if (boardId === STATE.currentBoard) return;
      STATE.currentBoard = boardId;
      syncTabUI();
      saveToStorage();
      render();
    });
  });
  syncTabUI();
}

/* Highlights the active tab, updates the subtitle, and swaps between the  */
/* canvas/calendar layout and the repository page. Also runs on load so a  */
/* reopened app lands on the tab it was last left on.                      */
function syncTabUI() {
  const boardId = STATE.currentBoard;
  document.querySelectorAll(".board-tab").forEach((b) => b.classList.toggle("active", b.dataset.board === boardId));
  const board = BOARDS.find((b) => b.id === boardId);
  const subtitleEl = document.querySelector("header .subtitle");
  if (board && subtitleEl) subtitleEl.textContent = board.subtitle;
  const isRepo = !!(board && board.page);
  document.getElementById("toolbar").style.display = isRepo ? "none" : "";
  document.getElementById("main-split").style.display = isRepo ? "none" : "";
  document.getElementById("repo-view").style.display = isRepo ? "block" : "none";
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
  // (scoped to the active board's categories — other boards' clusters don't apply here)
  const bounds = {};
  currentBoardCategories().forEach((cat) => {
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

function startOfMonth(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* a month "grid" always shows full Mon-Sun weeks, so it includes the   */
/* tail of the previous month and the start of the next to fill out the */
/* first and last rows — each returned day knows if it's in-month.      */
function monthGridWeeks(monthStart) {
  const gridStart = startOfWeek(monthStart);
  const monthIndex = monthStart.getMonth();
  const weeks = [];
  let cursor = new Date(gridStart);

  // a calendar month needs at most 6 weeks to fully contain it
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === monthIndex });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // stop once we've completed the month and filled its last week
    if (cursor.getMonth() !== monthIndex && week.some((d) => d.inMonth)) {
      // we've just stepped past the month's last day and finished that row
      break;
    }
  }
  return weeks;
}

/* ---------------------------------------------------------- */
/* Rendering                                                     */
/* ---------------------------------------------------------- */

function render() {
  const board = BOARDS.find((b) => b.id === STATE.currentBoard);
  if (board && board.page) {
    renderRepoStats();
    renderRepository();
    return;
  }
  renderStats();
  renderCanvas();
  renderStaging();
  renderCalendar();
}

function renderStats() {
  const boardIdeas = STATE.ideas.filter(isIdeaInCurrentBoard);
  const boardChildren = STATE.children.filter(isChildInCurrentBoard);
  const total = boardIdeas.length;
  const spawned = boardChildren.length;
  const scheduled = boardChildren.filter((c) => c.scheduledDate).length;
  const done = boardChildren.filter((c) => c.done).length;
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
  currentBoardCategories().forEach((cat) => {
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

  const boardIdeas = STATE.ideas.filter(isIdeaInCurrentBoard);
  if (!boardIdeas.length) {
    const empty = document.createElement("div");
    empty.id = "canvas-empty";
    empty.style.cssText =
      "position:absolute; left:40px; top:40px; font-family:var(--serif); font-style:italic; " +
      "font-size:14px; color:var(--ink-soft); max-width:320px;";
    empty.innerHTML = "Nothing on this board yet. Click <b>+ New idea</b> above to start it.";
    canvas.appendChild(empty);
  }

  boardIdeas.forEach((idea) => {
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
    const canSendToDo = STATE.currentBoard === "content" && (idea.strategicObjective || idea.description);

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
        ${canSendToDo ? `<button class="spawn-btn send-to-do" data-action="send-to-do" data-idea="${idea.id}" title="Open in Mission Control's Do, ready to add as a task">→ Send to Do</button>` : ""}
      </div>
      <div class="idea-children"></div>
    `;

    // a parked child (spawned, no date, dragged back onto the canvas) lives
    // embedded right here on its parent idea card. Dragging it back to the
    // staging row (or anywhere on the canvas, to re-park) toggles between
    // the two; giving it a date sends it to the calendar from either place.
    const childSlot = card.querySelector(".idea-children");
    [creationChild, applicationChild].forEach((child) => {
      if (child && child.parked && !child.scheduledDate) {
        childSlot.appendChild(buildChildCardEl(child, { hideParent: true }));
      }
    });

    canvas.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------- */
/* Staging panel — holds spawned creation/application tiles    */
/* that are actively being scheduled: no scheduledDate yet, and */
/* not parked back on their idea card. Setting a date (here, or */
/* by dragging straight onto a calendar day) moves a tile out   */
/* of staging; clearing a calendar date brings it back here.    */
/* Dragging a staging tile onto the canvas parks it back on its */
/* idea card instead — see wireCanvasDropTarget.                */
/* ---------------------------------------------------------- */

function renderStaging() {
  const row = document.getElementById("staging-row");
  row.innerHTML = "";

  const active = STATE.children.filter((c) => !c.scheduledDate && !c.parked && isChildInCurrentBoard(c));

  if (!active.length) {
    const empty = document.createElement("div");
    empty.id = "staging-empty";
    empty.textContent = "Nothing waiting — spawned tiles will land here until you give them a date.";
    row.appendChild(empty);
  } else {
    active.forEach((child) => row.appendChild(buildChildCardEl(child)));
  }
}

/* wired once on init — #staging-row itself is reused across renders */
/* (only its contents are replaced), so listeners go here, not above. */
function wireStagingDropTarget() {
  const row = document.getElementById("staging-row");
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (!dragPayload) return;
    const child = childById(dragPayload.childId);
    if (!child) return;
    child.scheduledDate = null;
    child.parked = false; // dropping in staging always re-activates it, even if it came from being parked
    saveToStorage();
    render();
  });
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
    if (e.target.closest(".child-card")) return; // don't drag the idea card when interacting with an embedded chip (date field, icons, or dragging the chip itself)

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
    parked: false, // false = sitting in the staging panel; true = parked back on its idea card
  };
  STATE.children.push(child);
  saveToStorage();
  render();
}

/* ---------------------------------------------------------- */
/* Child card builder (used on idea cards and on the calendar)  */
/* ---------------------------------------------------------- */

function buildChildCardEl(child, opts = {}) {
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
      ${child.scheduledDate ? `<span class="unschedule-toggle" data-action="unschedule" data-child="${child.id}" title="Clear date — sends it back to the staging panel">⤺</span>` : ""}
    </div>
    ${opts.hideParent ? "" : `<div class="child-parent">${escapeHtml(idea ? idea.title : "Unknown idea")}</div>`}
    <div class="schedule-row">
      <label class="schedule-label">${child.scheduledDate ? "Scheduled" : "Schedule for…"}</label>
      <input type="date" class="schedule-date-input" data-child="${child.id}" value="${child.scheduledDate || ""}" />
    </div>
  `;

  const dateInput = el.querySelector(".schedule-date-input");
  dateInput.addEventListener("click", (e) => e.stopPropagation());
  dateInput.addEventListener("change", (e) => {
    child.scheduledDate = e.target.value || null;
    if (child.scheduledDate) child.parked = false; // a dated tile is never "parked"
    saveToStorage();
    render();
  });

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
/* Calendar — week view and month view share one nav row;        */
/* calendarViewMode picks which grid is visible and what the     */
/* Prev/Next/Today buttons operate on.                           */
/* ---------------------------------------------------------- */

function renderCalendar() {
  if (calendarViewMode === "month") {
    document.getElementById("calendar-grid").style.display = "none";
    document.getElementById("calendar-month-grid").style.display = "flex";
    renderCalendarMonth();
  } else {
    document.getElementById("calendar-grid").style.display = "grid";
    document.getElementById("calendar-month-grid").style.display = "none";
    renderCalendarWeek();
  }
}

function renderCalendarWeek() {
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

    const dayChildren = STATE.children.filter((c) => c.scheduledDate === fmtISO(day) && isChildInCurrentBoard(c));
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
      child.parked = false; // a dated tile is never "parked"
      saveToStorage();
      render();
    });

    col.appendChild(dropZone);
    grid.appendChild(col);
  });
}

/* Month view shows compact dots rather than full cards — clicking a    */
/* day jumps into week view for that day's week, where the full cards   */
/* (and drag/date/unschedule controls) live.                            */
function renderCalendarMonth() {
  const container = document.getElementById("calendar-month-grid");
  container.innerHTML = "";

  const today = new Date();
  const weeks = monthGridWeeks(viewMonthStart);

  const label = viewMonthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("week-label").textContent = label;

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "month-weekday-row";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
    const span = document.createElement("span");
    span.textContent = d;
    weekdayRow.appendChild(span);
  });
  container.appendChild(weekdayRow);

  const weeksWrap = document.createElement("div");
  weeksWrap.className = "month-weeks";

  weeks.forEach((week) => {
    const weekRow = document.createElement("div");
    weekRow.className = "month-week-row";

    week.forEach(({ date, inMonth }) => {
      const iso = fmtISO(date);
      const cell = document.createElement("div");
      cell.className = "month-cell" + (inMonth ? "" : " outside-month") + (isSameDay(date, today) ? " today" : "");

      const dayChildren = STATE.children.filter((c) => c.scheduledDate === iso && isChildInCurrentBoard(c));
      const maxDots = 6;
      const shown = dayChildren.slice(0, maxDots);
      const overflowCount = dayChildren.length - shown.length;

      const dotsHtml = shown
        .map((c) => `<span class="month-dot ${c.type}${c.done ? " done" : ""}" title="${escapeHtml((ideaById(c.ideaId) || {}).title || "")}"></span>`)
        .join("");

      cell.innerHTML = `
        <span class="month-date">${date.getDate()}</span>
        <span class="month-dots">${dotsHtml}${overflowCount > 0 ? `<span class="month-overflow">+${overflowCount}</span>` : ""}</span>
      `;

      cell.addEventListener("click", () => {
        viewWeekStart = startOfWeek(date);
        calendarViewMode = "week";
        setViewToggleUI();
        renderCalendar();
      });

      weekRow.appendChild(cell);
    });

    weeksWrap.appendChild(weekRow);
  });

  container.appendChild(weeksWrap);
}

function setViewToggleUI() {
  document.getElementById("btn-view-week").classList.toggle("active", calendarViewMode === "week");
  document.getElementById("btn-view-month").classList.toggle("active", calendarViewMode === "month");
}

/* ---------------------------------------------------------- */
/* Email backups — two flavours:                                 */
/*  - "Calendar" : just what's currently scheduled, as a dated   */
/*    itinerary. Useful as a quick "what's coming up" share.     */
/*  - "Full board": every idea, every spawned child (wherever it  */
/*    currently sits — parked, staging, or scheduled), plus a     */
/*    compact raw-data block at the end so the board could be      */
/*    reconstructed by hand if ever needed.                       */
/* Both open as a mailto: link with a pre-filled subject/body,    */
/* matching the email-snapshot pattern used across the other      */
/* apps — no server, no account, just your own mail client.       */
/* ---------------------------------------------------------- */

function statusLabel(child) {
  if (child.scheduledDate) return `scheduled ${child.scheduledDate}${child.done ? " — done" : ""}`;
  if (child.parked) return "parked on idea card";
  return "in staging, no date yet";
}

function buildCalendarEmailBody() {
  const scheduled = STATE.children.filter((c) => c.scheduledDate);
  scheduled.sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0));

  const lines = [];
  lines.push("COMMUNIC8 — CALENDAR SNAPSHOT");
  lines.push(new Date().toLocaleString());
  lines.push("");

  if (!scheduled.length) {
    lines.push("Nothing is currently scheduled on the calendar.");
  } else {
    let lastDate = null;
    scheduled.forEach((child) => {
      if (child.scheduledDate !== lastDate) {
        lines.push("");
        lines.push(`— ${child.scheduledDate} —`);
        lastDate = child.scheduledDate;
      }
      const idea = ideaById(child.ideaId);
      const typeLabel = child.type === "creation" ? "Build" : "Do";
      const doneTag = child.done ? " [done]" : "";
      lines.push(`  • [${typeLabel}] ${idea ? idea.title : "Unknown idea"}${doneTag}`);
    });
  }

  lines.push("");
  lines.push(`Total scheduled: ${scheduled.length} (${scheduled.filter((c) => c.done).length} done)`);
  return lines.join("\n");
}

function buildFullBoardEmailBody() {
  const lines = [];
  lines.push("COMMUNIC8 — FULL BOARD BACKUP");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`${STATE.ideas.length} ideas, ${STATE.children.length} spawned task${STATE.children.length === 1 ? "" : "s"}`);
  lines.push("");

  STATE.categories.forEach((cat) => {
    const ideasInCat = STATE.ideas.filter((i) => i.category === cat.id);
    if (!ideasInCat.length) return;
    lines.push(`=== ${cat.label} ===`);
    ideasInCat.forEach((idea) => {
      lines.push(`• ${idea.title}`);
      if (idea.description) lines.push(`   ${idea.description}`);
      const kids = STATE.children.filter((c) => c.ideaId === idea.id);
      kids.forEach((child) => {
        const typeLabel = child.type === "creation" ? "Build" : "Do";
        lines.push(`   - [${typeLabel}] ${statusLabel(child)}`);
      });
    });
    lines.push("");
  });

  if (STATE.repository && STATE.repository.length) {
    lines.push("=== Ideas repository ===");
    STATE.repository.forEach((i) => {
      lines.push(`• ${i.text.replace(/\s*\n\s*/g, " ")}`);
      lines.push(`   Medium: ${(i.mediums || []).join(", ") || "—"}${i.series ? " (series: " + i.series + ")" : ""}`);
      if (i.calendarDate) lines.push(`   On homepage calendar: ${i.calendarDate}`);
    });
    lines.push("");
  }

  lines.push("");
  lines.push("---");
  lines.push("Raw data (for backup / re-import — do not edit by hand):");
  lines.push(JSON.stringify(STATE));
  return lines.join("\n");
}

function openMailto(subject, body) {
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // mailto: links have practical length limits in some clients; if the body
  // is very large (e.g. a big board with lots of history), warn rather than
  // silently truncate, so nothing important gets lost without the person knowing.
  if (url.length > 1800) {
    const proceed = confirm(
      "This backup is fairly large and some email apps may cut off long mailto links. " +
      "It should still work in most mail clients, but if the email arrives empty or truncated, " +
      "consider copying the board data manually instead. Open email now?"
    );
    if (!proceed) return;
  }
  window.location.href = url;
}

function wireEmailActions() {
  document.getElementById("btn-email-calendar").addEventListener("click", () => {
    const body = buildCalendarEmailBody();
    openMailto("Communic8 — Calendar snapshot", body);
  });
  document.getElementById("btn-email-board").addEventListener("click", () => {
    const body = buildFullBoardEmailBody();
    openMailto("Communic8 — Full board backup", body);
  });
}

/* dropping a card onto the canvas parks it back on its parent idea  */
/* card — no exact spot to aim for, since a parked tile's position   */
/* is always derived from its idea, not stored x/y.                  */
function wireCanvasDropTarget() {
  const canvasWrap = document.getElementById("canvas-wrap");
  canvasWrap.addEventListener("dragover", (e) => e.preventDefault());
  canvasWrap.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragPayload) return;
    const child = childById(dragPayload.childId);
    if (!child) return;
    child.scheduledDate = null;
    child.parked = true;
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

  const sendToDoBtn = e.target.closest("[data-action='send-to-do']");
  if (sendToDoBtn) {
    const idea = STATE.ideas.find((i) => i.id === sendToDoBtn.dataset.idea);
    if (idea) {
      const desc = idea.description ? idea.description : idea.title;
      const params = new URLSearchParams({
        c8title: idea.title,
        c8desc: desc,
        c8strategic: idea.strategicObjective || "",
      });
      // A real <a> click (rather than window.open()) is handled more
      // reliably by installed-app runtimes on mobile -- it's treated as a
      // genuine link tap, so it opens in the system browser instead of
      // risking hijacking this app's own single window.
      const link = document.createElement("a");
      link.href = MISSION_CONTROL_URL + "?" + params.toString();
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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

  const unscheduleBtn = e.target.closest("[data-action='unschedule']");
  if (unscheduleBtn) {
    const child = childById(unscheduleBtn.dataset.child);
    if (child) {
      child.scheduledDate = null;
      child.parked = false; // unscheduling sends it to the staging panel, matching its tooltip
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

  document.getElementById("btn-view-week").addEventListener("click", () => {
    // if we navigated the month view away from today, landing back on an
    // unrelated week would be just as confusing as the month-sync issue
    // above -- so default to the first week of whatever month was shown,
    // unless today actually falls within it.
    const today = new Date();
    if (calendarViewMode === "month") {
      viewWeekStart =
        today.getFullYear() === viewMonthStart.getFullYear() && today.getMonth() === viewMonthStart.getMonth()
          ? startOfWeek(today)
          : startOfWeek(viewMonthStart);
    }
    calendarViewMode = "week";
    setViewToggleUI();
    renderCalendar();
  });
  document.getElementById("btn-view-month").addEventListener("click", () => {
    // land on whichever month the currently-viewed week falls in, so
    // switching views doesn't jump you somewhere unrelated to what you
    // were just looking at.
    viewMonthStart = startOfMonth(viewWeekStart);
    calendarViewMode = "month";
    setViewToggleUI();
    renderCalendar();
  });

  document.getElementById("btn-prev-week").addEventListener("click", () => {
    if (calendarViewMode === "month") {
      viewMonthStart = startOfMonth(new Date(viewMonthStart.getFullYear(), viewMonthStart.getMonth() - 1, 1));
    } else {
      viewWeekStart.setDate(viewWeekStart.getDate() - 7);
    }
    renderCalendar();
  });
  document.getElementById("btn-next-week").addEventListener("click", () => {
    if (calendarViewMode === "month") {
      viewMonthStart = startOfMonth(new Date(viewMonthStart.getFullYear(), viewMonthStart.getMonth() + 1, 1));
    } else {
      viewWeekStart.setDate(viewWeekStart.getDate() + 7);
    }
    renderCalendar();
  });
  document.getElementById("btn-today").addEventListener("click", () => {
    viewWeekStart = startOfWeek(new Date());
    viewMonthStart = startOfMonth(new Date());
    renderCalendar();
  });

  /* Divider drag-to-resize between canvas and the staging/calendar area below */
  const divider = document.getElementById("divider");
  const canvasWrap = document.getElementById("canvas-wrap");
  const stagingWrap = document.getElementById("staging-wrap");
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
    const stagingH = stagingWrap.getBoundingClientRect().height;
    const minH = 140;
    const maxH = splitRect.height - minH - stagingH - 60; // leave room for staging panel + calendar
    const clamped = Math.max(minH, Math.min(maxH, fromTop));
    canvasWrap.style.flex = `0 0 ${clamped}px`;
    calendarWrap.style.flex = `1 1 auto`;
  });
  window.addEventListener("mouseup", () => (resizing = false));

  /* Modal: add new idea */
  const overlay = document.getElementById("modal-overlay");
  const catSelect = document.getElementById("modal-category");
  const newCatRow = document.getElementById("modal-new-category-row");
  const newCatInput = document.getElementById("modal-new-category-name");
  const NEW_CATEGORY_VALUE = "__new__";

  function refreshCatSelect() {
    const boardCats = currentBoardCategories();
    const options = boardCats.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`);
    options.push(`<option value="${NEW_CATEGORY_VALUE}">+ New category…</option>`);
    catSelect.innerHTML = options.join("");
    // an empty board (e.g. a freshly-added tab) has nothing to pick but
    // "+ New category" — select it and show the name field immediately
    // instead of making the person discover it in the dropdown.
    if (!boardCats.length) {
      catSelect.value = NEW_CATEGORY_VALUE;
      newCatRow.style.display = "block";
    } else {
      newCatRow.style.display = "none";
    }
  }

  catSelect.addEventListener("change", () => {
    newCatRow.style.display = catSelect.value === NEW_CATEGORY_VALUE ? "block" : "none";
  });

  document.getElementById("btn-add-idea").addEventListener("click", () => {
    refreshCatSelect();
    document.getElementById("modal-title").value = "";
    document.getElementById("modal-desc").value = "";
    newCatInput.value = "";

    const isContentBoard = STATE.currentBoard === "content";
    document.getElementById("modal-content-fields").style.display = isContentBoard ? "block" : "none";
    document.getElementById("modal-desc-label").textContent = isContentBoard ? "Brief description" : "Description (optional)";
    if (isContentBoard) {
      ["modal-content-strategic", "modal-content-market", "modal-content-purpose", "modal-content-location",
       "modal-content-channel", "modal-content-segments", "modal-content-plan-date", "modal-content-film-date"]
        .forEach((id) => { document.getElementById(id).value = ""; });
    }

    overlay.classList.add("open");
  });

  document.getElementById("btn-cancel-modal").addEventListener("click", () => {
    overlay.classList.remove("open");
  });

  document.getElementById("btn-save-idea").addEventListener("click", () => {
    const title = document.getElementById("modal-title").value.trim();
    if (!title) return;

    let categoryId = catSelect.value;

    if (categoryId === NEW_CATEGORY_VALUE) {
      const label = newCatInput.value.trim();
      if (!label) {
        newCatInput.focus();
        return;
      }
      categoryId = "cat_" + Date.now();
      const colorCycle = Object.keys(CATEGORY_COLOR_VARS);
      const colorIndex = currentBoardCategories().length % colorCycle.length;
      STATE.categories.push({
        id: categoryId,
        label,
        color: BOARD_DEFAULT_COLOR[STATE.currentBoard] || colorCycle[colorIndex],
        board: STATE.currentBoard,
      });
    }

    const id = "custom_" + Date.now();
    const idea = {
      id,
      category: categoryId,
      title,
      description: document.getElementById("modal-desc").value.trim(),
    };
    if (STATE.currentBoard === "content") {
      idea.strategicObjective = document.getElementById("modal-content-strategic").value.trim();
      idea.market = document.getElementById("modal-content-market").value.trim();
      idea.purpose = document.getElementById("modal-content-purpose").value.trim();
      idea.location = document.getElementById("modal-content-location").value.trim();
      idea.channel = document.getElementById("modal-content-channel").value.trim();
      idea.segments = document.getElementById("modal-content-segments").value.trim();
      idea.planDate = document.getElementById("modal-content-plan-date").value || null;
      idea.filmDate = document.getElementById("modal-content-film-date").value || null;
    }
    STATE.ideas.push(idea);

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
/* Ideas repository                                              */
/* Step 1: type the idea.  Step 2: choose the medium(s) it       */
/* relates to.  Only then is it saved. Stored in                 */
/* STATE.repository, so it persists and is included in the full  */
/* board backup email alongside everything else.                 */
/* ---------------------------------------------------------- */

let repoPendingMediums = [];   // mediums chosen in the open step-2 prompt
let repoFilterMedium = null;   // null = show all
let repoEditingId = null;      // id of the idea being re-filed, or null when adding

function renderRepoStats() {
  const list = STATE.repository;
  const tagged = list.filter((i) => i.mediums && i.mediums.length).length;
  document.getElementById("header-stats").innerHTML = `
    <span><b>${list.length}</b> ideas captured</span>
    <span><b>${tagged}</b> with a medium</span>
    <span><b>${list.filter((i) => i.calendarDate).length}</b> on the homepage</span>
  `;
}

function repoAllMediums() {
  // preset list + any custom "Other" mediums already used, so they can be filtered/re-picked
  const custom = [];
  STATE.repository.forEach((i) => (i.mediums || []).forEach((m) => {
    if (!REPO_MEDIUMS.includes(m) && !custom.includes(m)) custom.push(m);
  }));
  return REPO_MEDIUMS.concat(custom);
}

function renderRepoMediumChips() {
  const wrap = document.getElementById("repo-medium-chips");
  const all = repoAllMediums().concat([REPO_OTHER]);
  wrap.innerHTML = all.map((m) => {
    const selected = m === REPO_OTHER
      ? repoPendingMediums.includes(REPO_OTHER)
      : repoPendingMediums.includes(m);
    return `<button type="button" class="medium-chip${selected ? " selected" : ""}" data-medium="${escapeHtml(m)}">${escapeHtml(m)}</button>`;
  }).join("");
  document.getElementById("repo-other-medium").style.display = repoPendingMediums.includes(REPO_OTHER) ? "block" : "none";
  document.getElementById("repo-series-name").style.display = repoPendingMediums.includes(REPO_EPISODE) ? "block" : "none";
}

function renderRepository() {
  // filter chips
  const used = [];
  STATE.repository.forEach((i) => (i.mediums || []).forEach((m) => { if (!used.includes(m)) used.push(m); }));
  const filterEl = document.getElementById("repo-filter");
  if (!used.length) {
    filterEl.innerHTML = "";
  } else {
    filterEl.innerHTML =
      `<button type="button" class="medium-chip${repoFilterMedium === null ? " selected" : ""}" data-filter="">All</button>` +
      used.map((m) => `<button type="button" class="medium-chip${repoFilterMedium === m ? " selected" : ""}" data-filter="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join("");
  }
  if (repoFilterMedium !== null && !used.includes(repoFilterMedium)) repoFilterMedium = null;

  const items = STATE.repository
    .filter((i) => repoFilterMedium === null || (i.mediums || []).includes(repoFilterMedium))
    .slice()
    .sort((a, b) => (a.created < b.created ? 1 : -1)); // newest first

  document.getElementById("repo-count").textContent = STATE.repository.length ? `(${items.length}${repoFilterMedium !== null ? " of " + STATE.repository.length : ""})` : "";

  const list = document.getElementById("repo-list");
  if (!items.length) {
    list.innerHTML = `<div class="repo-empty">${STATE.repository.length ? "No ideas with that medium yet." : "Nothing here yet. Add your first idea above."}</div>`;
    return;
  }
  list.innerHTML = items.map((i) => {
    const tags = (i.mediums && i.mediums.length)
      ? i.mediums.map((m) => `<span class="repo-tag">${escapeHtml(m === REPO_EPISODE && i.series ? m + " · " + i.series : m)}</span>`).join("")
      : `<span class="repo-tag none">No medium</span>`;
    const when = i.created ? new Date(i.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    const calTag = i.calendarDate
      ? `<span class="repo-tag cal">On homepage · ${escapeHtml(fmtShortDate(i.calendarDate))}</span>`
      : "";
    return `
      <div class="repo-item" data-repo-id="${i.id}">
        <div class="repo-item-body">
          <div class="repo-item-text">${escapeHtml(i.text)}</div>
          <div class="repo-item-meta">${tags}${calTag}<span class="repo-date">${when}</span></div>
        </div>
        <div class="repo-item-actions">
          ${i.calendarDate ? "" : `<button class="repo-icon-btn edit" data-repo-action="calendar" data-id="${i.id}" title="Add this idea to the homepage calendar">Add to calendar</button>`}
          <button class="repo-icon-btn edit" data-repo-action="refile" data-id="${i.id}" title="Change medium">Change medium</button>
          <button class="repo-icon-btn" data-repo-action="delete" data-id="${i.id}" title="Delete this idea">✕</button>
        </div>
      </div>`;
  }).join("");
}

function repoOpenMediumStep(existing) {
  repoPendingMediums = existing ? existing.mediums.slice() : [];
  // a previously-saved custom medium is just a chip of its own; nothing to retype
  document.getElementById("repo-other-medium").value = "";
  document.getElementById("repo-series-name").value = (existing && existing.series) || "";
  renderRepoMediumChips();
  document.getElementById("repo-medium").style.display = "block";
  document.getElementById("repo-step1-actions").style.display = "none";
  document.getElementById("repo-idea-input").readOnly = true;
  document.getElementById("repo-medium").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function repoCloseMediumStep() {
  document.getElementById("repo-medium").style.display = "none";
  document.getElementById("repo-step1-actions").style.display = "flex";
  document.getElementById("repo-idea-input").readOnly = false;
  repoPendingMediums = [];
  repoEditingId = null;
}


/* ---------------------------------------------------------- */
/* Repository -> Homepage calendar                               */
/* After an idea is saved, offer to put it on the Homepage       */
/* calendar. That creates a regular idea card (filed under        */
/* "From ideas repository") plus a Do/Build task on the chosen   */
/* date, exactly like one made on the Homepage itself.           */
/* ---------------------------------------------------------- */

const REPO_CALENDAR_CATEGORY = "cat_from_repository";
let repoCalItemId = null;
let repoCalType = "application";

function fmtShortDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function repoOpenCalendarStep(itemId, justSaved) {
  const item = STATE.repository.find((i) => i.id === itemId);
  if (!item) return;
  repoCalItemId = itemId;
  repoCalType = "application";
  document.getElementById("repo-cal-saved").style.display = justSaved ? "block" : "none";
  document.getElementById("repo-cal-quote").textContent = item.text;
  document.getElementById("repo-cal-choice").style.display = "flex";
  document.getElementById("repo-cal-form").style.display = "none";
  document.getElementById("repo-cal-done").style.display = "none";
  document.getElementById("repo-cal-date").value = fmtISO(new Date());
  repoRenderCalType();
  // swap the capture box for the prompt
  document.getElementById("repo-idea-input").style.display = "none";
  document.getElementById("repo-step1-actions").style.display = "none";
  document.getElementById("repo-medium").style.display = "none";
  document.getElementById("repo-calendar").style.display = "block";
  document.getElementById("repo-calendar").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function repoCloseCalendarStep() {
  document.getElementById("repo-calendar").style.display = "none";
  document.getElementById("repo-idea-input").style.display = "";
  document.getElementById("repo-step1-actions").style.display = "flex";
  repoCalItemId = null;
}

function repoRenderCalType() {
  document.querySelectorAll("#repo-cal-type .medium-chip").forEach((c) =>
    c.classList.toggle("selected", c.dataset.caltype === repoCalType));
}

/* Files the repository idea on the Homepage board and schedules it. */
function addRepoItemToCalendar(item, date, type) {
  let cat = STATE.categories.find((c) => c.id === REPO_CALENDAR_CATEGORY);
  if (!cat) {
    cat = { id: REPO_CALENDAR_CATEGORY, label: "From ideas repository", color: "teal", board: "random" };
    STATE.categories.push(cat);
  }

  const firstLine = item.text.split("\n")[0].trim();
  const title = firstLine.length > 70 ? firstLine.slice(0, 67).trimEnd() + "…" : firstLine;
  const mediumText = (item.mediums || []).map((m) => (m === REPO_EPISODE && item.series ? `${m} (${item.series})` : m)).join(", ");
  const descParts = [];
  if (item.text.trim() !== title) descParts.push(item.text.trim());
  if (mediumText) descParts.push("Medium: " + mediumText);

  const ideaId = "repoidea_" + Date.now();
  STATE.ideas.push({ id: ideaId, category: REPO_CALENDAR_CATEGORY, title, description: descParts.join("\n\n") });

  // same grid slot logic as the initial layout, so the card sits in its own cluster
  const ci = STATE.categories.indexOf(cat);
  const k = STATE.ideas.filter((i) => i.category === REPO_CALENDAR_CATEGORY).length - 1;
  STATE.canvasPositions[ideaId] = {
    x: 60 + (ci % 5) * 430 + (k % 2) * 205,
    y: 50 + Math.floor(ci / 5) * 300 + 38 + Math.floor(k / 2) * 150,
  };

  STATE.children.push({
    id: "c_" + ideaId + "_" + type + "_" + Date.now(),
    ideaId, type, done: false, scheduledDate: date, parked: false,
  });

  item.calendarIdeaId = ideaId;
  item.calendarDate = date;
}

function wireRepoCalendar() {
  document.getElementById("btn-repo-cal-no").addEventListener("click", () => {
    repoCloseCalendarStep();
  });
  document.getElementById("btn-repo-cal-yes").addEventListener("click", () => {
    document.getElementById("repo-cal-choice").style.display = "none";
    document.getElementById("repo-cal-form").style.display = "block";
  });
  document.getElementById("btn-repo-cal-cancel").addEventListener("click", () => {
    repoCloseCalendarStep();
  });
  document.getElementById("repo-cal-type").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-caltype]");
    if (!chip) return;
    repoCalType = chip.dataset.caltype;
    repoRenderCalType();
  });
  document.getElementById("btn-repo-cal-add").addEventListener("click", () => {
    const dateEl = document.getElementById("repo-cal-date");
    if (!dateEl.value) { dateEl.focus(); return; }
    const item = STATE.repository.find((i) => i.id === repoCalItemId);
    if (!item) return;
    addRepoItemToCalendar(item, dateEl.value, repoCalType);
    saveToStorage();
    renderRepoStats();
    renderRepository();
    document.getElementById("repo-cal-form").style.display = "none";
    document.getElementById("repo-cal-saved").style.display = "none";
    document.getElementById("repo-cal-done-msg").textContent =
      `✓ Added to the homepage calendar for ${fmtShortDate(dateEl.value)}.`;
    document.getElementById("repo-cal-done").style.display = "block";
    document.getElementById("repo-cal-done").dataset.date = dateEl.value;
  });
  document.getElementById("btn-repo-cal-close").addEventListener("click", repoCloseCalendarStep);
  document.getElementById("btn-repo-cal-go").addEventListener("click", () => {
    const date = document.getElementById("repo-cal-done").dataset.date;
    repoCloseCalendarStep();
    STATE.currentBoard = "random";
    viewWeekStart = startOfWeek(new Date(date + "T00:00:00"));
    calendarViewMode = "week";
    setViewToggleUI();
    syncTabUI();
    saveToStorage();
    render();
  });
}

function wireRepository() {
  const input = document.getElementById("repo-idea-input");

  document.getElementById("btn-repo-next").addEventListener("click", () => {
    if (!input.value.trim()) { input.focus(); return; }
    repoEditingId = null;
    repoOpenMediumStep(null);
  });

  document.getElementById("btn-repo-cancel").addEventListener("click", () => {
    // when re-filing an existing idea, the textarea was just a stand-in for it
    if (repoEditingId) input.value = "";
    repoCloseMediumStep();
  });

  document.getElementById("repo-medium-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".medium-chip");
    if (!chip) return;
    const m = chip.dataset.medium;
    const idx = repoPendingMediums.indexOf(m);
    if (idx === -1) repoPendingMediums.push(m); else repoPendingMediums.splice(idx, 1);
    renderRepoMediumChips();
    if (idx === -1 && m === REPO_OTHER) document.getElementById("repo-other-medium").focus();
    if (idx === -1 && m === REPO_EPISODE) document.getElementById("repo-series-name").focus();
  });

  document.getElementById("btn-repo-save").addEventListener("click", () => {
    let mediums = repoPendingMediums.filter((m) => m !== REPO_OTHER);
    if (repoPendingMediums.includes(REPO_OTHER)) {
      const custom = document.getElementById("repo-other-medium").value.trim();
      if (!custom) { document.getElementById("repo-other-medium").focus(); return; }
      if (!mediums.includes(custom)) mediums.push(custom);
    }
    let series = "";
    if (repoPendingMediums.includes(REPO_EPISODE)) {
      series = document.getElementById("repo-series-name").value.trim();
      if (!series) { document.getElementById("repo-series-name").focus(); return; }
    }
    if (!mediums.length) {
      // the question is the point of this step -- don't let it be skipped silently
      document.getElementById("repo-medium-chips").animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
        { duration: 200 }
      );
      return;
    }

    let newRepoId = null;
    if (repoEditingId) {
      const item = STATE.repository.find((i) => i.id === repoEditingId);
      if (item) {
        item.mediums = mediums;
        if (series) item.series = series; else delete item.series;
      }
      input.value = "";
    } else {
      const entry = {
        id: "repo_" + Date.now(),
        text: input.value.trim(),
        mediums,
        created: new Date().toISOString(),
      };
      if (series) entry.series = series;
      STATE.repository.push(entry);
      newRepoId = entry.id;
      input.value = "";
    }
    repoCloseMediumStep();
    saveToStorage();
    render();
    if (newRepoId) repoOpenCalendarStep(newRepoId, true);
  });

  wireRepoCalendar();

  document.getElementById("repo-filter").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    repoFilterMedium = chip.dataset.filter === "" ? null : chip.dataset.filter;
    renderRepository();
  });

  document.getElementById("repo-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-repo-action]");
    if (!btn) return;
    const item = STATE.repository.find((i) => i.id === btn.dataset.id);
    if (!item) return;
    if (btn.dataset.repoAction === "delete") {
      if (!confirm("Delete this idea from the repository?")) return;
      STATE.repository = STATE.repository.filter((i) => i.id !== item.id);
      saveToStorage();
      render();
    } else if (btn.dataset.repoAction === "calendar") {
      repoOpenCalendarStep(item.id, false);
      document.getElementById("repo-view").scrollTop = 0;
      window.scrollTo(0, 0);
    } else if (btn.dataset.repoAction === "refile") {
      repoEditingId = item.id;
      input.value = item.text;
      repoOpenMediumStep(item);
      window.scrollTo(0, 0);
      document.getElementById("repo-view").scrollTop = 0;
    }
  });
}

/* ---------------------------------------------------------- */
/* Go                                                              */
/* ---------------------------------------------------------- */

function init() {
  wireCanvasDropTarget();
  wireStagingDropTarget();
  wireToolbar();
  wireCanvasDragController();
  wireEmailActions();
  wireRepository();
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
