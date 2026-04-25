// ... (Keep everything exactly the same until the calculateInsights function)

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
  // Set default dates in inputs to today
  const today = new Date();
  document.getElementById('date-temp').valueAsDate = today;
  document.getElementById('date-sx').valueAsDate = today;
  
  initializeChart();
  
  if (cycleData.length > 0) { 
    updateChartData(); 
    calculateInsights(); 
  }
};

// Global Exposure for HTML Buttons
window.addTempData = addTempData; 
window.addSymptomsData = addSymptomsData;