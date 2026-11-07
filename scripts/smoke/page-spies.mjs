/* #597: the two page scripts both the Coach scenarios (test/coach.js, Chrome)
 * and the WebKit checks (scripts/webkit/) put on a page, held once so the two
 * cannot drift: the print spy and the iOS Home Screen app emulation. */

/* A printer that records instead of printing: each `window.print()` notes the
 * titles of the cards on the page at that moment, as `printed()` reads them
 * back. Nothing opens, so a scenario can print as often as it likes. */
export const PRINT_SPY = `window.__prints = []; window.__printViews = [];
  window.print = () => {
    window.__prints.push([...document.querySelectorAll('#sheet .card:not(.card-copy) .card-hd .opp')]
      .map(e => e.innerText.replace(/\\s+/g, ' ').trim()));
    window.__printViews.push(document.querySelector('.view:not([hidden])')?.id ?? null);
  };`;

/* #500: the iOS Home Screen app. `navigator.standalone` is true there, and its
 * share sheet takes files: each share is recorded as the file names and title
 * (`imageShares()`), and still keeps a link as SHARE_SHEET does. The File objects
 * are kept too (`sharedFileBytes()` reads them back), and `__imagesOnly` makes `canShare`
 * refuse anything but an image, the way an iOS that cannot take a PDF would. Added only by
 * `asHomeScreenApp()`, from the next page load. A scenario that wants a plain browser tab opens its own Coach. */
export const HOME_SCREEN_APP = `Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  window.__sharedImages = [];
  window.__sharedFiles = [];
  window.__imagesOnly = false;
  navigator.canShare = data => !!data?.files?.length && (!window.__imagesOnly || data.files.every(f => f.type.startsWith('image/')));
  Object.defineProperty(navigator, 'share', { configurable: true,
    value: data => {
      if (data.url) window.__sharedLink = data.url;
      if (data.files) window.__sharedFiles.push(...data.files);
      if (data.files) window.__sharedImages.push({ files: data.files.map(f => f.name), types: data.files.map(f => f.type), title: data.title, active: navigator.userActivation.isActive, inTap: window.event?.type === 'click' });
      return Promise.resolve();
    } });`;
