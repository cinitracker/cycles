// ── FIREBASE CLOUD SETUP ──────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, writeBatch, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwmyqSeMeME5JQOXtLl8-pqKRBFJkGmoU",
  authDomain: "cycletracker-e2a24.firebaseapp.com",
  databaseURL: "https://cycletracker-e2a24-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cycletracker-e2a24",
  storageBucket: "cycletracker-e2a24.firebasestorage.app",
  messagingSenderId: "978749842347",
  appId: "1:978749842347:web:851c918d1a348f2b1968ee"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const entriesCol = collection(db, 'cycle_entries');

// ── STATE ────────────────────────────────────────────────────────────────────
let cycleData = [];
let bbtChart;

// ── REAL-TIME CLOUD SYNC ──────────────────────────────────────────────────────
onSnapshot(entriesCol, (snapshot) => {
  cycleData = [];
  snapshot.forEach(doc => cycleData.push(doc.data()));
  cycleData.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (bbtChart) {
    updateChartData();
    calculateInsights();
  }
});

// ── DATA ENTRY ───────────────────────────────────────────────────────────────
async function addTempData() {
  const dateInput = document.getElementById('date-temp').value;
  const tempInput = parseFloat(document.getElementById('temp').value);
  if (!dateInput || isNaN(tempInput)) return alert('Please enter date and temp.');
  
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { cm: '', symptoms: '', flow: false };
  
  await setDoc(entryRef, { ...base, date: dateInput, temp: tempInput });
  document.getElementById('temp').value = '';
}

async function addSymptomsData() {
  const dateInput = document.getElementById('date-sx').value;
  const cmInput   = document.getElementById('cm').value;
  const flowInput = document.getElementById('flow').checked;
  const checkedBoxes = document.querySelectorAll('.symptom-box:checked');
  const sympInput = Array.from(checkedBoxes).map(box => box.value).join(', ');

  if (!dateInput) return alert('Please select a date.');
  
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { temp: null };
  
  await setDoc(entryRef, { ...base, date: dateInput, cm: cmInput, symptoms: sympInput, flow: flowInput });
  document.getElementById('cm').value = '';
  document.getElementById('flow').checked = false;
  document.querySelectorAll('.symptom-box').forEach(box => box.checked = false);
}

// ── DETECTION ENGINES ─────────────────────────────────────────────────────────
function detectOvulation() {
  const allOvDays = [];
  // 1. Manual Tags
  cycleData.forEach(e => {
    if (e.symptoms && e.symptoms.includes('ovulation-manual')) {
      allOvDays.push(e.date);
    }
  });
  // 2. Math – strict biphasic shift rule
  //    baseline = avg of 6 low-phase days before the candidate shift
  //    post-shift: all 3 temps must be >= baseline + 0.1 °C
  //    pre-shift: highest of the 3 days immediately before must be < baseline + 0.05 °C
  //      (prevents false positives when temps are already drifting up)
  //    One ovulation per calendar month is kept (earliest detected wins)
  const valid = cycleData.filter(e => typeof e.temp === 'number' && !isNaN(e.temp));
  const detectedByMonth = {};
  for (let i = 6; i <= valid.length - 3; i++) {
    const baselineDays = [valid[i-6].temp, valid[i-5].temp, valid[i-4].temp,
                          valid[i-3].temp, valid[i-2].temp, valid[i-1].temp];
    const baseline = baselineDays.reduce((a, b) => a + b, 0) / 6;
    const SHIFT = 0.1;
    const DRIFT = 0.05;
    const preShiftHighest = Math.max(valid[i-3].temp, valid[i-2].temp, valid[i-1].temp);
    const postShiftLowest  = Math.min(valid[i].temp, valid[i+1].temp, valid[i+2].temp);
    const clearShift     = postShiftLowest >= baseline + SHIFT;
    const stableBaseline = preShiftHighest < baseline + DRIFT;
    if (clearShift && stableBaseline) {
      const ovDate = valid[i-1].date;
      const monthKey = ovDate.slice(0, 7);
      if (!detectedByMonth[monthKey]) detectedByMonth[monthKey] = ovDate;
    }
  }
  for (const date of Object.values(detectedByMonth)) {
    if (!allOvDays.includes(date)) allOvDays.push(date);
  }
  return allOvDays;
}

function detectPeriods() {
  const periods = [];
  let inPeriod = false, start = null;
  for (const e of cycleData) {
    const isBleeding = (e.flow === true || (typeof e.flow === 'string' && e.flow));
    if (isBleeding && !inPeriod) { inPeriod = true; start = e.date; }
    else if (!isBleeding && inPeriod) {
      periods.push({ start, end: cycleData[cycleData.indexOf(e) - 1]?.date || start });
      inPeriod = false;
    }
  }
  if (inPeriod && cycleData.length > 0) periods.push({ start, end: cycleData[cycleData.length - 1].date });
  return periods;
}

