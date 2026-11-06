// Round 6: pocket drops STAY on every row when OUT+STAY can't share a line (OUT stays big);
// half keeps OUT in one column on every row.
// Round 5: no whole-card zoom (time column never shrinks); 5-letter names are the real worst case.
// Round 4: boxes sized per row then per tier (4-5 >= 85% of 1-3), OUT/STAY capped below the boxes,
// tight right column on the half-sheet, one OUT/STAY layout per pocket card, fixed row padding.
// Round 3 card, rebuilt for any sub pattern.
// OUT always bold; STAY lighter and a step smaller. Tag + names never split.
// Boxes: two sizes per card (1-3 in, 4-5 in); shrink before wrapping, wrap evenly.
// Half-sheet: OUT/STAY column sized to what it holds, boxes get the rest.
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const GAME = process.argv[2] || 'game-std.json', TAG = process.argv[3] || 'std';
const g = JSON.parse(fs.readFileSync(dir + GAME, 'utf8'));
const clk = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const all = g.players.map(p => p.short);
const stay = s => s.onFloor.filter(n => !s.in.includes(n));
const bench = s => all.filter(n => !s.onFloor.includes(n));
const outTxt = s => s.out.length === 5 ? '<span style="word-spacing:0">ALL 5</span>' : s.out.join(' ');
const chips = (s, min) => `<div class="chips ${s.in.length >= 4 ? 'big' : 'few'}" data-min="${min}">${s.in.map(n => `<span class="chip">${n}</span>`).join('')}</div>`;
const grp = (k, cls, txt, min) => `<div class="grp g-${k.toLowerCase()}" data-min="${min}"><span class="k">${k}</span><span class="${cls}">${txt}</span></div>`;
const subs = (s, mo, ms) => grp('OUT', 'o', outTxt(s), mo) + (stay(s).length ? grp('STAY', 's', stay(s).join(' '), ms) : '');
const BASE = `@font-face{font-family:Inter;src:url(../../../app/vendor/fonts/inter-latin-wght-normal.woff2);font-weight:100 900}
html,body{margin:0;background:#fff}*{box-sizing:border-box}
body{font-family:Inter,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column}
.hd{display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid #000}
.hd b{font-weight:900;letter-spacing:.02em}.hd .when{font-weight:700}.hd .mark{font-weight:600}
.list{flex:1;display:flex;flex-direction:column}
.row{flex:1 1 auto;display:grid;align-items:center;border-top:1.25px solid #000}
.row.newq{border-top:3px solid #000}.row:first-child{border-top:0}
.tick{border:2px solid #000;border-radius:2px}
.t{line-height:1}.t .q,.t .c{font-weight:900}.t .c{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.b,.mid,.sub{min-width:0}
.chips{display:flex;flex-wrap:nowrap;white-space:nowrap;min-width:0}.chips.wrap{flex-wrap:wrap}.chips .br{flex-basis:100%;height:0}
.chip{background:#000;color:#fff;font-weight:800;letter-spacing:.02em;line-height:1;border-radius:3px}
.chips.big .chip{letter-spacing:0}
.starters{font-weight:800;white-space:nowrap;line-height:1.05}.starters.wrap{white-space:normal;text-wrap-style:balance}
.k{font-weight:900;letter-spacing:.04em;border:1.5px solid #000;border-radius:2px;line-height:1;text-align:center;flex:none}
.o{font-weight:800}.s{font-weight:600}.o,.s,.starters{word-spacing:.15em}
.grp{white-space:nowrap}.grp.wrap{white-space:normal}.grp.wrap .o,.grp.wrap .s{text-wrap-style:balance}
.eb{font-weight:900;letter-spacing:.02em;line-height:1;white-space:nowrap}
.ft{border-top:1.5px solid #000;white-space:nowrap;font-weight:600;display:flex;justify-content:space-between}`;
const FIT = `<script>
document.fonts.ready.then(() => {
  const card = document.querySelector('.card'), half = !!card.dataset.rw, list = document.querySelector('.list');
  const over = el => el.scrollWidth > el.clientWidth + 0.5;
  const px = el => parseFloat(getComputedStyle(el).fontSize);
  const set = (els, p) => els.forEach(e => e.style.fontSize = p + 'px');
  const tall = () => card.scrollHeight > card.clientHeight + 0.5;
  const rg = document.createRange(), tw = el => { rg.selectNodeContents(el); return rg.getBoundingClientRect().width; };
  const V = n => parseFloat(getComputedStyle(card).getPropertyValue(n));
  const rows = [...document.querySelectorAll('.chips')];
  // half-sheet: right column fits its real longest line, so the boxes get the rest
  if (half) {
    const [lo, hi] = card.dataset.rw.split(',').map(Number);
    let w = 0; document.querySelectorAll('.row:not(.first) .grp > :last-child').forEach(sp => w = Math.max(w, 60 + tw(sp)));
    card.style.setProperty('--rw', Math.min(hi, Math.max(lo, Math.ceil(w) + 4)) + 'px');
  }
  const layout = dec => {
    document.querySelectorAll('.br').forEach(b => b.remove());
    document.querySelectorAll('.wrap').forEach(e => e.classList.remove('wrap')); document.querySelectorAll('.solo').forEach(e => e.classList.remove('solo')); card.classList.remove('nostay');
    document.querySelectorAll('.chip,.o,.s,.starters').forEach(e => e.style.fontSize = '');
    const CMAX = V('--chip') - dec, CMIN = V('--chipmin');
    // 1. each row: largest box size that fits on one line
    const fit = rows.map(r => { const cs = [...r.querySelectorAll('.chip')]; let p = CMAX; set(cs, p); while (over(r) && p > CMIN) { p -= 0.5; set(cs, p); } return over(r) ? null : p; });
    // 2. one size per tier from the rows that fit; 4-5 box rows stay at least 85% of the 1-3 box rows
    const tier = t => { const v = rows.map((r, i) => r.classList.contains(t) ? fit[i] : undefined).filter(x => x !== undefined); return v.length ? (v.filter(x => x).length ? Math.min(...v.filter(x => x)) : CMIN) : null; };
    let few = tier('few'), big = tier('big');
    if (few && big) few = Math.min(few, Math.floor(big / 0.85 * 2) / 2);
    rows.forEach(r => { const sz = r.classList.contains('big') ? big : few; set([...r.querySelectorAll('.chip')], sz); r.dataset.sz = sz;
      if (over(r)) { const cs = r.querySelectorAll('.chip'); const br = document.createElement('span'); br.className = 'br'; cs[Math.ceil(cs.length / 2) - 1].after(br); r.classList.add('wrap'); } });
    // 3. OUT/STAY never louder than that row's boxes
    const caps = () => rows.forEach(r => { const row = r.closest('.row'), sz = +r.dataset.sz;
      row.querySelectorAll('.o').forEach(o => o.style.fontSize = Math.max(V('--omin'), Math.min(V('--o'), Math.floor(sz * V('--ocap') * 2) / 2)) + 'px');
      row.querySelectorAll('.s').forEach(o => o.style.fontSize = Math.max(V('--smin'), Math.min(V('--s'), Math.floor(sz * V('--scap') * 2) / 2)) + 'px'); });
    caps();
    // 4. pocket: OUT and STAY share one line (shrinking both a little if needed); if any row still can't, drop STAY on every row
    if (!half) {
      const wraps = f => f.scrollHeight > f.firstElementChild.offsetHeight + 3;
      const flows = [...document.querySelectorAll('.row .b > .sub.flow')].filter(f => f.querySelector('.g-stay'));
      flows.forEach(f => { const o = f.querySelector('.o'), st = f.querySelector('.s');
        while (wraps(f) && (px(o) > V('--omin') || px(st) > V('--smin'))) { if (px(o) > V('--omin')) o.style.fontSize = px(o) - 0.5 + 'px'; if (px(st) > V('--smin')) st.style.fontSize = px(st) - 0.5 + 'px'; } });
      if (flows.some(wraps)) { card.classList.add('nostay'); caps(); }
    }
    // 5. text lines: shrink a little, then wrap as a unit
    document.querySelectorAll('.grp,.starters').forEach(el => {
      const box = el.classList.contains('grp') && el.parentElement.classList.contains('flow') ? el.parentElement : el;
      const tg = el.classList.contains('grp') ? [el.querySelector('.o,.s')] : [el];
      const o = () => box === el ? over(el) : el.scrollWidth > box.clientWidth + 0.5;
      let p = px(tg[0]); while (o() && p > +el.dataset.min) { p -= 0.5; tg[0].style.fontSize = p + 'px'; }
      if (o()) el.classList.add('wrap');
    });
  };
  // too tall: shrink the boxes a step at a time before touching the padding; never squash rows into each other
  let dec = 0; layout(0); while (tall() && dec < 5) { dec += 0.5; layout(dec); }
  if (tall()) document.querySelectorAll('.row').forEach(r => { r.style.paddingBlock = '3px'; });
  // still too tall: scale only the names area, never the time column or the tick box
  const names = [...document.querySelectorAll('.row > .b, .row > .mid, .row > .sub')];
  let z = 1; while (tall() && z > 0.8) { z -= 0.01; names.forEach(n => n.style.zoom = z); }
});
</script>`;
const page = (w, h, css, rows, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${g.title}</title><style>${BASE}
body{width:${w};height:${h}}${css}</style></head><body><div class="card"${extra}>
<div class="hd"><div><b>${g.title}</b><span class="when">${g.when}</span></div><span class="mark">benchcard.app</span></div>
<div class="list">${rows}</div>
<div class="ft"><span>BLACK BOX = send in · tick the box as you sub</span><span>all 10 play 16 min</span></div>
</div>${FIT}</body></html>`;
const nq = (s, i) => i === 0 || s.period !== g.stints[i - 1].period ? ' newq' : '';

// pocket: boxes, then OUT and STAY as units that sit side by side or stack
const pocketRows = g.stints.map((s, i) => {
  const t = `<div class="t"><div class="q">Q${s.period}</div><div class="c">${clk(s.clock)}</div></div>`;
  const body = s.in.length === 0
    ? `<div class="eb">STARTING FIVE</div><div class="starters" data-min="12">${s.onFloor.join(' ')}</div><div class="sub flow">${grp('BENCH', 's', bench(s).join(' '), 10.5)}</div>`
    : `${chips(s, 13)}<div class="sub flow">${subs(s, 11, 10.5)}</div>`;
  return `<div class="row${nq(s, i)}"><div class="tick"></div>${t}<div class="b">${body}</div></div>`;
}).join('');
fs.writeFileSync(dir + `pocket-${TAG}.html`, page('3.45in', '5in', `
.card{padding:7px 9px 5px}.hd{padding-bottom:4px}
.hd b{font-size:15px}.hd .when{font-size:11px;margin-left:6px}.hd .mark{font-size:8.5px}
.card{--chip:19;--chipmin:13;--o:13;--omin:11;--ocap:.8;--s:12;--smin:10.5;--scap:.74}
.row{grid-template-columns:13px 38px 1fr;column-gap:6px;padding:5px 0;min-height:44px}
.tick{width:13px;height:13px}
.t .q{font-size:13px}.t .c{font-size:16px}
.chips{gap:6px;padding-right:6px}.chips.big{gap:5px}.chips.wrap{row-gap:3px}
.chip{font-size:19px;padding:3px 5px}.chips.big .chip{padding:3px 4px}
.starters{font-size:16px;letter-spacing:-.01em}
.sub{margin-top:4px;display:flex;flex-wrap:wrap;column-gap:8px;row-gap:2px;align-items:center;letter-spacing:-.01em;line-height:1.1}
.nostay .g-stay{display:none}
.grp{display:flex;align-items:center}.grp .k{font-size:9px;padding:2px 3px 1.5px;margin-right:4px;min-width:31px}
.o{font-size:13px}.s{font-size:12px}
.eb{font-size:9.5px;margin-bottom:2px}
.ft{font-size:9px;padding-top:3px}`, pocketRows));

// half: time | boxes | OUT over STAY
const halfRows = g.stints.map((s, i) => {
  const t = `<div class="t"><span class="q">Q${s.period}</span><span class="c">${clk(s.clock)}</span></div>`;
  const mid = s.in.length === 0
    ? `<div class="mid"><div class="eb">STARTING FIVE</div><div class="starters" data-min="15">${s.onFloor.join(' ')}</div></div>`
    : `<div class="mid">${chips(s, 16)}</div>`;
  const right = s.in.length === 0 ? grp('BENCH', 's', bench(s).join(' '), 14) : subs(s, 14, 13);
  return `<div class="row${nq(s, i)}${s.in.length ? '' : ' first'}"><div class="tick"></div>${t}${mid}<div class="sub">${right}</div></div>`;
}).join('');
fs.writeFileSync(dir + `half-${TAG}.html`, page('8in', '5.1in', `
.card{padding:10px 16px 6px;--rw:260px}.hd{padding-bottom:5px}
.hd b{font-size:24px}.hd .when{font-size:16px;margin-left:12px}.hd .mark{font-size:11px}
.card{--chip:28;--chipmin:16;--o:17;--omin:14;--ocap:.72;--s:15.5;--smin:13.5;--scap:.66}
.row{grid-template-columns:20px 104px 1fr var(--rw);column-gap:12px;padding:6px 0;min-height:50px}
.tick{width:20px;height:20px}
.o,.s,.starters{word-spacing:.3em}
.row.solo{grid-template-columns:20px 104px 1fr auto}
.t .q{font-size:18px;margin-right:5px}.t .c{font-size:26px}
.mid{padding-right:16px}
.chips{gap:10px}.chips.big{gap:7px}.chips.wrap{row-gap:4px}
.chip{font-size:28px;padding:4px 9px}.chips.big .chip{padding:4px 7px}
.starters{font-size:21px}.eb{font-size:13px;margin-bottom:3px}
.grp{display:grid;grid-template-columns:52px 1fr;column-gap:8px;align-items:center;line-height:1.1}
.grp .k{font-size:12px;padding:3px 0 2px}.grp+.grp{margin-top:3px}
.o{font-size:17px}.s{font-size:15.5px}
.ft{font-size:11px;padding-top:4px}`, halfRows, ' data-rw="205,230"'));
