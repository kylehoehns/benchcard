/* #597: a CDP-shaped client over one Playwright WebKit page, so the code that
 * drives Chrome (`land`, `evalIn`, `openState`, the seeding scripts, look.mjs'
 * `shoot`) runs unchanged in WebKit. It answers the CDP methods that code
 * sends, translated to Playwright calls. A method with no WebKit meaning
 * throws, naming it, rather than being skipped: a check that silently lost an
 * emulation would measure a different page than it says. */

const noEquivalent = method => new Error(`WebKit has no equivalent for CDP ${method}`);

/* Chrome and Playwright name the same three media features differently. */
const MEDIA = {
  'prefers-reduced-motion': 'reducedMotion',
  'prefers-color-scheme': 'colorScheme',
  'forced-colors': 'forcedColors',
};

/* The root text size. WebKit has no `Page.setFontSizes`, so this emulates what
 * a user's default size does: the root element's size is N px, here by an
 * adopted `:root { font-size: Npx !important }` sheet. An approximation of a
 * user default size, not the same thing: it also beats any author rule on
 * `:root`, which the app has none of (its root size is the UA default, see
 * app.css' `html` rules), so READ_PAINT's root px proof holds. */
export const rootSizeScript = px => `(() => {
  const css = ':root { font-size: ${px}px !important }';
  if (window.__rootSizeSheet) { window.__rootSizeSheet.replaceSync(css); return; }
  const sheet = window.__rootSizeSheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
})()`;

const NO_OPS = new Set(['Runtime.enable', 'Log.enable', 'Page.enable', 'Network.enable',
  'Network.setBypassServiceWorker', 'Emulation.setTouchEmulationEnabled']);

/* `close` closes the browser the page belongs to. */
export function cdpOverPage(page, { close }) {
  /* CDP event name -> its listeners. Playwright's page events are turned into
     the CDP events the callers already listen for: load, and the three that
     carry a console error (smoke/chrome.mjs `listen`, #609's console probe). */
  const listeners = new Map();
  const emit = (method, params) => { for (const fn of [...(listeners.get(method) ?? [])]) fn(params); };
  page.on('load', () => emit('Page.loadEventFired', {}));
  page.on('console', msg => {
    if (msg.type() === 'error') emit('Runtime.consoleAPICalled', { type: 'error', args: [{ value: msg.text() }] });
  });
  page.on('pageerror', err => emit('Runtime.exceptionThrown',
    { exceptionDetails: { text: err.message, exception: { description: err.stack || err.message } } }));
  /* Chrome reports a 4xx/5xx through Log.entryAdded; WebKit has no such event,
     so a failed response stands in for it. */
  page.on('response', r => {
    if (r.status() >= 400) emit('Log.entryAdded', { entry: { level: 'error', source: 'network', text: `Failed to load resource: ${r.status()}`, url: r.url() } });
  });

  const scripts = new Map();   // identifier -> Disposable
  let nextScript = 1;
  const addScript = async source => {
    const id = String(nextScript++);
    scripts.set(id, await page.addInitScript(source));
    return { identifier: id };
  };
  const removeScript = async identifier => {
    const disposable = scripts.get(identifier);
    scripts.delete(identifier);
    await disposable?.dispose();
  };
  let rootSize = null;   // the init script holding the current text size

  const handlers = {
    async 'Runtime.evaluate'({ expression }) {
      try {
        return { result: { value: await page.evaluate(expression) } };
      } catch (e) {
        return { exceptionDetails: { text: e.message, exception: { description: e.message } } };
      }
    },
    async 'Page.navigate'({ url }) {
      await page.goto(url, { waitUntil: 'load' });
      return {};
    },
    'Page.addScriptToEvaluateOnNewDocument': ({ source }) => addScript(source),
    async 'Page.removeScriptToEvaluateOnNewDocument'({ identifier }) {
      await removeScript(identifier);
      return {};
    },
    async 'Emulation.setDeviceMetricsOverride'({ width, height }) {
      await page.setViewportSize({ width, height });
      return {};
    },
    async 'Page.setFontSizes'({ fontSizes }) {
      const px = fontSizes.standard;
      const source = rootSizeScript(px);
      const previous = rootSize;
      ({ identifier: rootSize } = await addScript(source));
      if (previous) await removeScript(previous);
      await page.evaluate(source);
      return {};
    },
    async 'Emulation.setEmulatedMedia'({ features = [] }) {
      const options = { reducedMotion: null, colorScheme: null, forcedColors: null };
      for (const { name, value } of features) {
        if (!MEDIA[name]) throw new Error(`WebKit has no emulation for the media feature ${name}`);
        options[MEDIA[name]] = value;
      }
      await page.emulateMedia(options);
      return {};
    },
    async 'Page.captureScreenshot'() {
      return { data: (await page.screenshot({ type: 'png' })).toString('base64') };
    },
    async 'Input.dispatchMouseEvent'({ type, x, y, button = 'left', clickCount = 1 }) {
      if (type === 'mouseMoved') await page.mouse.move(x, y);
      /* Playwright's down and up act where the pointer is; CDP's carry their
         own position, so move there first. */
      else if (type === 'mousePressed') { await page.mouse.move(x, y); await page.mouse.down({ button, clickCount }); }
      else if (type === 'mouseReleased') { await page.mouse.move(x, y); await page.mouse.up({ button, clickCount }); }
      else throw noEquivalent(`Input.dispatchMouseEvent ${type}`);
      return {};
    },
    async 'Input.dispatchKeyEvent'({ type, key }) {
      if (type === 'keyDown' || type === 'rawKeyDown') await page.keyboard.down(key);
      else if (type === 'keyUp') await page.keyboard.up(key);
      else if (type !== 'char') throw noEquivalent(`Input.dispatchKeyEvent ${type}`);
      return {};
    },
  };

  return {
    ready: Promise.resolve(),
    async send(method, params = {}) {
      if (NO_OPS.has(method)) return {};
      if (!Object.hasOwn(handlers, method)) throw noEquivalent(method);
      return handlers[method](params);
    },
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, new Set()); listeners.get(method).add(fn); },
    off(method, fn) { listeners.get(method)?.delete(fn); },
    close,
  };
}
