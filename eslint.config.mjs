// ESLint (2026-11-25): the recommended rules over the code. The page's script is one function across public/js/, a
// part using what another declares, so it is linted whole, put together as served (scripts/lint-page.mjs, as
// `public/page.js`), never a part alone.
import js from '@eslint/js';
import globals from 'globals';

/** What the page's script finds global besides the browser's: the vendored builds (public/vendor/) and the app's bridge. */
const pageGlobals = {
  ...globals.browser,
  marked: 'readonly',
  DOMPurify: 'readonly',
  hljs: 'readonly',
  Terminal: 'readonly',
  FitAddon: 'readonly',
  WebLinksAddon: 'readonly',
};

export default [
  { ignores: ['public/vendor/', 'public/js/', 'docs/', 'mac/build/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],   // a catch that lets go on purpose
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],   // `const { key, ...rest }` leaves key out on purpose
      'no-control-regex': 'off',   // a terminal's bytes are matched on purpose
    },
  },
  // the harness's bodies run in the page: a scenario's, a check's, a test's
  {
    files: ['scripts/**', 'test/**', 'lib/cdp.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['public/page.js'],
    languageOptions: { sourceType: 'script', globals: pageGlobals },
  },
];
