/* #597: Playwright is found at run time, never listed in package.json (the repo
 * has zero dependencies: test/no-dependencies.test.js). One constant holds the
 * version; `.github/workflows/webkit.yml` repeats it and
 * test/ci-config.test.js holds the two equal. `npm test`, `npm run smoke` and
 * every other CI job never import this module. */
export const PLAYWRIGHT_VERSION = '1.64.1';

export const INSTALL_LINE = `Playwright not installed: run npm install --no-save --no-package-lock `
  + `playwright@${PLAYWRIGHT_VERSION} && npx playwright@${PLAYWRIGHT_VERSION} install webkit`;

/* `specifier` is a parameter only so a test can feed it a name that cannot
 * exist. Only "that module is not there" becomes the install line; any other
 * failure (a broken install) is rethrown as it is. */
export async function loadPlaywright(specifier = 'playwright') {
  try {
    return await import(specifier);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND') throw new Error(INSTALL_LINE);
    throw e;
  }
}
