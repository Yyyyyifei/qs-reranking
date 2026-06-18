const state = {
  data: null,
  report: null,
  weights: {},
  ranked: [],
  filtered: [],
  activePreset: 0,
  view: "table",
};

const WEIGHT_TOTAL = 100;
const WEIGHT_STEP = 5;
const EPSILON = 0.000001;

const presets = [
  {
    name: "QS default",
    weights: { ar: 30, cpf: 20, er: 15, eo: 5, fsr: 10, ifr: 5, irn: 5, isr: 5, sus: 5 },
  },
  {
    name: "Research",
    weights: { ar: 50, cpf: 30, er: 0, eo: 0, fsr: 10, ifr: 0, irn: 10, isr: 0, sus: 0 },
  },
  {
    name: "Employability",
    weights: { ar: 20, cpf: 0, er: 60, eo: 20, fsr: 0, ifr: 0, irn: 0, isr: 0, sus: 0 },
  },
  {
    name: "Learning",
    weights: { ar: 30, cpf: 20, er: 0, eo: 0, fsr: 50, ifr: 0, irn: 0, isr: 0, sus: 0 },
  },
];

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  const [data, report] = await Promise.all([
    fetch("data/qs2027.json").then((response) => response.json()),
    fetch("data/reproduction_report.json").then((response) => response.json()),
  ]);

  state.data = data;
  state.report = report;
  state.weights = Object.fromEntries(data.indicators.map((indicator) => [indicator.key, indicator.defaultWeight]));

  buildControls();
  buildFilters();
  bindEvents();
  renderAudit();
  update();
});

function bindElements() {
  [
    "weightControls",
    "weightTotal",
    "metricCount",
    "metricWeight",
    "metricRise",
    "metricTopScore",
    "resultsBody",
    "searchInput",
    "regionFilter",
    "countryFilter",
    "rankFilter",
    "limitSelect",
    "presetGrid",
    "resetWeights",
    "exportCsv",
    "tableViewButton",
    "auditViewButton",
    "tableView",
    "auditView",
    "indicatorList",
    "reproductionStats",
    "mismatchBody",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function buildControls() {
  els.weightControls.innerHTML = state.data.indicators
    .map(
      (indicator) => `
        <div class="weight-row" data-key="${indicator.key}">
          <label class="weight-label" for="range-${indicator.key}">
            <strong>${escapeHtml(indicator.label)}</strong>
            <span>${escapeHtml(indicator.lens)}</span>
          </label>
          <div class="weight-inputs">
            <input id="range-${indicator.key}" type="range" min="0" max="100" step="5" value="${indicator.defaultWeight}" data-weight-key="${indicator.key}">
            <input id="number-${indicator.key}" type="number" min="0" max="100" step="5" value="${indicator.defaultWeight}" data-number-key="${indicator.key}" aria-label="${escapeHtml(indicator.label)} weight">
          </div>
        </div>
      `
    )
    .join("");

  els.presetGrid.innerHTML = presets
    .map((preset, index) => `<button type="button" data-preset="${index}" aria-pressed="false">${escapeHtml(preset.name)}</button>`)
    .join("");
}

function buildFilters() {
  const regions = uniqueSorted(state.data.universities.map((item) => item.region).filter(Boolean));
  const countries = uniqueSorted(state.data.universities.map((item) => item.country).filter(Boolean));
  els.regionFilter.innerHTML = optionList(["All regions", ...regions]);
  els.countryFilter.innerHTML = optionList(["All countries/territories", ...countries]);
}

function bindEvents() {
  els.weightControls.addEventListener("input", handleWeightEvent);
  els.weightControls.addEventListener("change", handleWeightEvent);

  els.presetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (!button) return;
    setWeights(presets[Number(button.dataset.preset)].weights);
  });

  els.resetWeights.addEventListener("click", () => setWeights(presets[0].weights));
  els.exportCsv.addEventListener("click", exportCsv);

  [els.searchInput, els.regionFilter, els.countryFilter, els.rankFilter, els.limitSelect].forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  els.tableViewButton.addEventListener("click", () => setView("table"));
  els.auditViewButton.addEventListener("click", () => setView("audit"));
}

function handleWeightEvent(event) {
  const key = event.target.dataset.weightKey || event.target.dataset.numberKey;
  if (!key) return;
  if (event.type === "input" && event.target.dataset.numberKey) return;

  const rawValue = clamp(Number(event.target.value) || 0, 0, WEIGHT_TOTAL);
  const target = steppedTarget(state.weights[key], rawValue);
  allocateWeight(key, target);
  syncWeightControls();
  update();
}

function setWeights(nextWeights) {
  state.weights = roundWeightsToStep(normalizeWeights({ ...state.weights, ...nextWeights }));
  syncWeightControls();
  update();
}

