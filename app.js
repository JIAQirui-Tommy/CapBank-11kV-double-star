const STARS = ["Star 1", "Star 2"];
const PHASES = [
  { key: "R", name: "Red", className: "red", angle: 0 },
  { key: "Y", name: "Yellow", className: "yellow", angle: -120 },
  { key: "B", name: "Blue", className: "blue", angle: 120 },
];
const SLOTS_PER_BRANCH = 3;
const TOTAL_CAPS = STARS.length * PHASES.length * SLOTS_PER_BRANCH;
const MAX_RECOMMENDED_SWAP_PAIRS = 4;
const MIN_DISPLAYED_IMPROVEMENT_MA = 0.01;
const SAME_CAPACITANCE_TOLERANCE_UF = 0.005;

const bankEl = document.querySelector("#bank");
const lineVoltageEl = document.querySelector("#lineVoltage");
const frequencyEl = document.querySelector("#frequency");
const nominalCapEl = document.querySelector("#nominalCap");
const swapPairsEl = document.querySelector("#swapPairs");
const beamWidthEl = document.querySelector("#beamWidth");
const downloadTemplateEl = document.querySelector("#downloadTemplate");
const loadCsvEl = document.querySelector("#loadCsv");
const csvInputEl = document.querySelector("#csvInput");
const currentUnbalanceEl = document.querySelector("#currentUnbalance");
const bestUnbalanceEl = document.querySelector("#bestUnbalance");
const improvementEl = document.querySelector("#improvement");
const movedCountEl = document.querySelector("#movedCount");
const swapListEl = document.querySelector("#swapList");
const depthTableEl = document.querySelector("#depthTable");
const detailListEl = document.querySelector("#detailList");
const applyBestEl = document.querySelector("#applyBest");
const exportRecordEl = document.querySelector("#exportRecord");

let capacitors = [];
let lastBest = null;
let lastSwapRecord = null;
let appliedHighlights = new Map();

function slotMeta(index) {
  const branchSize = SLOTS_PER_BRANCH;
  const phaseIndex = Math.floor(index / branchSize) % PHASES.length;
  const starIndex = Math.floor(index / (branchSize * PHASES.length));
  const slotIndex = (index % branchSize) + 1;
  return {
    starIndex,
    starName: STARS[starIndex],
    phase: PHASES[phaseIndex],
    slotIndex,
    label: `${STARS[starIndex]} ${PHASES[phaseIndex].key}${slotIndex}`,
  };
}

function capIdForSlot(index) {
  const meta = slotMeta(index);
  const starKey = meta.starIndex === 0 ? "A" : "B";
  return `${starKey}${meta.phase.key}${meta.slotIndex}`;
}

function makeDefaultCaps() {
  const nominal = readNumber(nominalCapEl, 22);
  return Array.from({ length: TOTAL_CAPS }, (_, index) => ({
    id: capIdForSlot(index),
    uf: nominal,
  }));
}

function readNumber(el, fallback) {
  const value = Number.parseFloat(el.value);
  return Number.isFinite(value) ? value : fallback;
}

