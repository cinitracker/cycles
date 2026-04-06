// ── DEFAULT DATA (first load only) ──────────────────────────────────────────
const DEFAULT_DATA = [
  { date: '2026-03-12', temp: 36.27, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-13', temp: 36.59, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-14', temp: 36.06, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-15', temp: 36.34, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-16', temp: 36.44, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-17', temp: 35.85, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-18', temp: 36.50, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-19', temp: 36.34, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-20', temp: 36.45, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-21', temp: 36.70, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-22', temp: 36.65, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-23', temp: 36.70, flow: '', cm: 'creamy', symptoms: 'bloating' },
  { date: '2026-03-24', temp: 36.80, flow: '', cm: '', symptoms: 'bloating' },
  { date: '2026-03-26', temp: 36.40, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-27', temp: 36.68, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-28', temp: 36.60, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-29', temp: 36.96, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-30', temp: 36.85, flow: '', cm: '', symptoms: '' },
  { date: '2026-03-31', temp: 36.97, flow: '', cm: '', symptoms: 'migraine' },
  { date: '2026-04-01', temp: 36.57, flow: '', cm: '', symptoms: 'bloating' },
  { date: '2026-04-02', temp: 36.39, flow: 'heavy', cm: '', symptoms: '' },
  { date: '2026-04-03', temp: 36.45, flow: 'heavy', cm: '', symptoms: '' },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let cycleData = loadData();
let bbtChart;
let chatHistory = [];

// ── PERSISTENCE ──────────────────────────────────────────────────────────────
function loadData() {
  try {
    const stored = localStorage.getItem('ctracker_data');
    return stored ? JSON.parse(stored) : [...DEFAULT_DATA];
  } catch { return [...DEFAULT_DATA]; }
}

function saveData() {
  localStorage.setItem('ctracker_data', JSON.stringify(cycleData));
}

function exportData() {
  const blob = new Blob([JSON.stringify(cycleData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ctracker-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      cycleData = imported.sort((a, b) => new Date(a.date) - new Date(b.date));
      saveData();
      updateChartData();
      calculateInsights();
      alert(`Imported ${cycleData.length} entries.`);
    } catch { alert('Could not read file. Make sure it is a valid CTracker JSON export.'); }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm('Clear ALL data? This cannot be undone. Export a backup first!')) return;
  cycleData = [];
  saveData();
  updateChartData();
  calculateInsights();
  document.getElementById('daily-note-section').style.display = 'none';
}

// ── API KEY ───────────────────────────────────────────────────────────────────
function getApiKey() { return true; }

// ── DATA ENTRY ────────────────────────────────────────────────────────────────
async function addDailyData() {
  const dateInput = document.getElementById('date').value;
  const tempInput = parseFloat(document.getElementById('temp').value);
  const flowInput = document.getElementById('flow').value;
  const cmInput   = document.getElementById('cm').value;
  const sympInput = document.getElementById('symptoms').value;

  if (!dateInput || isNaN(tempInput)) {
    alert('Please enter both a date and a temperature.');
    return;
  }

  // Remove existing entry for same date if re-logging
  cycleData = cycleData.filter(e => e.date !== dateInput);
  cycleData.push({ date: dateInput, temp: tempInput, flow: flowInput, cm: cmInput, symptoms: sympInput });
  cycleData.sort((a, b) => new Date(a.date) - new Date(b.date));
  saveData();

  document.getElementById('temp').value = '';
  document.getElementById('flow').value = '';
  document.getElementById('cm').value = '';
  document.getElementById('symptoms').value = '';

  updateChartData();
  calculateInsights();

  // Trigger daily AI note
  await generateDailyNote({ date: dateInput, temp: tempInput, flow: flowInput, cm: cmInput, symptoms: sympInput });
}

// ── CYCLE ANALYSIS HELPERS ───────────────────────────────────────────────────
function detectOvulation() {
  if (cycleData.length < 6) return null;
  const temps = cycleData.map(e => e.temp);
  // Look for a sustained rise of ≥0.2°C above the previous 6-day mean
  for (let i = 6; i < temps.length; i++) {
    const baseline = temps.slice(i - 6, i).reduce((a, b) => a + b, 0) / 6;
    if (temps[i] - baseline >= 0.18 && (i + 1 >= temps.length || temps[i + 1] > baseline + 0.1)) {
      return cycleData[i - 1].date; // day before the rise = ovulation
    }
  }
  return null;
}

function detectPeriods() {
  // Returns array of { start, end } objects
  const periods = [];
  let inPeriod = false;
  let start = null;
  for (const e of cycleData) {
    if (e.flow && !inPeriod) { inPeriod = true; start = e.date; }
    else if (!e.flow && inPeriod) { periods.push({ start, end: cycleData[cycleData.indexOf(e) - 1]?.date || start }); inPeriod = false; }
  }
  if (inPeriod) periods.push({ start, end: cycleData[cycleData.length - 1].date });
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

  // Predicted next cycle
  const predictedPeriod    = periodStart ? new Date(+periodStart + cycleLength * 86400000) : null;
  const predictedOvulation = periodStart ? new Date(+periodStart + (cycleLength - lpLength) * 86400000) : null;
  const fertileStart       = predictedOvulation ? new Date(+predictedOvulation - 5 * 86400000) : null;

  return { ovDay, periods, lastPeriod, cycleLength, lpLength, predictedPeriod, predictedOvulation, fertileStart };
}

function buildDataSummary() {
  const ctx = getCycleContext();
  const today = new Date().toISOString().slice(0, 10);
  const recentEntries = cycleData.slice(-7);
  const recentSummary = recentEntries.map(e =>
    `${e.date}: ${e.temp}°C${e.flow ? ' | flow:' + e.flow : ''}${e.cm ? ' | cm:' + e.cm : ''}${e.symptoms ? ' | sx:' + e.symptoms : ''}`
  ).join('\n');

  const symptomsAll = cycleData.filter(e => e.symptoms).map(e => `${e.date}: ${e.symptoms}`).join(', ');

  return `USER CYCLE DATA SUMMARY
Today: ${today}
Total logged days: ${cycleData.length}
Detected ovulation: ${ctx.ovDay || 'not yet detected'}
Last period start: ${ctx.lastPeriod?.start || 'unknown'}
Estimated cycle length: ${ctx.cycleLength} days
Estimated luteal phase: ${ctx.lpLength} days
Predicted next period: ${ctx.predictedPeriod?.toISOString().slice(0,10) || 'unknown'}
Predicted next ovulation: ${ctx.predictedOvulation?.toISOString().slice(0,10) || 'unknown'}
Predicted fertile window: ${ctx.fertileStart?.toISOString().slice(0,10) || '?'} to ${ctx.predictedOvulation?.toISOString().slice(0,10) || '?'}

Recent 7 days:
${recentSummary}

Logged symptoms: ${symptomsAll || 'none'}

Note: User has PCOS and is tracking cervical mucus carefully. PCOS can cause delayed or absent ovulation, variable cycle lengths, and atypical CM patterns.`;
}

// ── DAILY AI NOTE ─────────────────────────────────────────────────────────────
async function generateDailyNote(entry) {
  const noteSection = document.getElementById('daily-note-section');
  const noteText    = document.getElementById('daily-note-text');
  const noteLoading = document.getElementById('daily-note-loading');
  const noteDate    = document.getElementById('daily-note-date');

  noteSection.style.display = 'block';
  noteText.textContent = '';
  noteLoading.style.display = 'flex';
  noteDate.textContent = '';

  const apiKey = getApiKey();

  const dataSummary = buildDataSummary();
  const prompt = `${dataSummary}

Today's new entry: ${entry.date}, temp ${entry.temp}°C${entry.flow ? ', flow: ' + entry.flow : ''}${entry.cm ? ', cervical mucus: ' + entry.cm : ''}${entry.symptoms ? ', symptoms: ' + entry.symptoms : ''}.

Write a warm, concise paragraph (3-5 sentences) as a personalised cycle note for today. 
- Comment on what phase she is likely in and what the temperature suggests
- Mention the cervical mucus if logged (especially helpful for PCOS — be informative about what it might indicate)
- Note any symptoms with brief context (e.g. if migraine near period, explain the hormonal drop)
- End with something gently encouraging
- Tone: warm, knowledgeable friend, not clinical. No bullet points. No headers. Just flowing prose.`;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    noteLoading.style.display = 'none';
    if (data.content?.[0]?.text) {
      noteText.textContent = data.content[0].text;
    } else {
      noteText.textContent = 'Could not generate note — check your API key in the settings below.';
    }
  } catch {
    noteLoading.style.display = 'none';
    noteText.textContent = 'Could not connect to generate a note. Check your API key and internet connection.';
  }

  noteDate.textContent = new Date().toLocaleString();
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendBubble(msg, 'user');

  const apiKey = getApiKey();

  const dataSummary = buildDataSummary();
  const systemPrompt = `You are a knowledgeable, warm cycle health assistant helping someone with PCOS understand their basal body temperature and cycle data. You have access to their data below. Give clear, friendly, informative answers. Never diagnose. Recommend consulting a doctor for medical concerns. Keep responses concise (under 150 words unless a detailed explanation is needed).

${dataSummary}`;

  chatHistory.push({ role: 'user', content: msg });

  // Loading bubble
  const loadingId = 'loading-' + Date.now();
  appendBubble('…', 'ai', loadingId);

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        system: systemPrompt,
        messages: chatHistory
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || 'Sorry, I could not get a response.';

    chatHistory.push({ role: 'assistant', content: reply });
    // Keep history manageable
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    document.getElementById(loadingId)?.remove();
    appendBubble(reply, 'ai');
  } catch {
    document.getElementById(loadingId)?.remove();
    appendBubble('Connection error — check your API key and internet.', 'error');
  }
}

function appendBubble(text, type, id) {
  const messages = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = text;
  if (id) bubble.id = id;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

// ── CHART ─────────────────────────────────────────────────────────────────────
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

  const labels = cycleData.map(e => {
    const d = new Date(e.date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const temps = cycleData.map(e => e.temp);

  const pointColors = cycleData.map(e => {
    if (e.flow)               return '#e05555';
    if (e.date === ctx.ovDay) return '#9b59b6';
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

// ── INSIGHTS ──────────────────────────────────────────────────────────────────
function calculateInsights() {
  const ctx = getCycleContext();

  // Phase averages
  const folTemps = ctx.ovDay
    ? cycleData.filter(e => new Date(e.date) <= new Date(ctx.ovDay)).map(e => e.temp)
    : cycleData.slice(0, Math.floor(cycleData.length / 2)).map(e => e.temp);
  const lutTemps = (ctx.ovDay && ctx.lastPeriod)
    ? cycleData.filter(e => new Date(e.date) > new Date(ctx.ovDay) && new Date(e.date) < new Date(ctx.lastPeriod.start)).map(e => e.temp)
    : [];

  const avg = arr => arr.length ? (arr.reduce((a,b) => a+b,0)/arr.length).toFixed(2) : '--';
  document.getElementById('avg-fol').textContent = avg(folTemps);
  document.getElementById('avg-lut').textContent = avg(lutTemps);

  // Ovulation
  if (ctx.ovDay) {
    document.getElementById('ov-status').textContent = 'Confirmed ✦';
    document.getElementById('ov-prediction').textContent = `Detected around ${ctx.ovDay}`;
  } else {
    document.getElementById('ov-status').textContent = 'Not yet';
    document.getElementById('ov-status').style.color = '#ccc';
    document.getElementById('ov-prediction').textContent = 'Watching for biphasic shift.';
  }

  // Forecast
  const fmt = (d, opts) => d ? d.toLocaleDateString(undefined, opts || { weekday:'short', month:'short', day:'numeric' }) : '--';
  const shortFmt = d => fmt(d, { month:'short', day:'numeric' });
  document.getElementById('next-period').textContent    = fmt(ctx.predictedPeriod);
  document.getElementById('next-ovulation').textContent = fmt(ctx.predictedOvulation);
  document.getElementById('next-fertile').textContent   = ctx.fertileStart ? `${shortFmt(ctx.fertileStart)} – ${shortFmt(ctx.predictedOvulation)}` : '--';

  // Symptom pattern
  const migraineEntries = cycleData.filter(e => e.symptoms === 'migraine');
  const symptomEl = document.getElementById('symptom-pattern');
  if (migraineEntries.length > 0 && ctx.lastPeriod) {
    const daysBefore = migraineEntries.map(e => {
      return Math.round((new Date(ctx.lastPeriod.start) - new Date(e.date)) / 86400000);
    }).filter(d => d >= 0 && d <= 5);
    if (daysBefore.length) {
      const avg = (daysBefore.reduce((a,b) => a+b,0) / daysBefore.length).toFixed(0);
      symptomEl.innerHTML = `🧠 <strong>Menstrual migraine pattern detected.</strong> Your migraines tend to appear ~${avg} day${avg==1?'':'s'} before your period — likely triggered by the drop in oestrogen.`;
    }
  }

  const bloatEntries = cycleData.filter(e => e.symptoms === 'bloating');
  if (bloatEntries.length >= 2 && ctx.ovDay) {
    const lutealBloat = bloatEntries.filter(e => new Date(e.date) > new Date(ctx.ovDay));
    if (lutealBloat.length >= 2) {
      symptomEl.innerHTML += (symptomEl.innerHTML ? '<br><br>' : '') + `🫧 Bloating appears mainly in your <strong>luteal phase</strong> — a progesterone effect, very common with PCOS.`;
    }
  }

  if (!symptomEl.innerHTML) {
    symptomEl.textContent = 'Log more days with symptoms to see patterns.';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.onload = function () {
  document.getElementById('date').valueAsDate = new Date();
  initializeChart();
  calculateInsights();

  // Show saved API key indicator
  if (getApiKey()) {
  }
};
