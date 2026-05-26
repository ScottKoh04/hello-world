let allCourses = [];
let completed = new Set();
let placed = {};      // code -> semId
let activeTrack = "All";
let searchQuery = "";

// Prerequisite check: prereqs is array of groups (OR of ANDs)
function isAvailable(course) {
  if (!course.prerequisites || course.prerequisites.length === 0) return true;
  return course.prerequisites.some(group =>
    group.every(code => completed.has(code))
  );
}

function semBadge(semesters) {
  if (!semesters || semesters.length === 0) return `<span class="badge badge-both">Any</span>`;
  if (semesters.length === 2) return `<span class="badge badge-both">S1 &amp; S2</span>`;
  if (semesters[0] === 1) return `<span class="badge badge-s1">Sem 1</span>`;
  return `<span class="badge badge-s2">Sem 2</span>`;
}

function missingPrereqs(course) {
  if (!course.prerequisites || course.prerequisites.length === 0) return [];
  // Find the "best" group (fewest missing) to show what's needed
  let bestMissing = null;
  for (const group of course.prerequisites) {
    const missing = group.filter(code => !completed.has(code));
    if (bestMissing === null || missing.length < bestMissing.length) {
      bestMissing = missing;
    }
  }
  return bestMissing || [];
}

function buildCard(course) {
  const available = isAvailable(course);
  const isPlaced = course.code in placed;
  const isRequired = course.type === "required";
  const isFYP = course.type === "fyp";

  let statusClass = available ? "available" : "locked";
  if (isRequired) statusClass = "";
  if (isFYP) statusClass = "";

  let typeClass = `type-${course.type}`;
  if (isPlaced) typeClass += " placed";

  const draggable = (available || isRequired || isFYP) && !isPlaced;

  const missing = !available ? missingPrereqs(course) : [];

  return `
    <div class="course-card ${statusClass} ${typeClass}"
         data-code="${course.code}"
         draggable="${draggable}">
      <div class="card-top">
        <span class="card-code">${course.code}</span>
        <div class="card-badges">
          <span class="badge badge-au">${course.au} AU</span>
          ${semBadge(course.semesters)}
        </div>
      </div>
      <div class="card-name">${course.name}</div>
      <div class="card-tracks">
        ${course.tracks.map(t => `<span class="track-tag">${t}</span>`).join("")}
      </div>
      ${course.note ? `<div class="card-note">${course.note}</div>` : ""}
      ${missing.length ? `<div class="lock-msg">Needs: ${missing.join(", ")}</div>` : ""}
    </div>
  `;
}

function renderCourseList() {
  const list = document.getElementById("courseList");
  let filtered = allCourses.filter(c => {
    const matchTrack = activeTrack === "All" || c.tracks.includes(activeTrack);
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q);
    return matchTrack && matchSearch;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p class="loading">No courses match.</p>`;
    return;
  }

  // Sort: required first, then available, then locked
  filtered.sort((a, b) => {
    const typeOrder = { required: 0, fyp: 1, elective: 2 };
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    const aAvail = isAvailable(a) ? 0 : 1;
    const bAvail = isAvailable(b) ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return a.code.localeCompare(b.code);
  });

  list.innerHTML = filtered.map(buildCard).join("");

  // Attach drag events
  list.querySelectorAll(".course-card[draggable='true']").forEach(card => {
    card.addEventListener("dragstart", e => {
      e.dataTransfer.setData("courseCode", card.dataset.code);
      e.dataTransfer.effectAllowed = "move";
    });
  });
}

function buildPlacedCard(course, semId) {
  return `
    <div class="placed-card type-${course.type}" data-code="${course.code}">
      <div class="placed-info">
        <strong>${course.code}</strong>
        <span>${course.name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span class="placed-au">${course.au} AU</span>
        <button class="remove-btn" data-code="${course.code}" data-sem="${semId}" title="Remove">×</button>
      </div>
    </div>
  `;
}

function updateAU() {
  const semIds = ["y3s1", "y3s2", "y4s1", "y4s2"];
  let total = 0;
  semIds.forEach(semId => {
    const courses = Object.entries(placed)
      .filter(([, s]) => s === semId)
      .map(([code]) => allCourses.find(c => c.code === code))
      .filter(Boolean);
    const au = courses.reduce((sum, c) => sum + c.au, 0);
    document.getElementById(`au-${semId}`).textContent = au;
    total += au;
  });
  document.getElementById("totalAU").textContent = total;
}

function renderDropZones() {
  const semIds = ["y3s1", "y3s2", "y4s1", "y4s2"];
  semIds.forEach(semId => {
    const zone = document.getElementById(`drop-${semId}`);
    const courses = Object.entries(placed)
      .filter(([, s]) => s === semId)
      .map(([code]) => allCourses.find(c => c.code === code))
      .filter(Boolean);
    zone.innerHTML = courses.map(c => buildPlacedCard(c, semId)).join("");

    // Remove buttons
    zone.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const code = btn.dataset.code;
        delete placed[code];
        renderDropZones();
        renderCourseList();
        updateAU();
      });
    });
  });
  updateAU();
}

function setupDropZones() {
  document.querySelectorAll(".drop-zone").forEach(zone => {
    zone.addEventListener("dragover", e => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("drag-over");

      const code = e.dataTransfer.getData("courseCode");
      const semId = zone.id.replace("drop-", "");
      const course = allCourses.find(c => c.code === code);
      if (!course) return;

      // Semester compatibility check
      const semNum = parseInt(zone.dataset.semnum);
      if (course.semesters && course.semesters.length > 0 &&
          !course.semesters.includes(semNum)) {
        const semLabel = semNum === 1 ? "Semester 1" : "Semester 2";
        alert(`${course.code} is only offered in ${course.semesters.map(s => `Semester ${s}`).join(" or ")}, not ${semLabel}.`);
        return;
      }

      // If already placed somewhere else, move it
      if (code in placed) {
        delete placed[code];
      }
      placed[code] = semId;

      renderDropZones();
      renderCourseList();
    });
  });
}

function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTrack = btn.dataset.track;
      renderCourseList();
    });
  });

  document.getElementById("search").addEventListener("input", e => {
    searchQuery = e.target.value;
    renderCourseList();
  });
}

async function init() {
  const res = await fetch("/api/courses");
  const data = await res.json();

  completed = new Set(data.completed);
  allCourses = data.courses;

  renderCourseList();
  setupDropZones();
  setupFilters();
}

init();
