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
let symptomsChart;

// ── REAL-TIME CLOUD SYNC ──────────────────────────────────────────────────────
onSnapshot(entriesCol, (snapshot) => {
  cycleData = [];
  snapshot.forEach(doc => cycleData.push(doc.data()));
  cycleData.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (bbtChart) {
    updateChartData();
    calculateInsights();
    updateSymptomsChart();
  }
});

// ── DATA ENTRY: TEMPERATURE ───────────────────────────────────────────────────
async function addTempData() {
  const dateInput = document.getElementById('date-temp').value;
  const tempInput = parseFloat(document.getElementById('temp').value);
  const flowInput = document.getElementById('flow').value;

  if (!dateInput || isNaN(tempInput)) {
    alert('Please enter both a date and a temperature.');
    return;
  }

  // Merge with any existing entry for that date (preserves cm/symptoms logged separately)
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { cm: '', symptoms: '' };

  await setDoc(entryRef, {
    ...base,
    date: dateInput,
    temp: tempInput,
    flow: flowInput,
  });

  document.getElementById('temp').value = '';
  document.getElementById('flow').value = '';
}

// ── DATA ENTRY: SYMPTOMS & MUCUS ─────────────────────────────────────────────
async function addSymptomsData() {
  const dateInput = document.getElementById('date-sx').value;
  const cmInput   = document.getElementById('cm').value;
  const sympInput = document.getElementById('symptoms').value;

  if (!dateInput) {
    alert('Please select a date.');
    return;
  }

  // Merge with any existing entry for that date (preserves temp logged separately)
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { temp: null, flow: '' };

  await setDoc(entryRef, {
    ...base,
    date: dateInput,
    cm: cmInput,
    symptoms: sympInput,
  });

  document.getElementById('cm').value = '';
  document.getElementById('symptoms').value = '';
}

// ── DATA MANAGEMENT ───────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(cycleData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ctracker-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      const batch = writeBatch(db);
      imported.forEach(entry => {
        const docRef = doc(db, 'cycle_entries', entry.date);
        batch.set(docRef, entry);
      });
      await batch.commit();
      alert(`Successfully uploaded ${imported.length} entries to your cloud!`);
    } catch {
      alert('Could not read file. Make sure it is a valid JSON export.');
    }
  };
  reader.readAsText(file);
}

async function clearData() {
  if (!confirm('Clear ALL data from your cloud? Export a backup first!')) return;
  const snap = await getDocs(entriesCol);
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

window.addTempData     = addTempData;
window.addSymptomsData = addSymptomsData;
window.exportData      = exportData;
window.importData      = importData;
window.clearData       = clearData;

// ── CYCLE ANALYSIS HELPERS ────────────────────────────────────────────────────
function detectOvulation() {
  if (cycleData.length < 6) return null;
  const temps = cycleData.map(e => e.temp);
  for (let i = 6; i < temps.length; i++) {
    const baseline = temps.slice(i - 6, i).reduce((a, b) => a + b, 0) / 6;
    if (temps[i] - baseline >= 0.18 && (i + 1 >= temps.length || temps[i + 1] > baseline + 0.1)) {
      return cycleData[i - 1].date;
    }
  }
  return null;
}

function detectPeriods() {
  const periods = [];
  let inPeriod = false;
  let start = null;
  for (const e of cycleData) {
    if (e.flow && !inPeriod) { inPeriod = true; start = e.date; }
    else if (!e.flow && inPeriod) {
      periods.push({ start, end: cycleData[cycleData.indexOf(e) - 1]?.date || start });
      inPeriod = false;
    }
  }
  if (inPeriod && cycleData.length > 0) periods.push({ start, end: cycleData[cycleData.length - 1].date });
  return periods;
}

function getCycleContext() {
  const ovDay = detectOvulation();
  const periods = detectPeriods();
  const lastPeriod = periods[periods.length - 1];
  const prevPeriod = periods[periods.length - 2];

  let cycleLength = 27;
  if (lastPeriod && prevPeriod) {
    cycleLength = Math.round((new Date(lastPeriod.start) - new Date(prevPeriod.start)) / 86400000);
  }

  let lpLength = 13;
  if (ovDay && lastPeriod) {
    lpLength = Math.round((new Date(lastPeriod.start) - new Date(ovDay)) / 86400000);
  }

  const periodStart = lastPeriod ? new Date(lastPeriod.start) : null;
  const predictedPeriod    = periodStart ? new Date(+periodStart + cycleLength * 86400000) : null;
  const predictedOvulation = periodStart ? new Date(+periodStart + (cycleLength - lpLength) * 86400000) : null;
  const fertileStart       = predictedOvulation ? new Date(+predictedOvulation - 5 * 86400000) : null;

  return { ovDay, periods, lastPeriod, cycleLength, lpLength, predictedPeriod, predictedOvulation, fertileStart };
}

function getPhaseForDate(dateStr, ctx) {
  const d = new Date(dateStr);
  const ovDate = ctx.ovDay ? new Date(ctx.ovDay) : null;
  const fertileStart = ovDate ? new Date(+ovDate - 5 * 86400000) : null;

  for (const p of ctx.periods) {
    const ps = new Date(p.start);
    const pe = new Date(p.end);
    if (d >= ps && d <= pe) return 'period';
  }
  if (ovDate && dateStr === ctx.ovDay) return 'ovulation';
  if (ovDate && fertileStart && d >= fertileStart && d <= ovDate) return 'fertile';
  if (ovDate && d > ovDate) return 'luteal';
  return 'follicular';
}

// ── BBT CHART ─────────────────────────────────────────────────────────────────
function initializeChart() {
  const ctx = document.getElementById('bbtChart').getContext('2d');
  bbtChart = new Chart(ctx, {
    type: 'line',
    data: getChartDataStructure(),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Date', color: '#6b4f55', font: { family: 'DM Sans' } },
          ticks: { color: '#6b4f55', font: { family: 'DM Sans', size: 11 }, maxRotation: 45 },
          grid: { color: 'rgba(200,160,165,0.12)' }
        },
        y: {
          title: { display: true, text: 'Temp °C', color: '#6b4f55', font: { family: 'DM Sans' } },
          min: 35.5, max: 37.2,
          ticks: { stepSize: 0.1, color: '#6b4f55', font: { family: 'DM Sans', size: 11 } },
          grid: { color: 'rgba(200,160,165,0.12)' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2c1f22',
          titleFont: { family: 'DM Sans' },
          bodyFont: { family: 'DM Sans' },
          callbacks: {
            title: ctx => cycleData[ctx[0].dataIndex]?.date || '',
            label: ctx => {
              const e = cycleData[ctx.dataIndex];
              let parts = [`Temp: ${e.temp}°C`];
              if (e.flow)     parts.push(`Flow: ${e.flow}`);
              if (e.cm)       parts.push(`CM: ${e.cm}`);
              if (e.symptoms) parts.push(`Symptoms: ${e.symptoms}`);
              return parts;
            }
          }
        }
      }
    }
  });
}

