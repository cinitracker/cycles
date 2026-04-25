// ── FIREBASE CLOUD SETUP ──────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwmyqSeMeME5JQOXtLl8-pqKRBFJkGmoU",
  authDomain: "cycletracker-e2a24.firebaseapp.com",
  projectId: "cycletracker-e2a24",
  storageBucket: "cycletracker-e2a24.firebasestorage.app",
  messagingSenderId: "978749842347",
  appId: "1:978749842347:web:851c918d1a348f2b1968ee"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const entriesCol = collection(db, 'cycle_entries');

let cycleData = [];
let bbtChart;

onSnapshot(entriesCol, (snapshot) => {
  cycleData = [];
  snapshot.forEach(doc => cycleData.push(doc.data()));
  cycleData.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (bbtChart) { updateChartData(); calculateInsights(); }
});

// ── DATA ENTRY ───────────────────────────────────────────────────────────────
async function addTempData() {
  const dateInput = document.getElementById('date-temp').value;
  const tempInput = parseFloat(document.getElementById('temp').value);
  if (!dateInput || isNaN(tempInput)) return alert('Enter date and temp.');
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { cm: '', symptoms: '', flow: false };
  await setDoc(entryRef, { ...base, date: dateInput, temp: tempInput });
  document.getElementById('temp').value = '';
}

async function addSymptomsData() {
  const dateInput = document.getElementById('date-sx').value;
  const cmInput = document.getElementById('cm').value;
  const flowInput = document.getElementById('flow').checked;
  const sympInput = Array.from(document.querySelectorAll('.symptom-box:checked')).map(b => b.value).join(', ');
  if (!dateInput) return alert('Select a date.');
  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { temp: null };
  await setDoc(entryRef, { ...base, date: dateInput, cm: cmInput, symptoms: sympInput, flow: flowInput });
  document.getElementById('cm').value = '';
  document.getElementById('flow').checked = false;
  document.querySelectorAll('.symptom-box').forEach(b => b.checked = false);
}

// ── DETECTION ────────────────────────────────────────────────────────────────
function detectPeriods() {
  const periods = [];
  let inP = false, start = null;
  cycleData.forEach((e, i) => {
    const isB = (e.flow === true || e.flow === 'true');
    if (isB && !inP) { inP = true; start = e.date; }
    else if (!isB && inP) { periods.push({ start, end: cycleData[i - 1].date }); inP = false; }
  });
  if (inP) periods.push({ start, end: cycleData[cycleData.length - 1].date });
  return periods;
}

function detectOvulation() {
  const periods = detectPeriods();
  const allOv = [];
  
  // Group history into cycles based on period starts
  for (let p = 0; p < periods.length; p++) {
    const start = new Date(periods[p].start);
    const nextStart = periods[p+1] ? new Date(periods[p+1].start) : new Date('2100-01-01');
    const cycleEntries = cycleData.filter(e => {
      const d = new Date(e.date);
      return d >= start && d < nextStart;
    });

    // 1. Check for Manual Tag in this cycle
    const manual = cycleEntries.find(e => e.symptoms?.includes('ovulation-manual'));
    if (manual) { allOv.push(manual.date); continue; }

    // 2. Auto Math: Find ONLY the first valid spike in this cycle
    const valid = cycleEntries.filter(e => typeof e.temp === 'number');
    for (let i = 3; i <= valid.length - 3; i++) {
      const baseline = Math.max(valid[i-3].temp, valid[i-2].temp, valid[i-1].temp);
      if (valid[i].temp > baseline && valid[i+1].temp > baseline && valid[i+2].temp > baseline) {
        allOv.push(valid[i-1].date);
        break; // Stop looking after first detection in this cycle
      }
    }
  }
  return allOv;
}

function getCycleContext() {
  const allOv = detectOvulation();
  const periods = detectPeriods();
  const lastPeriod = periods[periods.length - 1];
  const lastOv = allOv.length > 0 ? [...allOv].sort().reverse()[0] : null;
  const pStart = lastPeriod ? new Date(lastPeriod.start) : null;
  const isOvThisCycle = (lastOv && pStart && new Date(lastOv) > pStart);
  
  return { ovDay: lastOv, allOvDays: allOv, periods, lastPeriod, isOvThisCycle, lpLength: 14 };
}

