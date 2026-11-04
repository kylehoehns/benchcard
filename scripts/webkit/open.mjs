/* #597: opens Playwright's WebKit and hands back CDP-shaped clients (cdp.mjs).
 * Playwright is loaded here, at call time, by `loadPlaywright`; importing this
 * module loads nothing. The context is an iPhone-sized touch phone, with the
 * service worker blocked (the Chrome runs bypass it the same way). It is still
 * desktop WebKit, not iOS Safari (`/browser-verify` section 6). */
import { loadPlaywright } from './playwright.mjs';
import { cdpOverPage } from './cdp.mjs';

export const PHONE = Object.freeze({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
});

const LAUNCH_MS = 60_000;

/* One WebKit, any number of pages. `newPage()` is a fresh context and page with
 * its own storage and scripts, so a check cannot inherit what the one before
 * left; its client's `close()` closes only that context. `close()` closes
 * WebKit and is safe to call twice. */
export async function launchWebKit({ headful = false, loader = loadPlaywright } = {}) {
  const { webkit } = await loader();
  const browser = await webkit.launch({ headless: !headful, timeout: LAUNCH_MS });
  return {
    async newPage() {
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      return cdpOverPage(page, { close: () => context.close() });
    },
    close: () => browser.close().catch(() => {}),
  };
}

/* One page whose `close()` closes WebKit with it, for look.mjs. */
export async function openWebKit(options) {
  const wk = await launchWebKit(options);
  try {
    const c = await wk.newPage();
    return { ...c, close: () => wk.close() };
  } catch (e) {
    await wk.close();
    throw e;
  }
}