// ── CONTEXT & PHASES ──────────────────────────────────────────────────────────
function getCycleContext() {
  const allOvDays = detectOvulation();
  const periods = detectPeriods();
  const lastPeriod = periods[periods.length - 1];
  const ovDay = allOvDays.length > 0 ? [...allOvDays].sort().reverse()[0] : null;

  let cycleLength = 33; 
  if (periods.length >= 2) {
    let totalDays = 0;
    for (let i = 0; i < periods.length - 1; i++) {
      totalDays += (new Date(periods[i+1].start) - new Date(periods[i].start)) / 86400000;
    }
    cycleLength = Math.round(totalDays / (periods.length - 1));
  }

  const lpLength = 14; 
  const pStart = lastPeriod ? new Date(lastPeriod.start) : null;
  const isOvThisCycle = (ovDay && pStart && new Date(ovDay) > pStart);

  const today = new Date(); today.setHours(0,0,0,0);
  let ovWinStart = null, ovWinEnd = null, fertileStart = null, predictedPeriod = null;

  if (pStart) {
    const baseOv = new Date(+pStart + (cycleLength - lpLength) * 86400000);
    ovWinStart = new Date(+baseOv - 2 * 86400000);
    ovWinEnd = new Date(+baseOv + 2 * 86400000);
    if (!isOvThisCycle && today > ovWinEnd) {
      ovWinStart = new Date(today);
      ovWinEnd = new Date(+today + 4 * 86400000);
    }
    fertileStart = new Date(+ovWinStart - 4 * 86400000); 
    predictedPeriod = new Date(+ovWinEnd + lpLength * 86400000);
  }

  return { ovDay, allOvDays, periods, lastPeriod, lpLength, ovWinStart, ovWinEnd, fertileStart, predictedPeriod, isOvThisCycle };
}

function getPhaseForDate(dateStr, ctx) {
  const d = new Date(dateStr);
  // 1. Period takes priority
  for (const p of ctx.periods) {
    if (d >= new Date(p.start) && d <= new Date(p.end)) return 'period';
  }
  // 2. Find the ovulation date that most recently preceded this day
  const relevantOv = [...ctx.allOvDays]
    .filter(ov => new Date(ov) <= d)
    .sort((a,b) => new Date(b) - new Date(a))[0];

  if (relevantOv) {
    const ovD = new Date(relevantOv);
    if (dateStr === relevantOv) return 'ovulation';
    if (d > ovD) {
      // Find the next period start after this specific ovulation
      const nextP = ctx.periods.find(p => new Date(p.start) > ovD);
      if (!nextP || d < new Date(nextP.start)) return 'luteal';
    }
    const fStart = new Date(+ovD - 5 * 86400000);
    if (d >= fStart && d < ovD) return 'fertile';
  }

  // 3. No confirmed ovulation yet this cycle – check predicted fertile window
  //    Also flag days with fertile-quality mucus (egg-white / watery) as fertile
  if (!ctx.isOvThisCycle && ctx.fertileStart && ctx.ovWinEnd) {
    if (d >= ctx.fertileStart && d <= ctx.ovWinEnd) return 'fertile';
  }

  // 4. Mucus-based fertile signal even outside the predicted window
  //    (handles cases where ovulation is early/late)
  const entry = cycleData.find(e => e.date === dateStr);
  if (entry) {
    const cm = (entry.cm || '').toLowerCase();
    const isFertileMucus = cm.includes('egg') || cm.includes('watery') || cm.includes('stretchy') || cm.includes('ewcm');
    if (isFertileMucus) return 'fertile';
  }

  return 'follicular';
}

// ── CHART ────────────────────────────────────────────────────────────────────
function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function getChartDataStructure() {
  const ctx = getCycleContext();
  const allOv = ctx.allOvDays;
  
  // These lines grab your CSS variables so you only ever have to edit style.css
  const colPeriod = getCssVar('--period-col');
  const colOvulation = getCssVar('--ovulation');
  const colMigraine = getCssVar('--migraine');
  const colLuteal = getCssVar('--luteal');
  const colFertile = getCssVar('--fertile');
  const colFollicular = getCssVar('--follicular');

  return {
    labels: cycleData.map(e => new Date(e.date).toLocaleDateString(undefined, { month:'short', day:'numeric' })),
    datasets: [{
      label: 'BBT',
      data: cycleData.map(e => e.temp),
      borderColor: 'rgba(255,255,255,0.35)', 
      borderWidth: 2, 
      tension: 0.35, 
      spanGaps: true,
      
      // Fills circles, squares, and period dots
      pointBackgroundColor: cycleData.map(e => {
        if (e.flow || (typeof e.flow === 'string' && e.flow)) return colPeriod;
        if (allOv.includes(e.date)) return colOvulation;
        if (e.symptoms?.includes('migraine')) return colMigraine;
        const ph = getPhaseForDate(e.date, ctx);
        if (ph === 'luteal') return colLuteal;
        if (ph === 'fertile') return colFertile;
        return colFollicular;
      }),

      // REQUIRED: Stars only use BorderColor. 
      // We set others to transparent to remove the unwanted borders you saw.
      pointBorderColor: cycleData.map(e => {
        if (allOv.includes(e.date)) return colOvulation; 
        return 'transparent'; 
      }),

      // Only the star needs a "border" (the lines of the star)
      pointBorderWidth: cycleData.map(e => allOv.includes(e.date) ? 2 : 0), 
      
      pointRadius: cycleData.map(e => allOv.includes(e.date) ? 8 : (e.symptoms?.includes('migraine') ? 6 : 5)),
      pointStyle: cycleData.map(e => e.symptoms?.includes('migraine') ? 'rectRot' : (allOv.includes(e.date) ? 'star' : 'circle'))
    }]
  };
}