function getChartDataStructure() {
  const ctx = getCycleContext();
  const ovDateObj = ctx.ovDay ? new Date(ctx.ovDay) : null;

  const labels = cycleData.map(e => new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const temps  = cycleData.map(e => e.temp);

  const pointColors = cycleData.map(e => {
    if (e.flow)                    return '#e05555';
    if (e.date === ctx.ovDay)      return '#9b59b6';
    if (e.symptoms === 'migraine') return '#222';
    if (ovDateObj) {
      const d = new Date(e.date);
      const fertileStart = new Date(+ovDateObj - 5 * 86400000);
      if (d >= fertileStart && d <= ovDateObj) return '#2ed573';
      if (d > ovDateObj) return '#8bb6e0';
    }
    if (e.cm === 'egg-white') return '#2ed573';
    return '#d4768a';
  });

  const pointRadii = cycleData.map(e =>
    (e.flow || e.date === ctx.ovDay || e.symptoms === 'migraine' || e.cm === 'egg-white') ? 7 : 4
  );
  const pointStyles = cycleData.map(e =>
    e.symptoms === 'migraine' ? 'rectRot' : e.date === ctx.ovDay ? 'star' : 'circle'
  );

  return {
    labels,
    datasets: [{
      label: 'BBT',
      data: temps,
      borderColor: 'rgba(201,123,132,0.4)',
      borderWidth: 2,
      fill: false,
      tension: 0.35,
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      pointRadius: pointRadii,
      pointStyle: pointStyles,
      spanGaps: true
    }]
  };
}

function updateChartData() {
  bbtChart.data = getChartDataStructure();
  bbtChart.update();
}

// ── SYMPTOMS CHART ────────────────────────────────────────────────────────────
function initializeSymptomsChart() {
  const ctx = document.getElementById('symptomsChart').getContext('2d');
  symptomsChart = new Chart(ctx, {
    type: 'bar',
    data: getSymptomsChartData(),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Cycle Phase', color: '#6b4f55', font: { family: 'DM Sans' } },
          ticks: { color: '#6b4f55', font: { family: 'DM Sans', size: 11 } },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: 'Days logged', color: '#6b4f55', font: { family: 'DM Sans' } },
          ticks: { color: '#6b4f55', font: { family: 'DM Sans', size: 11 }, stepSize: 1 },
          grid: { color: 'rgba(200,160,165,0.12)' },
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          labels: { color: '#6b4f55', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: '#2c1f22',
          titleFont: { family: 'DM Sans' },
          bodyFont: { family: 'DM Sans' },
        }
      }
    }
  });
}

