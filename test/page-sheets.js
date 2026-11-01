/* Shared by the guards that have to know which stylesheets a public page
   loads -- not a *.test.js file itself, so `node --test`'s default discovery
   leaves it alone (same shape as test/html-comments.js).

   This is the one place the `<link rel="stylesheet">` and `<style>` scans are
   written. They used to be spelled eight ways, and two of them matched only
   `href="./x.css"`, which would have skipped a sheet linked root-relative the
   way 404.html links `/site.css`. Both spellings are read here. */

/* The local sheets a page links, as file names, in document order. */
export function linkedSheets(html) {
  return [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(?:\.\/|\/)([\w.-]+\.css)"/g)]
    .map((m) => m[1]);
}

/* The bodies of a page's `<style>` blocks, in document order. A `<noscript>`
   block is a stylesheet too (it is the only place `.app` is styled in
   index.html); pass `{ noscript: false }` to leave it out. */
export function inlineSheets(html, { noscript = true } = {}) {
  const src = noscript ? html : html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}
