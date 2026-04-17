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

  // THE FIX: We removed "&& symptomsChart" so it no longer waits for the old graph
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

  if (!dateInput || isNaN(tempInput)) {
    alert('Please enter both a date and a temperature.');
    return;
  }

  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { cm: '', symptoms: '', flow: false };

  await setDoc(entryRef, {
    ...base,
    date: dateInput,
    temp: tempInput,
  });

  document.getElementById('temp').value = '';
}

// ── DATA ENTRY: SYMPTOMS & MUCUS ─────────────────────────────────────────────
async function addSymptomsData() {
  const dateInput = document.getElementById('date-sx').value;
  const cmInput   = document.getElementById('cm').value;
  const flowInput = document.getElementById('flow').checked;

  // NEW LOGIC: Find all checked boxes, grab their values, and join with a comma
  const checkedBoxes = document.querySelectorAll('.symptom-box:checked');
  const sympInput = Array.from(checkedBoxes).map(box => box.value).join(', ');

  if (!dateInput) {
    alert('Please select a date.');
    return;
  }

  const entryRef = doc(db, 'cycle_entries', dateInput);
  const existing = await getDoc(entryRef);
  const base = existing.exists() ? existing.data() : { temp: null };

  await setDoc(entryRef, {
    ...base,
    date: dateInput,
    cm: cmInput,
    symptoms: sympInput,
    flow: flowInput,
  });

  // CLEAR THE FORM
  document.getElementById('cm').value = '';
  document.getElementById('flow').checked = false;
  document.querySelectorAll('.symptom-box').forEach(box => box.checked = false); // Uncheck all boxes
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
    if ((e.flow === true || (typeof e.flow === 'string' && e.flow)) && !inPeriod) { inPeriod = true; start = e.date; }
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

  // Check if in a period first
  for (const p of ctx.periods) {
    const ps = new Date(p.start);
    const pe = new Date(p.end);
    if (d >= ps && d <= pe) return 'period';
  }

  // Find the most recent period start before this date
  const lastPeriodBeforeDate = [...ctx.periods]
    .filter(p => new Date(p.start) <= d)
    .sort((a, b) => new Date(b.start) - new Date(a.start))[0];

  // If ovulation happened BEFORE the most recent period, it belongs to the
  // previous cycle — this date is in a new cycle → follicular
  if (ovDate && lastPeriodBeforeDate && ovDate < new Date(lastPeriodBeforeDate.start)) {
    return 'follicular';
  }

  if (ovDate && dateStr === ctx.ovDay) return 'ovulation';
  if (ovDate && fertileStart && d >= fertileStart && d <= ovDate) return 'fertile';
  if (ovDate && d > ovDate) return 'luteal';
  return 'follicular';
}


