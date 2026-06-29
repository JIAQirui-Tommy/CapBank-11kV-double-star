const STARS = ["Star 1", "Star 2"];
const PHASES = [
  { key: "R", name: "Red", className: "red", angle: 0 },
  { key: "Y", name: "Yellow", className: "yellow", angle: -120 },
  { key: "B", name: "Blue", className: "blue", angle: 120 },
];
const SLOTS_PER_BRANCH = 3;
const TOTAL_CAPS = STARS.length * PHASES.length * SLOTS_PER_BRANCH;

const bankEl = document.querySelector("#bank");
const lineVoltageEl = document.querySelector("#lineVoltage");
const frequencyEl = document.querySelector("#frequency");
const nominalCapEl = document.querySelector("#nominalCap");
const maxDepthEl = document.querySelector("#maxDepth");
const beamWidthEl = document.querySelector("#beamWidth");
const currentUnbalanceEl = document.querySelector("#currentUnbalance");
const bestUnbalanceEl = document.querySelector("#bestUnbalance");
const improvementEl = document.querySelector("#improvement");
const movedCountEl = document.querySelector("#movedCount");
const swapListEl = document.querySelector("#swapList");
const depthTableEl = document.querySelector("#depthTable");
const detailListEl = document.querySelector("#detailList");
const applyBestEl = document.querySelector("#applyBest");

let capacitors = [];
let lastBest = null;

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
  return `${meta.phase.key}${meta.starIndex + 1}${meta.slotIndex}`;
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

