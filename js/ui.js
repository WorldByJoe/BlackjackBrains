// Small DOM and chart helpers shared by both pages. No dependencies.
export const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(kids)) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
export const fmt = (x, d = 0) => (x == null || isNaN(x) ? '–' : x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = x => (x == null || isNaN(x) ? '–' : (x * 100).toFixed(0) + '%');
export const chips = n => (n >= 1e6 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : String(Math.round(n)));

// One shared tooltip element following the cursor.
let tipEl = null;
export function attachTip(node, text) {
  if (!tipEl) { tipEl = el('div', { class: 'tip' }); document.body.append(tipEl); }
  const show = (e) => { tipEl.textContent = text; tipEl.classList.add('show'); move(e); };
  const move = (e) => {
    const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  };
  node.addEventListener('mouseenter', show); node.addEventListener('mousemove', move);
  node.addEventListener('mouseleave', () => tipEl.classList.remove('show'));
}
export const infoDot = (text) => { const d = el('span', { class: 'info', text: 'i', tabindex: 0 }); attachTip(d, text); return d; };

export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

// A compact line chart on a canvas. series: [{data:[{x,y}], color, label}]. Auto-scales.
export function lineChart(canvas, series, opts = {}) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth || 360, H = opts.height || 160;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const mL = 44, mR = 10, mT = 10, mB = 20;
  const all = series.flatMap(s => s.data);
  if (!all.length) { g.fillStyle = css('--muted'); g.font = '12px monospace'; g.fillText('no data yet', mL, H / 2); return; }
  let xmin = opts.xmin ?? Math.min(...all.map(p => p.x)), xmax = opts.xmax ?? Math.max(...all.map(p => p.x));
  let ymin = opts.ymin ?? Math.min(...all.map(p => p.y)), ymax = opts.ymax ?? Math.max(...all.map(p => p.y));
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) { ymax += 1; ymin -= 1; }
  const pad = (ymax - ymin) * 0.08; ymin -= pad; ymax += pad;
  const X = x => mL + (x - xmin) / (xmax - xmin) * (W - mL - mR);
  const Y = y => mT + (1 - (y - ymin) / (ymax - ymin)) * (H - mT - mB);
  g.strokeStyle = css('--line'); g.fillStyle = css('--muted'); g.font = '10px "IBM Plex Mono",monospace'; g.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const yv = ymin + (ymax - ymin) * i / 3, y = Y(yv);
    g.beginPath(); g.moveTo(mL, y); g.lineTo(W - mR, y); g.globalAlpha = .5; g.stroke(); g.globalAlpha = 1;
    g.textAlign = 'right'; g.fillText(opts.fmtY ? opts.fmtY(yv) : yv.toFixed(2), mL - 5, y + 3);
  }
  if (opts.zero && ymin < 0 && ymax > 0) { g.strokeStyle = css('--muted'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(mL, Y(0)); g.lineTo(W - mR, Y(0)); g.stroke(); g.setLineDash([]); }
  g.textAlign = 'center';
  g.fillText(opts.fmtX ? opts.fmtX(xmin) : xmin, mL, H - 6); g.fillText(opts.fmtX ? opts.fmtX(xmax) : xmax, W - mR, H - 6);
  for (const s of series) {
    if (!s.data.length) continue;
    g.strokeStyle = s.color; g.lineWidth = s.width || 1.8; g.beginPath();
    s.data.forEach((p, i) => { const x = X(p.x), y = Y(p.y); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  if (opts.legend !== false && series.length > 1) {
    g.textAlign = 'left'; g.font = '10px "IBM Plex Sans",sans-serif'; let lx = mL + 4;
    for (const s of series) { if (!s.label) continue; g.fillStyle = s.color; g.fillRect(lx, 2, 9, 9); g.fillStyle = css('--muted'); g.fillText(s.label, lx + 12, 10); lx += 14 + g.measureText(s.label).width + 14; }
  }
}

// Bar chart for bet-by-count. bars:[{label,value,n}]
export function barChart(canvas, bars, opts = {}) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth || 360, H = opts.height || 150;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const mL = 30, mR = 8, mT = 10, mB = 26;
  const vals = bars.map(b => b.value || 0), vmax = Math.max(opts.ymax || 0, ...vals, 1);
  const bw = (W - mL - mR) / bars.length;
  g.fillStyle = css('--muted'); g.font = '10px "IBM Plex Mono",monospace';
  g.textAlign = 'right'; for (let i = 0; i <= 2; i++) { const v = vmax * i / 2, y = mT + (1 - i / 2) * (H - mT - mB); g.fillText(v.toFixed(0), mL - 4, y + 3); g.strokeStyle = css('--line'); g.globalAlpha = .5; g.beginPath(); g.moveTo(mL, y); g.lineTo(W - mR, y); g.stroke(); g.globalAlpha = 1; }
  bars.forEach((b, i) => {
    const x = mL + i * bw, h = (b.value || 0) / vmax * (H - mT - mB), y = mT + (H - mT - mB) - h;
    g.fillStyle = b.color || css('--felt'); g.globalAlpha = b.n ? 1 : .25; g.fillRect(x + bw * .12, y, bw * .76, h); g.globalAlpha = 1;
    g.fillStyle = css('--muted'); g.textAlign = 'center'; g.fillText(b.label, x + bw / 2, H - 14);
  });
  if (opts.xlabel) { g.fillStyle = css('--muted'); g.textAlign = 'center'; g.fillText(opts.xlabel, W / 2, H - 2); }
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
export function readFile(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
