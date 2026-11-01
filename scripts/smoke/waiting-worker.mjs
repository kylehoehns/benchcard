/* A page that was already controlled when it booted, with a new worker about
 * to take over (#498): the state the update toast is for. Chrome here has no
 * second worker generation to install, so the page is faked instead -- the
 * one place it is written, imported by the Coach driver (test/coach.js) and by
 * the smoke row that looks at the toast (update-toast.mjs).
 *
 * WAITING_WORKER goes on the next document, before any app script runs: an
 * own-property `controller` makes `toast.js`'s `wasControlled` true (a page
 * the first worker merely claimed is not stale), and `register` never
 * resolves so the real worker cannot fire its own `controllerchange` in the
 * middle of a scenario. TAKEOVER is what the new worker does, run in the page
 * when the scenario wants it. */
export const WAITING_WORKER = `(() => {
  const sw = navigator.serviceWorker;
  Object.defineProperty(sw, 'controller', { configurable: true, value: {} });
  sw.register = () => new Promise(() => {});
})()`;

export const TAKEOVER = `navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))`;