// ── CYCLE DAY CALCULATOR ──────────────────────────────────────────────────────
// Returns "Day X" where Day 1 = second day of period.
// The first day of bleeding belongs to the PREVIOUS cycle.
function getCycleDay(dateStr, ctx) {
  const d = new Date(dateStr);

  // If you haven't logged any periods at all, we can't calculate a cycle day
  if (!ctx.periods || ctx.periods.length === 0) {
    return "Log a period first";
  }

  // 1. Define "Day 1" for all cycles as the SECOND day of the period (+24 hours)
  const cycleStarts = ctx.periods.map(p => {
    const pStart = new Date(p.start);
    return new Date(pStart.getTime() + 86400000); 
  });

  // 2. Find the most recent "Day 1" that happened on or before our target date
  const startsBeforeDate = cycleStarts
    .filter(start => start <= d)
    .sort((a, b) => b - a);

  // 3. If no "Day 1" happened yet, we are in the baseline cycle you manually defined
  if (startsBeforeDate.length === 0) {
    const firstPeriodStart = new Date(ctx.periods[0].start);
    const daysBeforeFirstPeriod = Math.round((firstPeriodStart - d) / 86400000);
    
    // You stated the first period's start date was Day 33. 
    // This counts backwards for all dates before it.
    return "Day " + (33 - daysBeforeFirstPeriod);
  }

  // 4. If we are inside a tracked cycle, count normally from its Day 1
  const cycleStart = startsBeforeDate[0];
  const daysSinceStart = Math.round((d - cycleStart) / 86400000);
  
  return "Day " + (daysSinceStart + 1); 
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
          ticks: { color: '#111111', font: { family: 'DM Sans', size: 11, weight: '500' }, maxRotation: 45 },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        y: {
          title: { display: true, text: 'Temp °C', color: '#6b4f55', font: { family: 'DM Sans' } },
          min: 35.5, max: 37.2,
          ticks: { stepSize: 0.1, color: '#111111', font: { family: 'DM Sans', size: 11, weight: '500' } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2c1f22',
          titleFont: { family: 'DM Sans' },
          bodyFont: { family: 'DM Sans' },
          callbacks: {
            title: ctx => {
              const e = cycleData[ctx[0].dataIndex];
              if (!e) return '';
              const cycleCtx = getCycleContext();
              const day = getCycleDay(e.date, cycleCtx);
              return `${e.date}  ·  Cycle Day ${day}`;
            },
            label: ctx => {
              const e = cycleData[ctx.dataIndex];
              let parts = [`Temp: ${e.temp}°C`];
              if (e.flow === true || (typeof e.flow === 'string' && e.flow)) parts.push('🔴 Period');
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

  // Fertile window logic:
  // - If ovulation is confirmed: exactly the 5 days before ovulation (strict, overrides egg-white)
  // - If no ovulation yet: span from first to last egg-white day as a fallback
  const ovDateObj = ctx.ovDay ? new Date(ctx.ovDay) : null;
  const fertileWindowStart = ovDateObj ? new Date(+ovDateObj - 5 * 86400000) : null;
  const fertileWindowEnd   = ovDateObj ? new Date(+ovDateObj - 86400000) : null;

  const ewDates = !ovDateObj
    ? cycleData.filter(e => e.cm === 'egg-white').map(e => e.date).sort()
    : [];
  const ewStart = ewDates.length ? ewDates[0] : null;
  const ewEnd   = ewDates.length ? ewDates[ewDates.length - 1] : null;

  const pointColors = cycleData.map(e => {
    if (e.flow === true || (typeof e.flow === 'string' && e.flow)) return '#e05555';
    if (e.date === ctx.ovDay) return '#9b59b6';
    if (e.symptoms && e.symptoms.includes('migraine')) return '#222';
    const phase = getPhaseForDate(e.date, ctx);
    if (phase === 'luteal') return '#8bb6e0';
    if (fertileWindowStart && fertileWindowEnd) {
      const d = new Date(e.date);
      if (d >= fertileWindowStart && d <= fertileWindowEnd) return '#2ed573';
      return '#b0836a';
    }
    if (ewStart && ewEnd && e.date >= ewStart && e.date <= ewEnd) return '#2ed573';
    return '#b0836a';
  });

  const pointRadii = cycleData.map(() => 5); // uniform size for all points

  const pointStyles = cycleData.map(e =>
    (e.symptoms && e.symptoms.includes('migraine')) ? 'rectRot' : e.date === ctx.ovDay ? 'star' : 'circle'
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

// ── SYMPTOMS CHART (CSS GRID TAPESTRY) ─────────────────────────────────────────

function initializeSymptomsChart() {
  // We no longer need Chart.js for this, so we just pass the baton to the update function
  updateSymptomsChart();
}

function updateSymptomsChart() {
  const container = document.getElementById('symptomsTapestry');
  if (!container) return; 

  const ctx = getCycleContext();
  const totalCycles = Math.max(1, ctx.periods.length);

  // 1. Find all unique symptoms
  const uniqueSymptoms = new Set();
  cycleData.forEach(e => {
    if (e.symptoms) {
      e.symptoms.split(', ').forEach(s => {
        if (s.trim() !== '' && s !== 'period') uniqueSymptoms.add(s.trim());
      });
    }
  });
  const symptomsList = Array.from(uniqueSymptoms);

  // 2. Count occurrences (-7 to +3)
  const counts = {};
  symptomsList.forEach(sym => {
    counts[sym] = {};
    for (let i = -7; i <= 3; i++) counts[sym][i] = 0;
  });

  for (const entry of cycleData) {
    if (!entry.symptoms) continue;

    let minDiff = Infinity;
    for (const p of ctx.periods) {
      const pStart = new Date(p.start);
      const eDate = new Date(entry.date);
      const diffDays = Math.round((eDate - pStart) / 86400000);
      if (Math.abs(diffDays) < Math.abs(minDiff)) minDiff = diffDays;
    }

    if (minDiff !== Infinity && minDiff >= -7 && minDiff <= 3) {
      entry.symptoms.split(', ').forEach(sym => {
        const cleanSym = sym.trim();
        if (counts[cleanSym] && counts[cleanSym][minDiff] !== undefined) {
          counts[cleanSym][minDiff]++;
        }
      });
    }
  }

  // 3. Build the Grid HTML dynamically
  let html = `<div class="tapestry-grid">`;

  // Draw the Header Row (The Days)
  html += `<div class="tapestry-label" style="opacity: 0;">Day</div>`; // Invisible placeholder for layout
  for (let day = -7; day <= 3; day++) {
    html += `<div class="tapestry-header-cell ${day === 0 ? 'day-one' : ''}">${day === 0 ? 'Day 1' : day}</div>`;
  }

  // A cohesive color palette using RGB so we can manipulate the opacity
  // Matches your CSS variables: Rose, Mauve, Blue, Red, Green
  const colorPalette = ['201, 123, 132', '155, 89, 182', '139, 182, 224', '224, 85, 85', '46, 213, 115'];

  // Draw the Data Rows (The Symptoms)
  symptomsList.forEach((sym, index) => {
    const rgb = colorPalette[index % colorPalette.length];
    const displayName = sym.charAt(0).toUpperCase() + sym.slice(1);

    // Symptom Name Label
    html += `<div class="tapestry-label">${displayName}</div>`;

    // The Color Blocks
    for (let day = -7; day <= 3; day++) {
      const count = counts[sym][day];
      const prob = count > 0 ? Math.round((count / totalCycles) * 100) : 0;
      
      // Minimum 20% opacity so single occurrences are still visible
      let alpha = 0;
      if (count > 0) alpha = Math.max(0.2, prob / 100);

      html += `<div class="tapestry-cell" style="background-color: rgba(${rgb}, ${alpha});" title="${displayName}: ${prob}% frequency"></div>`;
    }
  });

  html += `</div>`;
  
  // Inject the HTML into the page
  container.innerHTML = html;
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

  // CHANGED: Now looks inside string for migraine pattern
  const migraineEntries = cycleData.filter(e => e.symptoms && e.symptoms.includes('migraine'));
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
  // Always refresh from whatever data has arrived by now
  if (cycleData.length > 0) {
    updateChartData();
    updateSymptomsChart();
  }
  calculateInsights();
};