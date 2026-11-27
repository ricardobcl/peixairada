// ESLint (2026-11-25): the recommended rules over the code. The page's script is one function across public/js/, a
// part using what another declares, so it is linted whole, put together as served (scripts/lint-page.mjs, as
// `public/page.js`), never a part alone.
// The house rules (2026-11-27): a blank line round a block, one declaration a line, the imports first — `npm run
// format` makes them (scripts/format.mjs).
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importLite from 'eslint-plugin-import-lite';
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

/** A statement that runs over more than one line: a function, a class, a block, a declaration of one. */
const BLOCKS = [
  'function',
  'class',
  'multiline-block-like',
  'multiline-const',
  'multiline-let',
  'multiline-expression',
];

export default [
  { ignores: ['public/vendor/', 'public/js/', 'docs/', 'mac/build/', '.claude/'] }, // .claude/: the worktrees, others' branches
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    plugins: { '@stylistic': stylistic, 'import-lite': importLite },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }], // a catch that lets go on purpose
      'no-unused-vars': ['error', { ignoreRestSiblings: true }], // `const { key, ...rest }` leaves key out on purpose
      'no-control-regex': 'off', // a terminal's bytes are matched on purpose
      // one declaration a statement, the declarations together and a blank line after them
      'one-var': ['error', 'never'],
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-var': 'error',
      // a statement over several lines stands apart: a blank line before and after it, and after the imports
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: '*', next: BLOCKS },
        { blankLine: 'always', prev: BLOCKS, next: '*' },
      ],
      '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      'import-lite/first': 'error',
      'import-lite/no-duplicates': 'error',
      // a body over more than one line is braced; strings are put together by a template
      curly: ['error', 'multi-line'],
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'prefer-exponentiation-operator': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
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