function getPhaseForDate(dateStr, ctx) {
  const d = new Date(dateStr);
  for (const p of ctx.periods) if (d >= new Date(p.start) && d <= new Date(p.end)) return 'period';
  
  const relevantOv = [...ctx.allOvDays].filter(ov => new Date(ov) <= d).sort((a,b) => new Date(b) - new Date(a))[0];
  if (relevantOv) {
    const ovD = new Date(relevantOv);
    if (dateStr === relevantOv) return 'ovulation';
    if (d > ovD) {
      const nextP = ctx.periods.find(p => new Date(p.start) > ovD);
      if (!nextP || d < new Date(nextP.start)) return 'luteal';
    }
    // Fertile window: 5 days before confirmed ovulation
    const fStart = new Date(+ovD - 5 * 86400000);
    if (d >= fStart && d < ovD) return 'fertile';
  }
  return 'follicular';
}

// ── CHART ────────────────────────────────────────────────────────────────────
function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function getChartDataStructure() {
  const ctx = getCycleContext();
  const colors = {
    period: getCssVar('--period-col'), ov: getCssVar('--ovulation'), migraine: getCssVar('--migraine'),
    luteal: getCssVar('--luteal'), fertile: getCssVar('--fertile'), fol: getCssVar('--follicular')
  };

  return {
    labels: cycleData.map(e => new Date(e.date).toLocaleDateString(undefined, { month:'short', day:'numeric' })),
    datasets: [{
      data: cycleData.map(e => e.temp),
      borderColor: 'rgba(255,255,255,0.35)', borderWidth: 2, tension: 0.3, spanGaps: true,
      pointBackgroundColor: cycleData.map(e => {
        const ph = getPhaseForDate(e.date, ctx);
        if (e.flow || e.flow === 'true') return colors.period;
        if (ctx.allOvDays.includes(e.date)) return colors.ov;
        if (e.symptoms?.includes('migraine')) return colors.migraine;
        if (ph === 'luteal') return colors.luteal;
        if (ph === 'fertile') return colors.fertile;
        return colors.fol;
      }),
      pointBorderColor: cycleData.map(e => ctx.allOvDays.includes(e.date) ? colors.ov : 'transparent'),
      pointBorderWidth: cycleData.map(e => ctx.allOvDays.includes(e.date) ? 2 : 0),
      pointRadius: cycleData.map(e => ctx.allOvDays.includes(e.date) ? 8 : 5),
      pointStyle: cycleData.map(e => ctx.allOvDays.includes(e.date) ? 'star' : (e.symptoms?.includes('migraine') ? 'rectRot' : 'circle'))
    }]
  };
}

function updateChartData() {
  if (!bbtChart) return;
  bbtChart.data = getChartDataStructure();
  const len = bbtChart.data.labels.length;
  if (len > 12) { bbtChart.options.scales.x.min = len - 12; bbtChart.options.scales.x.max = len - 1; }
  bbtChart.update();
}

function initializeChart() {
  const el = document.getElementById('bbtChart').getContext('2d');
  bbtChart = new Chart(el, {
    type: 'line', data: getChartDataStructure(),
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#fff' }, grid: { display: false } },
        y: { min: 35.8, max: 37.2, ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function calculateInsights() {
  const ctx = getCycleContext();
  const status = document.getElementById('ov-status');
  const pred = document.getElementById('ov-prediction');
  if (ctx.isOvThisCycle) {
    status.textContent = 'Confirmed ✦'; status.style.color = getCssVar('--ovulation');
    pred.textContent = `Shift detected. Phase: Luteal.`;
  } else {
    status.textContent = 'Not yet'; status.style.color = '#ccc';
    pred.textContent = 'Tracking follicular baseline...';
  }
}

window.onload = () => {
  document.getElementById('date-temp').valueAsDate = new Date();
  document.getElementById('date-sx').valueAsDate = new Date();
  initializeChart();
  if (cycleData.length > 0) { updateChartData(); calculateInsights(); }
};

window.addTempData = addTempData; window.addSymptomsData = addSymptomsData;