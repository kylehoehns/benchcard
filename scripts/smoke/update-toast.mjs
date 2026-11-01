/* #498 (docs/specs/498-update-toast.md, items 2, 3, 4 and 6): the "New version
 * ready" toast has its own look. The real toast is raised through
 * `showUpdate` (toast.js) over Today at 320 and 390, 16 and 32px text, light
 * and dark, and measured as painted:
 *
 *   - it carries `update-toast`, so the shared gray pill cannot come back by
 *     the variant quietly losing its class;
 *   - the Reload label against the button >= 4.5:1, the button against the
 *     toast >= 3:1, the help text against the toast >= 4.5:1;
 *   - the Reload button either sits on the text's row, or wraps under it with
 *     the message's widest line at least 60% of the toast's content width;
 *   - every control >= 48px, nothing past any edge, no sideways scroll.
 *
 * COLORS ARE READ FROM PIXELS, not parsed: Chrome reports `color-mix` as
 * `color(srgb ...)` and a `[\d.]+` regex reads that as RGB (/browser-verify
 * 4 and 5). Each computed color is painted onto a 1x1 canvas, over whatever
 * is under it (the toast over nothing, the button over the toast), and the
 * pixel is read back. `fillStyle` silently keeps its old value when it is
 * handed a color it cannot parse, so the probe seeds a sentinel first and
 * fails if the sentinel survives: a color that did not paint measures the
 * previous one and would report a perfect score. */
import { evalIn, step } from './dom.mjs';
import { land } from './page-state.mjs';
import { richWith, TODAY_LANDING } from './fixtures.mjs';

export const UPDATE_TOAST_WIDTHS = [320, 390];
export const UPDATE_TOAST_TEXT_PX = [16, 32];
export const UPDATE_TOAST_THEMES = ['light', 'dark'];

// The floors are the spec's, item 3; the 60% is item 4's.
export const MIN_LABEL = 4.5, MIN_FILL = 3, MIN_HELP = 4.5, MIN_LINE_SHARE = .6;

const RAISE = `(await import('/toast.js')).showUpdate(() => {})`;

const PROBE = `(() => {
  const toast = document.querySelector('#toasts .toast');
  if (!toast) return JSON.stringify({ host: location.host, toast: false });
  const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
    .getContext('2d', { willReadFrequently: true });
  const paint = layers => {
    g.clearRect(0, 0, 1, 1);
    for (const css of layers) {
      g.fillStyle = '#010203';
      g.fillStyle = css;
      if (g.fillStyle === '#010203') throw new Error('canvas would not paint ' + css);
      g.fillRect(0, 0, 1, 1);
    }
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const lum = rgb => { const [r, g2, b] = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g2 + .0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05); };
  const css = (el, p) => getComputedStyle(el)[p];
  const btn = toast.querySelector('.tundo'), x = toast.querySelector('.tx'), msg = toast.querySelector('.tmsg');
  const help = toast.querySelector('.update-help') || msg;
  const ground = [css(toast, 'backgroundColor')];
  const fill = [...ground, css(btn, 'backgroundColor')];
  const toastPx = paint(ground), fillPx = paint(fill);
  const labelRatio = ratio(paint([...fill, css(btn, 'color')]), fillPx);
  const fillRatio = ratio(fillPx, toastPx);
  const helpRatio = ratio(paint([...ground, css(help, 'color')]), toastPx);

  const tb = toast.getBoundingClientRect(), mb = msg.getBoundingClientRect();
  const acts = toast.querySelector('.tacts').getBoundingClientRect();
  const beside = acts.top < mb.bottom - 1;
  let widest = 0;
  const walk = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode()); ) {
    const r = document.createRange(); r.selectNodeContents(n);
    for (const l of r.getClientRects()) widest = Math.max(widest, l.width);
  }
  const cs = getComputedStyle(toast);
  const content = tb.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const boxes = [['toast', toast], ['Reload', btn], ['Dismiss', x]].map(([n, e]) => { const r = e.getBoundingClientRect(); return { n, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  return JSON.stringify({
    host: location.host, toast: true, cls: toast.classList.contains('update-toast'),
    label: labelRatio, fill: fillRatio, help: helpRatio,
    beside, share: widest / content, boxes, vw, vh,
    pans: document.documentElement.scrollWidth > vw,
    clipped: [msg, toast].some(e => e.scrollWidth > e.clientWidth + 1),
    text: toast.innerText.replace(/\\s+/g, ' ').trim(),
  });
})()`;

export async function updateToastPass(c, origin, rec) {
  const seen = [];
  for (const theme of UPDATE_TOAST_THEMES) {
    for (const width of UPDATE_TOAST_WIDTHS) {
      for (const textPx of UPDATE_TOAST_TEXT_PX) {
        const where = `update toast ${theme} ${width}px/${textPx}px`;
        await land(c, origin, { record: { ...richWith({ theme }), view: 'today' }, width, textPx, ...TODAY_LANDING });
        await evalIn(c, step(RAISE));
        const m = JSON.parse(await evalIn(c, PROBE));
        // rule 2a: no toast on screen means nothing was measured
        if (!rec.check(m.toast, `${where}: no toast on screen -- nothing was measured`)) continue;
        rec.check(m.cls, `${where}: the toast has lost the update-toast class`);
        rec.check(m.fill >= MIN_FILL, `${where}: the Reload button against the toast is ${m.fill.toFixed(2)}:1, under ${MIN_FILL}:1`);
        rec.check(m.label >= MIN_LABEL, `${where}: the Reload label against its button is ${m.label.toFixed(2)}:1, under ${MIN_LABEL}:1`);
        rec.check(m.help >= MIN_HELP, `${where}: the help text against the toast is ${m.help.toFixed(2)}:1, under ${MIN_HELP}:1`);
        rec.check(m.beside || m.share >= MIN_LINE_SHARE,
          `${where}: Reload wrapped under a message whose widest line is ${(m.share * 100).toFixed(0)}% of the toast, under ${MIN_LINE_SHARE * 100}% (a dead band)`);
        for (const b of m.boxes) {
          if (b.n !== 'toast') rec.check(b.h >= 47.5, `${where}: ${b.n} is ${b.h.toFixed(1)}px tall, under 48`);
          rec.check(b.l >= -1 && b.r <= m.vw + 1 && b.t >= -1 && b.b <= m.vh + 1,
            `${where}: ${b.n} spans x ${Math.round(b.l)}-${Math.round(b.r)}, y ${Math.round(b.t)}-${Math.round(b.b)} in a ${m.vw}x${m.vh} viewport`);
        }
        rec.check(!m.pans, `${where}: the page pans sideways`);
        rec.check(!m.clipped, `${where}: the toast's text is clipped`);
        seen.push(`${theme} ${width}/${textPx}: label ${m.label.toFixed(1)} fill ${m.fill.toFixed(1)} help ${m.help.toFixed(1)}${m.beside ? ' beside' : ` stacked ${(m.share * 100).toFixed(0)}%`}`);
      }
    }
  }
  // rule 2a again, for the whole row: every cell or it measured nothing
  const cells = UPDATE_TOAST_WIDTHS.length * UPDATE_TOAST_TEXT_PX.length * UPDATE_TOAST_THEMES.length;
  rec.check(seen.length === cells, `only ${seen.length} of ${cells} cells measured`);
  rec.ok(seen.join('; '));
}