function formatMilliAmps(value) {
  return `${value.toFixed(2)} mA`;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function clearRenderedHighlights() {
  document.querySelectorAll(".cap-slot").forEach((slot) => {
    slot.classList.remove("is-moved", "move-a", "move-b", "move-c", "move-d", "move-e", "move-f");
  });
}

function clearOptimizationState() {
  lastBest = null;
  lastSwapRecord = null;
  appliedHighlights = new Map();
  applyBestEl.disabled = true;
  exportRecordEl.disabled = true;
}

function roundsToDisplayedZero(value) {
  return Number(value.toFixed(2)) === 0;
}

function isMeaningfulSwap(layout, a, b) {
  return Math.abs(layout[a].uf - layout[b].uf) >= SAME_CAPACITANCE_TOLERANCE_UF;
}

function renderBank() {
  bankEl.innerHTML = "";
  STARS.forEach((starName, starIndex) => {
    const star = document.createElement("section");
    star.className = "star";
    star.innerHTML = `
      <div class="star-header">
        <h2>${starName}</h2>
        <span id="star-${starIndex}-residual">0 μF</span>
      </div>
      <div class="phase-grid"></div>
    `;

    const phaseGrid = star.querySelector(".phase-grid");
    PHASES.forEach((phase, phaseIndex) => {
      const phaseEl = document.createElement("div");
      phaseEl.className = `phase ${phase.className}`;
      phaseEl.innerHTML = `
        <div class="phase-title">
          <span>${phase.name} Phase ${phase.key}</span>
          <small id="branch-${starIndex}-${phaseIndex}">0 μF</small>
        </div>
      `;

      for (let slot = 0; slot < SLOTS_PER_BRANCH; slot += 1) {
        const index =
          starIndex * PHASES.length * SLOTS_PER_BRANCH +
          phaseIndex * SLOTS_PER_BRANCH +
          slot;
        const cap = capacitors[index];
        const highlightClass = appliedHighlights.get(cap.id);
        const slotEl = document.createElement("label");
        slotEl.className = `cap-slot ${highlightClass ? `is-moved ${highlightClass}` : ""}`;
        slotEl.innerHTML = `
          <div class="slot-top">
            <span class="cap-id">${cap.id}</span>
            <span class="cap-badge">Moved</span>
            <span class="cap-pos">${cap.id}</span>
          </div>
          <input data-index="${index}" type="number" min="0" step="0.01" value="${cap.uf}" aria-label="${cap.id} capacity microfarads" />
        `;
        phaseEl.appendChild(slotEl);
      }

      phaseGrid.appendChild(phaseEl);
    });

    bankEl.appendChild(star);
  });
}

function syncCapsFromInputs() {
  document.querySelectorAll("[data-index]").forEach((input) => {
    const index = Number.parseInt(input.dataset.index, 10);
    capacitors[index].uf = readNumber(input, capacitors[index].uf);
  });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeCapId(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (/^[AB][RYB][123]$/.test(text)) return text;
  if (/^[RYB][12][123]$/.test(text)) {
    const starKey = text[1] === "1" ? "A" : "B";
    return `${starKey}${text[0]}${text[2]}`;
  }
  return null;
}

function parseCapacity(value) {
  const text = String(value ?? "").replace(/^\uFEFF/, "").replace(/,/g, "").trim();
  if (normalizeCapId(text)) return null;
  const cleaned = text.replace(/\s*(μF|uF|microfarads?|mfd)\s*$/i, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function valuesFromCsv(text) {
  const rows = parseCsvRows(text);
  const valuesById = new Map();
  const numericValues = [];

  rows.forEach((row) => {
    const capColumn = row.findIndex((cell) => normalizeCapId(cell));
    if (capColumn >= 0) {
      const capId = normalizeCapId(row[capColumn]);
      const value = row
        .map((cell, index) => (index === capColumn ? null : parseCapacity(cell)))
        .find((number) => number !== null);
      if (capId && value !== null) valuesById.set(capId, value);
      return;
    }

    row.forEach((cell) => {
      const value = parseCapacity(cell);
      if (value !== null) numericValues.push(value);
    });
  });

  if (capacitors.every((cap) => valuesById.has(cap.id))) {
    return capacitors.map((cap) => valuesById.get(cap.id));
  }

  if (numericValues.length >= TOTAL_CAPS) {
    return numericValues.slice(0, TOTAL_CAPS);
  }

  throw new Error("CSV must contain 18 capacitance values, either by capacitor ID or in layout order.");
}

function loadCsvText(text) {
  const values = valuesFromCsv(text);
  capacitors = capacitors.map((cap, index) => ({
    ...cap,
    uf: values[index],
  }));
  clearOptimizationState();
  renderBank();
  updateSummary();
}

function getSystem() {
  return {
    lineKv: readNumber(lineVoltageEl, 11),
    frequency: readNumber(frequencyEl, 50),
  };
}

function calculate(layout, system = getSystem()) {
  const lineVoltage = system.lineKv * 1000;
  const omega = 2 * Math.PI * system.frequency;
  const branchUf = Array.from({ length: STARS.length }, () =>
    Array.from({ length: PHASES.length }, () => 0),
  );

  layout.forEach((cap, index) => {
    const meta = slotMeta(index);
    branchUf[meta.starIndex][PHASES.indexOf(meta.phase)] += cap.uf;
  });

  const [ar, ay, ab] = branchUf[0];
  const [br, by, bb] = branchUf[1];
  const x = ar + ay + ab + br + by + bb;

  const s1 = br * (ay - ab);
  const s2 = ar * (bb - by);
  const s3 = ay * bb - ab * by;
  const s4 = ar * (by + bb);
  const s5 = br * (ay + ab);
  const realTerm = s1 + s2 + 2 * s3;
  const imagTerm = s4 - s5;
  const bal = Math.sqrt(realTerm * realTerm + 3 * imagTerm * imagTerm);

  const rawUnbalance = x > 0 ? (0.001 * lineVoltage * omega * bal) / (2 * x) : 0;
  const unbalance = Math.ceil(rawUnbalance * 1000) / 1000;

  const engineering = {
    ar,
    ay,
    ab,
    br,
    by,
    bb,
    x,
    s1,
    s2,
    s3,
    s4,
    s5,
    realTerm,
    imagTerm,
    bal,
    rawUnbalance,
  };

  return {
    unbalance,
    branchUf,
    engineering,
  };
}

function swapLayout(layout, a, b) {
  const next = layout.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function layoutKey(layout) {
  return layout.map((cap) => cap.id).join("|");
}

function movedFromOriginal(layout, original) {
  return layout.reduce((count, cap, index) => count + (cap.id === original[index].id ? 0 : 1), 0);
}

function swapsFromParents(state) {
  const swaps = [];
  let cursor = state;
  while (cursor && cursor.swap) {
    swaps.push(cursor.swap);
    cursor = cursor.parent;
  }
  return swaps.reverse();
}

function buildSwapRows(initialLayout, swaps) {
  const rows = [];
  let cursorLayout = initialLayout.slice();
  swaps.forEach(([a, b], index) => {
    const firstCap = cursorLayout[a];
    const secondCap = cursorLayout[b];
    rows.push({
      pair: index + 1,
      firstCap: firstCap.id,
      firstFrom: slotMeta(a).label,
      firstTo: slotMeta(b).label,
      firstUf: firstCap.uf,
      secondCap: secondCap.id,
      secondFrom: slotMeta(b).label,
      secondTo: slotMeta(a).label,
      secondUf: secondCap.uf,
    });
    cursorLayout = swapLayout(cursorLayout, a, b);
  });
  return rows;
}

function createSwapRecord(bestState) {
  const initialLayout = capacitors.map((cap) => ({ ...cap }));
  const finalLayout = bestState.layout.map((cap) => ({ ...cap }));
  const swaps = swapsFromParents(bestState);
  const before = calculate(initialLayout);
  const after = calculate(finalLayout);
  const improvement =
    before.unbalance > 0 ? ((before.unbalance - after.unbalance) / before.unbalance) * 100 : 0;

  return {
    createdAt: new Date().toISOString(),
    lineKv: readNumber(lineVoltageEl, 11),
    frequency: readNumber(frequencyEl, 50),
    nominalUf: readNumber(nominalCapEl, 22),
    selectedSwapPairs: swaps.length,
    beforeUnbalance: before.unbalance,
    afterUnbalance: after.unbalance,
    improvement,
    movedCount: movedFromOriginal(finalLayout, initialLayout),
    rows: buildSwapRows(initialLayout, swaps),
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportSwapRecord() {
  if (!lastSwapRecord) return;
  const summaryRows = [
    ["Double Star Capacitor Bank Swap Record"],
    ["Created At", lastSwapRecord.createdAt],
    ["Line Voltage kV", lastSwapRecord.lineKv],
    ["Frequency Hz", lastSwapRecord.frequency],
    ["Nominal Capacitance uF", lastSwapRecord.nominalUf],
    ["Selected Swap Pairs", lastSwapRecord.selectedSwapPairs],
    ["Before Unbalance mA", lastSwapRecord.beforeUnbalance.toFixed(6)],
    ["After Unbalance mA", lastSwapRecord.afterUnbalance.toFixed(6)],
    ["Improvement %", lastSwapRecord.improvement.toFixed(3)],
    ["Capacitors Moved", lastSwapRecord.movedCount],
    [],
    [
      "Pair",
      "Capacitor A",
      "A From",
      "A To",
      "A Capacitance uF",
      "Capacitor B",
      "B From",
      "B To",
      "B Capacitance uF",
    ],
  ];
  const swapRows = lastSwapRecord.rows.map((row) => [
    row.pair,
    row.firstCap,
    row.firstFrom,
    row.firstTo,
    row.firstUf.toFixed(3),
    row.secondCap,
    row.secondFrom,
    row.secondTo,
    row.secondUf.toFixed(3),
  ]);
  const csv = [...summaryRows, ...swapRows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `capbank-swap-record-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  const rows = [
    ["Cap Unit", "Value (in uF)", "Unit"],
    ...Array.from({ length: TOTAL_CAPS }, (_, index) => [capIdForSlot(index), "", "uF"]),
  ];
  downloadCsv("capbank-capacitance-template.csv", rows);
}

function practicalBestState(bestByDepth) {
  let best = bestByDepth[0];
  bestByDepth.forEach((state) => {
    if (!state) return;
    if (state.score < best.score - MIN_DISPLAYED_IMPROVEMENT_MA) best = state;
  });
  return best;
}

function optimizeLayout(original, swapPairs, beamWidth, autoMode = false) {
  const system = getSystem();
  const maxPairs = Math.min(swapPairs, MAX_RECOMMENDED_SWAP_PAIRS);
  const initialScore = calculate(original, system).unbalance;
  const bestByDepth = [
    {
      layout: original.slice(),
      score: initialScore,
      depth: 0,
      parent: null,
      swap: null,
      usedIndices: new Set(),
    },
  ];

  if (autoMode && roundsToDisplayedZero(initialScore)) {
    return {
      best: bestByDepth[0],
      bestByDepth,
      autoMode,
      autoStopped: true,
      requestedSwapPairs: swapPairs,
      maxPairs,
    };
  }

  let frontier = bestByDepth;
  const pairList = [];
  for (let a = 0; a < TOTAL_CAPS - 1; a += 1) {
    for (let b = a + 1; b < TOTAL_CAPS; b += 1) pairList.push([a, b]);
  }

  for (let depth = 1; depth <= maxPairs; depth += 1) {
    const candidates = [];
    const seenAtDepth = new Set();

    frontier.forEach((state) => {
      pairList.forEach(([a, b]) => {
        if (state.usedIndices.has(a) || state.usedIndices.has(b)) return;
        if (!isMeaningfulSwap(state.layout, a, b)) return;
        const layout = swapLayout(state.layout, a, b);
        const key = layoutKey(layout);
        if (seenAtDepth.has(key)) return;
        seenAtDepth.add(key);
        const score = calculate(layout, system).unbalance;
        const usedIndices = new Set(state.usedIndices);
        usedIndices.add(a);
        usedIndices.add(b);
        candidates.push({
          layout,
          score,
          depth,
          parent: state,
          swap: [a, b],
          usedIndices,
        });
      });
    });

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return movedFromOriginal(a.layout, original) - movedFromOriginal(b.layout, original);
    });

    frontier = candidates.slice(0, beamWidth);
    if (frontier.length === 0) break;
    bestByDepth[depth] = frontier[0] || bestByDepth[depth - 1];
    if (autoMode && roundsToDisplayedZero(bestByDepth[depth].score)) {
      return {
        best: bestByDepth[depth],
        bestByDepth,
        autoMode,
        autoStopped: true,
        requestedSwapPairs: swapPairs,
        maxPairs,
      };
    }
  }

  return {
    best: practicalBestState(bestByDepth),
    bestByDepth,
    autoMode,
    autoStopped: false,
    requestedSwapPairs: swapPairs,
    maxPairs,
  };
}

function updateSummary(bestState = lastBest) {
  syncCapsFromInputs();
  const current = calculate(capacitors);
  const best = bestState ? calculate(bestState.layout) : current;
  const improvement =
    current.unbalance > 0 ? ((current.unbalance - best.unbalance) / current.unbalance) * 100 : 0;

  currentUnbalanceEl.textContent = formatMilliAmps(current.unbalance);
  bestUnbalanceEl.textContent = formatMilliAmps(best.unbalance);
  improvementEl.textContent = formatPercent(Math.max(0, improvement));
  movedCountEl.textContent = `${bestState ? movedFromOriginal(bestState.layout, capacitors) : 0}`;

  const starCapacitanceTotals = current.branchUf.map((phaseSums) =>
    phaseSums.reduce((total, uf) => total + uf, 0),
  );
  starCapacitanceTotals.forEach((total, index) => {
    const el = document.querySelector(`#star-${index}-residual`);
    if (el) el.textContent = `Total ${total.toFixed(2)} μF`;
  });

  current.branchUf.forEach((star, starIndex) => {
    star.forEach((uf, phaseIndex) => {
      const el = document.querySelector(`#branch-${starIndex}-${phaseIndex}`);
      if (el) el.textContent = `${uf.toFixed(2)} μF`;
    });
  });

  renderDetails(current);
}

function renderDetails(result) {
  const phaseVoltage = readNumber(lineVoltageEl, 11) / Math.sqrt(3);
  const e = result.engineering;
  const rows = [
    ["Phase voltage", `${phaseVoltage.toFixed(3)} kV`],
    ["AR / AY / AB", `${e.ar.toFixed(3)} / ${e.ay.toFixed(3)} / ${e.ab.toFixed(3)} μF`],
    ["BR / BY / BB", `${e.br.toFixed(3)} / ${e.by.toFixed(3)} / ${e.bb.toFixed(3)} μF`],
    ["X total", `${e.x.toFixed(3)} μF`],
    ["S1 / S2 / S3", `${e.s1.toFixed(6)} / ${e.s2.toFixed(6)} / ${e.s3.toFixed(6)}`],
    ["S4 / S5", `${e.s4.toFixed(6)} / ${e.s5.toFixed(6)}`],
    ["Real term", `${e.realTerm.toFixed(6)}`],
    ["Imag term", `${e.imagTerm.toFixed(6)}`],
    ["bal", `${e.bal.toFixed(6)}`],
    ["Raw unbalance", formatMilliAmps(e.rawUnbalance)],
    ["Displayed unbalance", formatMilliAmps(result.unbalance)],
  ];
  detailListEl.innerHTML = rows
    .map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderOptimization(result) {
  lastBest = result.best;
  lastSwapRecord = createSwapRecord(result.best);
  exportRecordEl.disabled = lastSwapRecord.rows.length === 0;
  updateSummary(result.best);

  const swaps = swapsFromParents(result.best);
  swapListEl.innerHTML = "";
  if (result.autoMode) {
    const note = document.createElement("li");
    note.textContent = result.autoStopped
      ? `Auto selected ${swaps.length} swap pair${swaps.length === 1 ? "" : "s"} because the result rounds to 0.00 mA.`
      : `Auto searched up to ${result.maxPairs} swap pairs and selected the practical lowest result.`;
    swapListEl.appendChild(note);
  } else if (swaps.length < result.requestedSwapPairs) {
    const note = document.createElement("li");
    note.textContent = `Selected ${swaps.length} practical swap pair${swaps.length === 1 ? "" : "s"} because extra pairs did not improve the displayed result enough.`;
    swapListEl.appendChild(note);
  }
  let cursorLayout = capacitors.slice();
  swaps.forEach(([a, b]) => {
    const li = document.createElement("li");
    li.textContent = `${cursorLayout[a].id} (${slotMeta(a).label}) ⇄ ${cursorLayout[b].id} (${slotMeta(b).label})`;
    swapListEl.appendChild(li);
    cursorLayout = swapLayout(cursorLayout, a, b);
  });
  applyBestEl.disabled = swaps.length === 0;

  const baseline = result.bestByDepth[0].score || 1;
  depthTableEl.innerHTML = "";
  result.bestByDepth.forEach((state, depth) => {
    if (!state) return;
    const row = document.createElement("div");
    row.className = "depth-row";
    const width = baseline > 0 ? Math.max(2, (state.score / baseline) * 100) : 2;
    row.innerHTML = `
      <span>${depth} swap${depth === 1 ? "" : "s"}</span>
      <div class="bar"><span style="width:${Math.min(100, width)}%"></span></div>
      <strong>${formatMilliAmps(state.score)}</strong>
    `;
    depthTableEl.appendChild(row);
  });
}

function loadExample() {
  const example = [
    22.10, 21.92, 22.03, 21.77, 22.14, 22.05, 22.28, 21.88, 22.08,
    21.98, 22.18, 21.86, 22.04, 21.80, 22.16, 21.93, 22.25, 22.01,
  ];
  capacitors = example.map((uf, index) => ({
    id: capIdForSlot(index),
    uf,
  }));
  clearOptimizationState();
  renderBank();
  updateSummary();
}

function resetLayout() {
  capacitors = makeDefaultCaps();
  clearOptimizationState();
  renderBank();
  updateSummary();
}

bankEl.addEventListener("input", () => {
  clearOptimizationState();
  updateSummary();
  clearRenderedHighlights();
});

[lineVoltageEl, frequencyEl, nominalCapEl].forEach((el) => {
  el.addEventListener("input", () => {
    clearOptimizationState();
    updateSummary();
    clearRenderedHighlights();
  });
});

[swapPairsEl, beamWidthEl].forEach((el) => {
  el.addEventListener("change", () => {
    clearOptimizationState();
    updateSummary();
    clearRenderedHighlights();
  });
});

loadCsvEl.addEventListener("click", () => {
  csvInputEl.click();
});

downloadTemplateEl.addEventListener("click", downloadTemplate);

csvInputEl.addEventListener("change", () => {
  const [file] = csvInputEl.files;
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      loadCsvText(String(reader.result ?? ""));
    } catch (error) {
      window.alert(error.message);
    } finally {
      csvInputEl.value = "";
    }
  });
  reader.addEventListener("error", () => {
    window.alert("The CSV file could not be read.");
    csvInputEl.value = "";
  });
  reader.readAsText(file);
});

document.querySelector("#optimize").addEventListener("click", () => {
  syncCapsFromInputs();
  const autoMode = swapPairsEl.value === "auto";
  const swapPairs = autoMode
    ? MAX_RECOMMENDED_SWAP_PAIRS
    : Number.parseInt(swapPairsEl.value, 10);
  const beamWidth = Number.parseInt(beamWidthEl.value, 10);
  const result = optimizeLayout(capacitors, swapPairs, beamWidth, autoMode);
  renderOptimization(result);
});

applyBestEl.addEventListener("click", () => {
  if (!lastBest) return;
  const swaps = swapsFromParents(lastBest);
  const palette = ["move-a", "move-b", "move-c", "move-d", "move-e", "move-f"];
  let cursorLayout = capacitors.slice();
  appliedHighlights = new Map();
  swaps.forEach(([a, b], index) => {
    const moveClass = palette[index % palette.length];
    appliedHighlights.set(cursorLayout[a].id, moveClass);
    appliedHighlights.set(cursorLayout[b].id, moveClass);
    cursorLayout = swapLayout(cursorLayout, a, b);
  });
  capacitors = lastBest.layout.map((cap) => ({ ...cap }));
  lastBest = null;
  applyBestEl.disabled = true;
  renderBank();
  updateSummary();
});

exportRecordEl.addEventListener("click", exportSwapRecord);
document.querySelector("#loadExample").addEventListener("click", loadExample);
document.querySelector("#resetLayout").addEventListener("click", resetLayout);

resetLayout();