function updateChartData() {
  if (!bbtChart) return;
  bbtChart.data = getChartDataStructure();
  const len = bbtChart.data.labels.length;
  if (len > 10) { 
    bbtChart.options.scales.x.min = len - 10; 
    bbtChart.options.scales.x.max = len - 1; 
  }
  bbtChart.update();
}

function initializeChart() {
  const el = document.getElementById('bbtChart').getContext('2d');
  bbtChart = new Chart(el, {
    type: 'line', data: getChartDataStructure(),
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.08)' } },
        y: { min: 35.5, max: 37.2, ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.08)' } }
      },
      plugins: { 
        legend: { display: false }, 
        zoom: { pan: { enabled: true, mode: 'x' }, zoom: { pinch: { enabled: true }, mode: 'x' } },
        tooltip: {
          callbacks: {
            title(items) {
              const idx = items[0].dataIndex;
              return cycleData[idx]?.date || items[0].label;
            },
            label(item) {
              const e = cycleData[item.dataIndex];
              if (!e) return '';
              const lines = [];
              if (e.temp != null) lines.push('🌡 ' + e.temp + ' °C');
              if (e.cm)           lines.push('💧 CM: ' + e.cm);
              if (e.symptoms) {
                const tags = e.symptoms.split(',').map(s => s.trim()).filter(Boolean);
                const labels = {
                  'migraine': '🤯 Migraine',
                  'bloating': '🫃 Bloating',
                  'breast-tenderness': '🎯 Breast tenderness'
                };
                tags.filter(t => t !== 'ovulation-manual').forEach(t => lines.push(labels[t] || ('• ' + t)));
              }
              return lines;
            }
          },
          backgroundColor: 'rgba(30,20,40,0.92)',
          titleColor: 'rgba(255,255,255,0.9)',
          bodyColor: 'rgba(255,255,255,0.75)',
          padding: 10,
          cornerRadius: 8,
          displayColors: false
        }
      }
    }
  });
}

// ── INSIGHTS ──────────────────────────────────────────────────────────────────
function calculateInsights() {
  const ctx = getCycleContext();
  const fmt = (d) => d ? d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) : '--';
  
  if (ctx.isOvThisCycle) {
    document.getElementById('ov-status').textContent = 'Confirmed ✦';
    document.getElementById('ov-status').style.color = getCssVar('--ovulation');
    document.getElementById('ov-prediction').textContent = `Shift detected on ${fmt(new Date(ctx.ovDay))}`;
    document.getElementById('next-ovulation').textContent = `Confirmed (${fmt(new Date(ctx.ovDay))})`;
    document.getElementById('next-fertile').textContent = 'Closed for this cycle';
    document.getElementById('next-period').textContent = `Est. ${fmt(new Date(new Date(ctx.ovDay).getTime() + (ctx.lpLength * 86400000)))}`;
  } else {
    document.getElementById('ov-status').textContent = 'Not yet';
    document.getElementById('ov-status').style.color = '#ccc';
    document.getElementById('ov-prediction').textContent = 'Watching for biphasic shift.';
    document.getElementById('next-ovulation').textContent = ctx.ovWinStart ? `Est. ${fmt(ctx.ovWinStart)} – ${fmt(ctx.ovWinEnd)}` : '--';
    document.getElementById('next-fertile').textContent = ctx.fertileStart ? `${fmt(ctx.fertileStart)} – ${fmt(ctx.ovWinEnd)}` : '--';
    document.getElementById('next-period').textContent = ctx.predictedPeriod ? `Est. ${fmt(ctx.predictedPeriod)}` : '--';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  document.getElementById('date-temp').valueAsDate = new Date();
  document.getElementById('date-sx').valueAsDate = new Date();
  initializeChart();
  if (cycleData.length > 0) { 
    updateChartData(); 
    calculateInsights(); 
  }
};

// ── DATA MANAGEMENT ───────────────────────────────────────────────────────────
function exportData() {
  const json = JSON.stringify(cycleData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cycle-data-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const entries = JSON.parse(text);
    if (!Array.isArray(entries)) return alert('Invalid file format.');
    const batch = writeBatch(db);
    entries.forEach(e => {
      if (!e.date) return;
      batch.set(doc(db, 'cycle_entries', e.date), e);
    });
    await batch.commit();
    alert(`Imported ${entries.length} entries.`);
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
  event.target.value = '';
}

async function clearData() {
  if (!confirm('Delete all data? This cannot be undone.')) return;
  const snapshot = await getDocs(entriesCol);
  const batch = writeBatch(db);
  snapshot.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// Global Exposure for HTML Buttons
window.addTempData = addTempData;
window.addSymptomsData = addSymptomsData;
window.exportData = exportData;
window.importData = importData;
window.clearData = clearData;