function updateActivePreset() {
  const match = presets.findIndex((preset) => weightsEqual(state.weights, preset.weights));
  state.activePreset = match;
  document.querySelectorAll("[data-preset]").forEach((button) => {
    const active = Number(button.dataset.preset) === match;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function weightsEqual(left, right) {
  return state.data.indicators.every((indicator) => Number(left[indicator.key] || 0) === Number(right[indicator.key] || 0));
}

function steppedTarget(current, rawValue) {
  if (Math.abs(rawValue - current) < EPSILON) return clamp(current, 0, WEIGHT_TOTAL);
  const direction = rawValue > current ? 1 : -1;
  const snapped =
    direction > 0
      ? Math.ceil((rawValue - EPSILON) / WEIGHT_STEP) * WEIGHT_STEP
      : Math.floor((rawValue + EPSILON) / WEIGHT_STEP) * WEIGHT_STEP;
  return clamp(snapped, 0, WEIGHT_TOTAL);
}

function allocateWeight(changedKey, targetValue) {
  const indicators = state.data.indicators.map((indicator) => indicator.key);
  const otherKeys = indicators.filter((key) => key !== changedKey);
  const next = { ...state.weights, [changedKey]: clamp(targetValue, 0, WEIGHT_TOTAL) };
  const currentOtherTotal = otherKeys.reduce((sum, key) => sum + Number(state.weights[key] || 0), 0);
  const nextOtherTotal = WEIGHT_TOTAL - next[changedKey];

  if (nextOtherTotal <= EPSILON) {
    otherKeys.forEach((key) => {
      next[key] = 0;
    });
  } else if (currentOtherTotal <= EPSILON) {
    const evenShare = nextOtherTotal / otherKeys.length;
    otherKeys.forEach((key) => {
      next[key] = evenShare;
    });
  } else {
    otherKeys.forEach((key) => {
      next[key] = (Number(state.weights[key] || 0) / currentOtherTotal) * nextOtherTotal;
    });
  }

  state.weights = roundWeightsToStep(next, changedKey);
}

function normalizeWeights(weights, protectedKey = null) {
  const keys = state.data.indicators.map((indicator) => indicator.key);
  const next = {};
  keys.forEach((key) => {
    next[key] = clamp(Number(weights[key] || 0), 0, WEIGHT_TOTAL);
  });

  const total = keys.reduce((sum, key) => sum + next[key], 0);
  if (total <= EPSILON) {
    keys.forEach((key) => {
      next[key] = WEIGHT_TOTAL / keys.length;
    });
    return next;
  }

  const factor = WEIGHT_TOTAL / total;
  keys.forEach((key) => {
    next[key] *= factor;
  });

  const adjustmentKey = keys.find((key) => key !== protectedKey) || protectedKey || keys[0];
  const drift = WEIGHT_TOTAL - keys.reduce((sum, key) => sum + next[key], 0);
  next[adjustmentKey] = clamp(next[adjustmentKey] + drift, 0, WEIGHT_TOTAL);
  return next;
}

function roundWeightsToStep(weights, protectedKey = null) {
  const keys = state.data.indicators.map((indicator) => indicator.key);
  const next = {};
  keys.forEach((key) => {
    next[key] = clamp(Number(weights[key] || 0), 0, WEIGHT_TOTAL);
  });

  if (protectedKey) {
    next[protectedKey] = clamp(Math.round(next[protectedKey] / WEIGHT_STEP) * WEIGHT_STEP, 0, WEIGHT_TOTAL);
  }

  const adjustableKeys = keys.filter((key) => key !== protectedKey);
  const targetUnits = Math.round((WEIGHT_TOTAL - (protectedKey ? next[protectedKey] : 0)) / WEIGHT_STEP);
  const exactUnits = adjustableKeys.map((key) => ({
    key,
    exact: next[key] / WEIGHT_STEP,
  }));

  const baseUnits = exactUnits.map((item) => ({
    ...item,
    units: Math.floor(item.exact),
    fraction: item.exact - Math.floor(item.exact),
  }));

  let assignedUnits = baseUnits.reduce((sum, item) => sum + item.units, 0);
  const sortedByRemainder = [...baseUnits].sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key));
  let index = 0;
  while (assignedUnits < targetUnits && sortedByRemainder.length > 0) {
    sortedByRemainder[index % sortedByRemainder.length].units += 1;
    assignedUnits += 1;
    index += 1;
  }

  const sortedBySmallestPenalty = [...baseUnits].sort((a, b) => a.fraction - b.fraction || a.key.localeCompare(b.key));
  index = 0;
  while (assignedUnits > targetUnits && sortedBySmallestPenalty.length > 0) {
    const item = sortedBySmallestPenalty[index % sortedBySmallestPenalty.length];
    if (item.units > 0) {
      item.units -= 1;
      assignedUnits -= 1;
    }
    index += 1;
  }

  baseUnits.forEach((item) => {
    next[item.key] = item.units * WEIGHT_STEP;
  });

  const drift = WEIGHT_TOTAL - keys.reduce((sum, key) => sum + next[key], 0);
  if (Math.abs(drift) >= EPSILON) {
    const adjustmentKey = adjustableKeys.find((key) => next[key] + drift >= 0 && next[key] + drift <= WEIGHT_TOTAL) || protectedKey || keys[0];
    next[adjustmentKey] += drift;
  }

  return next;
}

function syncWeightControls() {
  state.data.indicators.forEach((indicator) => {
    const value = cleanWeight(state.weights[indicator.key]);
    const range = document.querySelector(`[data-weight-key="${indicator.key}"]`);
    const number = document.querySelector(`[data-number-key="${indicator.key}"]`);
    range.value = value;
    number.value = value;
  });
}

function setView(view) {
  state.view = view;
  const audit = view === "audit";
  els.tableView.classList.toggle("hidden", audit);
  els.auditView.classList.toggle("hidden", !audit);
  els.tableViewButton.classList.toggle("active", !audit);
  els.auditViewButton.classList.toggle("active", audit);
}

function update() {
  state.ranked = rankUniversities();
  state.filtered = applyFilters(state.ranked);
  updateActivePreset();
  renderMetrics();
  renderTable();
}

function rankUniversities() {
  const totalWeight = weightTotal();
  const scored = state.data.universities.map((university) => {
    const rawScore =
      totalWeight === 0
        ? 0
        : state.data.indicators.reduce((sum, indicator) => {
            const score = university.scores[indicator.key] ?? 0;
            return sum + score * state.weights[indicator.key];
          }, 0) / totalWeight;

    return {
      ...university,
      customRawScore: rawScore,
      strongestSignal: strongestSignal(university),
    };
  });

  const maxScore = Math.max(...scored.map((item) => item.customRawScore), 0);
  const ordered = scored
    .map((item) => ({
      ...item,
      customScore: maxScore > 0 ? (item.customRawScore / maxScore) * 100 : 0,
    }))
    .sort((a, b) => b.customRawScore - a.customRawScore || (a.officialRank ?? 999999) - (b.officialRank ?? 999999) || a.name.localeCompare(b.name));

  let previousScore = null;
  let previousRank = 0;
  return ordered.map((item, index) => {
    const roundedScore = item.customRawScore.toFixed(8);
    const customRank = roundedScore === previousScore ? previousRank : index + 1;
    previousScore = roundedScore;
    previousRank = customRank;
    return { ...item, customRank };
  });
}

function strongestSignal(university) {
  return state.data.indicators.reduce(
    (best, indicator) => {
      const score = university.scores[indicator.key] ?? 0;
      const contribution = score * state.weights[indicator.key];
      return contribution > best.contribution
        ? { label: indicator.label, contribution, score }
        : best;
    },
    { label: "None", contribution: -1, score: 0 }
  );
}

function applyFilters(items) {
  const query = els.searchInput.value.trim().toLowerCase();
  const region = els.regionFilter.value;
  const country = els.countryFilter.value;
  const rank = els.rankFilter.value;

  return items.filter((item) => {
    const matchesQuery =
      !query ||
      [item.name, item.country, item.region].some((value) => String(value || "").toLowerCase().includes(query));
    const matchesRegion = region === "All regions" || item.region === region;
    const matchesCountry = country === "All countries/territories" || item.country === country;
    let matchesRank = true;

    if (["100", "250", "500", "700"].includes(rank)) {
      matchesRank = item.officialRank !== null && item.officialRank <= Number(rank);
    } else if (rank === "banded") {
      matchesRank = item.officialOverallScore === null;
    }

    return matchesQuery && matchesRegion && matchesCountry && matchesRank;
  });
}

function renderMetrics() {
  const total = weightTotal();
  const bestRise = state.filtered.reduce((best, item) => {
    if (!item.officialRank) return best;
    const rise = item.officialRank - item.customRank;
    return rise > best.rise ? { rise, item } : best;
  }, { rise: 0, item: null });

  els.weightTotal.textContent = `${formatNumber(total, 1)}%`;
  els.metricWeight.textContent = `${formatNumber(total, 1)}%`;
  els.metricCount.textContent = state.filtered.length.toLocaleString();
  els.metricTopScore.textContent = state.filtered[0] ? formatNumber(state.filtered[0].customScore, 1) : "--";
  els.metricRise.textContent = bestRise.item ? `+${bestRise.rise}` : "--";
}

function renderTable() {
  const limitValue = els.limitSelect.value;
  const visible = limitValue === "all" ? state.filtered : state.filtered.slice(0, Number(limitValue));

  els.resultsBody.innerHTML = visible
    .map((item) => {
      const delta = item.officialRank ? item.officialRank - item.customRank : null;
      const deltaClass = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
      const deltaLabel = delta === null ? "--" : delta === 0 ? "0" : delta > 0 ? `+${delta}` : String(delta);
      const qsScore = item.officialOverallScore === null ? "Banded" : formatNumber(item.officialOverallScore, 1);

      return `
        <tr>
          <td class="rank-cell">${item.customRank}</td>
          <td class="rank-cell">${escapeHtml(item.officialRankText || "--")}</td>
          <td>
            <div class="institution">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(classificationLabel(item))}</span>
            </div>
          </td>
          <td>${escapeHtml(item.country)}</td>
          <td>${escapeHtml(item.region)}</td>
          <td>${scoreBar(item.customScore)}</td>
          <td>${qsScore}</td>
          <td class="${deltaClass}">${deltaLabel}</td>
          <td><span class="signal-pill" title="${escapeHtml(item.strongestSignal.label)}">${escapeHtml(shortSignal(item.strongestSignal.label))}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderAudit() {
  const report = state.report;
  els.indicatorList.innerHTML = report.indicatorColumns
    .map(
      (indicator) => `
        <div class="indicator-item">
          <span class="indicator-code">${escapeHtml(indicator.column)}</span>
          <strong>${escapeHtml(indicator.label)}</strong>
          <span>${formatNumber(indicator.defaultWeight, 1)}%</span>
        </div>
      `
    )
    .join("");

  const reproduction = report.reproduction;
  const stats = [
    ["Rows extracted", report.rowCount.toLocaleString()],
    ["Score columns", report.scoreColumns.join(", ")],
    ["Indicator columns", String(report.indicatorColumns.length)],
    ["Report-only score", report.omittedScoreColumns.join(", ") || "None"],
    ["Weight total", `${reproduction.defaultWeightTotal}%`],
    ["Max raw weighted score", formatNumber(reproduction.maxRawWeightedScore, 3)],
    ["Raw MAE vs QS overall", formatNumber(reproduction.rawMeanAbsoluteScoreError, 3)],
    ["Normalized MAE vs QS overall", formatNumber(reproduction.normalizedMeanAbsoluteScoreError, 3)],
    ["Exact rank matches", reproduction.exactRankMatches.toLocaleString()],
  ];

  els.reproductionStats.innerHTML = stats
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");

  els.mismatchBody.innerHTML = reproduction.topMismatches
    .slice(0, 12)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.officialRank}</td>
          <td>${item.computedRank}</td>
          <td>${formatNumber(item.officialScore, 1)}</td>
          <td>${formatNumber(item.computedScore, 1)}</td>
          <td>${formatNumber(item.scoreDelta, 1)}</td>
        </tr>
      `
    )
    .join("");
}

function exportCsv() {
  const rows = [
    ["custom_rank", "qs_rank", "institution", "country", "region", "custom_score", "qs_score", "rank_delta"],
    ...state.filtered.map((item) => [
      item.customRank,
      item.officialRankText || "",
      item.name,
      item.country,
      item.region,
      formatNumber(item.customScore, 4),
      item.officialOverallScore ?? "",
      item.officialRank ? item.officialRank - item.customRank : "",
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "qs-2027-custom-ranking.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function weightTotal() {
  return Object.values(state.weights).reduce((sum, value) => sum + Number(value || 0), 0);
}

function cleanWeight(value) {
  return Number(Number(value).toFixed(4));
}

function scoreBar(score) {
  const label = formatNumber(score, 1);
  return `
    <div class="score-bar">
      <strong>${label}</strong>
      <span class="score-track" aria-hidden="true"><span class="score-fill" style="width: ${clamp(score, 0, 100)}%"></span></span>
    </div>
  `;
}

function classificationLabel(item) {
  const parts = [item.classification.status, `Research ${item.classification.research}`, `Size ${item.classification.size}`].filter(Boolean);
  return parts.join(" | ");
}

function shortSignal(label) {
  const lookup = {
    "Academic Reputation": "Academic rep",
    "Citations per Faculty": "Citations",
    "Employer Reputation": "Employer rep",
    "Employment Outcomes": "Outcomes",
    "Faculty Student Ratio": "Faculty/student",
    "International Faculty Ratio": "Intl faculty",
    "International Research Network": "Intl research",
    "International Student Ratio": "Intl students",
    Sustainability: "Sustainability",
  };
  return lookup[label] || label;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function optionList(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