function getSymptomsChartData() {
  const ctx = getCycleContext();
  const phases = ['follicular', 'fertile', 'ovulation', 'luteal', 'period'];
  const phaseLabels = ['Follicular', 'Fertile', 'Ovulation', 'Luteal', 'Period'];
  const symptoms = ['migraine', 'bloating', 'breast-tenderness'];
  const symptomLabels = ['Migraine', 'Bloating', 'Breast Tenderness'];
  const colors = ['#222', '#c97b84', '#8bb6e0'];

  const counts = symptoms.map(() => phases.map(() => 0));

  for (const entry of cycleData) {
    if (!entry.symptoms) continue;
    const phase = getPhaseForDate(entry.date, ctx);
    const phaseIdx = phases.indexOf(phase);
    const symIdx = symptoms.indexOf(entry.symptoms);
    if (phaseIdx >= 0 && symIdx >= 0) counts[symIdx][phaseIdx]++;
  }

  return {
    labels: phaseLabels,
    datasets: symptoms.map((_, i) => ({
      label: symptomLabels[i],
      data: counts[i],
      backgroundColor: colors[i] + 'cc',
      borderColor: colors[i],
      borderWidth: 1,
      borderRadius: 4,
    }))
  };
}

function updateSymptomsChart() {
  symptomsChart.data = getSymptomsChartData();
  symptomsChart.update();
}

// ── INSIGHTS ──────────────────────────────────────────────────────────────────
function calculateInsights() {
  const ctx = getCycleContext();

  const folTemps = ctx.ovDay
    ? cycleData.filter(e => new Date(e.date) <= new Date(ctx.ovDay)).map(e => e.temp)
    : cycleData.slice(0, Math.floor(cycleData.length / 2)).map(e => e.temp);
  const lutTemps = (ctx.ovDay && ctx.lastPeriod)
    ? cycleData.filter(e => new Date(e.date) > new Date(ctx.ovDay) && new Date(e.date) < new Date(ctx.lastPeriod.start)).map(e => e.temp)
    : [];

  const avg = arr => arr.length ? (arr.reduce((a,b) => a+b,0)/arr.length).toFixed(2) : '--';
  document.getElementById('avg-fol').textContent = avg(folTemps);
  document.getElementById('avg-lut').textContent = avg(lutTemps);

  if (ctx.ovDay) {
    document.getElementById('ov-status').textContent = 'Confirmed ✦';
    document.getElementById('ov-status').style.color = '#9b59b6';
    document.getElementById('ov-prediction').textContent = `Detected around ${ctx.ovDay}`;
  } else {
    document.getElementById('ov-status').textContent = 'Not yet';
    document.getElementById('ov-status').style.color = '#ccc';
    document.getElementById('ov-prediction').textContent = 'Watching for biphasic shift.';
  }

  const fmt = (d, opts) => d ? d.toLocaleDateString(undefined, opts || { weekday:'short', month:'short', day:'numeric' }) : '--';
  const shortFmt = d => fmt(d, { month:'short', day:'numeric' });
  document.getElementById('next-period').textContent    = fmt(ctx.predictedPeriod);
  document.getElementById('next-ovulation').textContent = fmt(ctx.predictedOvulation);
  document.getElementById('next-fertile').textContent   = ctx.fertileStart
    ? `${shortFmt(ctx.fertileStart)} – ${shortFmt(ctx.predictedOvulation)}` : '--';

  const migraineEntries = cycleData.filter(e => e.symptoms === 'migraine');
  const symptomEl = document.getElementById('symptom-pattern');
  if (symptomEl) {
    if (migraineEntries.length > 0 && ctx.lastPeriod) {
      const daysBefore = migraineEntries
        .map(e => Math.round((new Date(ctx.lastPeriod.start) - new Date(e.date)) / 86400000))
        .filter(d => d >= 0 && d <= 5);
      if (daysBefore.length) {
        const avgNum = (daysBefore.reduce((a,b) => a+b,0) / daysBefore.length).toFixed(0);
        symptomEl.innerHTML = `🧠 <strong>Pattern detected.</strong> Your migraines tend to appear ~${avgNum} day${avgNum==1?'':'s'} before your period.`;
      } else {
        symptomEl.textContent = 'Log more data to see migraine patterns.';
      }
    } else {
      symptomEl.textContent = 'Log more data to see migraine patterns.';
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = function () {
  const today = new Date();
  document.getElementById('date-temp').valueAsDate = today;
  document.getElementById('date-sx').valueAsDate = today;
  initializeChart();
  initializeSymptomsChart();
  calculateInsights();
};