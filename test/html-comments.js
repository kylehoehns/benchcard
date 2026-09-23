/* Shared with rule-names.test.js and team-tab-copy.test.js -- not a
   *.test.js file itself, so `node --test`'s default discovery leaves it
   alone (same proof test/js-strings.js's own header comment gives for the
   same shape).

   `<!-- -->` comments are prose ABOUT the markup, not text a coach reads --
   dropping them before a guard scans a page's copy keeps a developer note
   from being scored as a re-offense. This is the one place that regex is
   written; a page whose inline `<script>` also carries `/* *\/` comments
   (index.html does, for its pre-paint theme and view scripts) strips those
   too, but on top of this function rather than as a second copy of it --
   see test/static-pages.test.js's `stripComments` and team-tab-copy.test.js's
   own wrapper. */
export function stripHtmlComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, ' ');
}