function formatAmps(value) {
  if (value >= 10) return `${value.toFixed(3)} A`;
  if (value >= 1) return `${value.toFixed(4)} A`;
  return `${(value * 1000).toFixed(2)} mA`;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function renderBank() {
  bankEl.innerHTML = "";
  STARS.forEach((starName, starIndex) => {
    const star = document.createElement("section");
    star.className = "star";
    star.innerHTML = `
      <div class="star-header">
        <h2>${starName}</h2>
        <span id="star-${starIndex}-residual">0 A</span>
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
        const slotEl = document.createElement("label");
        slotEl.className = "cap-slot";
        slotEl.innerHTML = `
          <div class="slot-top">
            <span class="cap-id">${cap.id}</span>
            <span class="cap-pos">${phase.key}${slot + 1}</span>
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

function getSystem() {
  return {
    lineKv: readNumber(lineVoltageEl, 11),
    frequency: readNumber(frequencyEl, 50),
  };
}

function vectorFromPolar(magnitude, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    re: magnitude * Math.cos(radians),
    im: magnitude * Math.sin(radians),
  };
}

function addVector(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

function subVector(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

function magnitude(v) {
  return Math.hypot(v.re, v.im);
}

function calculate(layout, system = getSystem()) {
  const vPhase = (system.lineKv * 1000) / Math.sqrt(3);
  const omega = 2 * Math.PI * system.frequency;
  const branchUf = Array.from({ length: STARS.length }, () =>
    Array.from({ length: PHASES.length }, () => 0),
  );

  layout.forEach((cap, index) => {
    const meta = slotMeta(index);
    branchUf[meta.starIndex][PHASES.indexOf(meta.phase)] += cap.uf;
  });

  const starVectors = branchUf.map((phaseSums) =>
    phaseSums.reduce((sum, uf, phaseIndex) => {
      const current = omega * (uf * 1e-6) * vPhase;
      return addVector(sum, vectorFromPolar(current, PHASES[phaseIndex].angle));
    }, { re: 0, im: 0 }),
  );

  const bridgeVector = {
    re: subVector(starVectors[0], starVectors[1]).re,
    im: subVector(starVectors[0], starVectors[1]).im,
  };

  return {
    unbalance: magnitude(bridgeVector),
    branchUf,
    starResiduals: starVectors.map(magnitude),
    bridgeVector,
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

function optimizeLayout(original, maxDepth, beamWidth) {
  const system = getSystem();
  const initialScore = calculate(original, system).unbalance;
  const bestByDepth = [
    {
      layout: original.slice(),
      score: initialScore,
      depth: 0,
      parent: null,
      swap: null,
    },
  ];

  let frontier = bestByDepth;
  let best = bestByDepth[0];
  const pairList = [];
  for (let a = 0; a < TOTAL_CAPS - 1; a += 1) {
    for (let b = a + 1; b < TOTAL_CAPS; b += 1) pairList.push([a, b]);
  }

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const candidates = [];
    const seenAtDepth = new Set();

    frontier.forEach((state) => {
      pairList.forEach(([a, b]) => {
        const layout = swapLayout(state.layout, a, b);
        const key = layoutKey(layout);
        if (seenAtDepth.has(key)) return;
        seenAtDepth.add(key);
        const score = calculate(layout, system).unbalance;
        candidates.push({
          layout,
          score,
          depth,
          parent: state,
          swap: [a, b],
        });
      });
    });

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return movedFromOriginal(a.layout, original) - movedFromOriginal(b.layout, original);
    });

    frontier = candidates.slice(0, beamWidth);
    bestByDepth[depth] = frontier[0] || bestByDepth[depth - 1];
    if (
      bestByDepth[depth].score < best.score - 1e-12 ||
      (Math.abs(bestByDepth[depth].score - best.score) < 1e-12 &&
        movedFromOriginal(bestByDepth[depth].layout, original) < movedFromOriginal(best.layout, original))
    ) {
      best = bestByDepth[depth];
    }
  }

  return { best, bestByDepth };
}

function updateSummary(bestState = lastBest) {
  syncCapsFromInputs();
  const current = calculate(capacitors);
  const best = bestState ? calculate(bestState.layout) : current;
  const improvement =
    current.unbalance > 0 ? ((current.unbalance - best.unbalance) / current.unbalance) * 100 : 0;

  currentUnbalanceEl.textContent = formatAmps(current.unbalance);
  bestUnbalanceEl.textContent = formatAmps(best.unbalance);
  improvementEl.textContent = formatPercent(Math.max(0, improvement));
  movedCountEl.textContent = `${bestState ? movedFromOriginal(bestState.layout, capacitors) : 0}`;

  current.starResiduals.forEach((residual, index) => {
    const el = document.querySelector(`#star-${index}-residual`);
    if (el) el.textContent = `Residual ${formatAmps(residual)}`;
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
  const rows = [
    ["Phase voltage", `${phaseVoltage.toFixed(3)} kV`],
    ["Star 1 residual vector", formatAmps(result.starResiduals[0])],
    ["Star 2 residual vector", formatAmps(result.starResiduals[1])],
    ["Bridge vector Re", `${result.bridgeVector.re.toFixed(6)} A`],
    ["Bridge vector Im", `${result.bridgeVector.im.toFixed(6)} A`],
  ];
  detailListEl.innerHTML = rows
    .map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderOptimization(result) {
  lastBest = result.best;
  updateSummary(result.best);

  const swaps = swapsFromParents(result.best);
  swapListEl.innerHTML = "";
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
      <strong>${formatAmps(state.score)}</strong>
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
  lastBest = null;
  applyBestEl.disabled = true;
  renderBank();
  updateSummary();
}

function resetLayout() {
  capacitors = makeDefaultCaps();
  lastBest = null;
  applyBestEl.disabled = true;
  renderBank();
  updateSummary();
}

bankEl.addEventListener("input", () => {
  lastBest = null;
  applyBestEl.disabled = true;
  updateSummary();
});

[lineVoltageEl, frequencyEl, nominalCapEl].forEach((el) => {
  el.addEventListener("input", () => updateSummary(lastBest));
});

document.querySelector("#optimize").addEventListener("click", () => {
  syncCapsFromInputs();
  const maxDepth = Number.parseInt(maxDepthEl.value, 10);
  const beamWidth = Number.parseInt(beamWidthEl.value, 10);
  const result = optimizeLayout(capacitors, maxDepth, beamWidth);
  renderOptimization(result);
});

applyBestEl.addEventListener("click", () => {
  if (!lastBest) return;
  capacitors = lastBest.layout.map((cap) => ({ ...cap }));
  lastBest = null;
  applyBestEl.disabled = true;
  renderBank();
  updateSummary();
});

document.querySelector("#loadExample").addEventListener("click", loadExample);
document.querySelector("#resetLayout").addEventListener("click", resetLayout);

resetLayout();
