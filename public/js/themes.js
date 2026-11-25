// ---- themes: one keystroke re-skins the board (2026-10-10) ----------------------------------------------
// Omarchy's way: a theme is every surface at once — the cards, the transcript, the code, the drawer's sixteen colours,
// the header's black and the status bar — picked from a grid that the board behind follows (⌥⌘Y). Omarchy's, and
// Black (2026-10-30): the board's own dark on true black — every ground #000, a hair lifted for the cards, its own
// colours, the projects' kept as set (asSet: skinColor leaves them), the terminal black too; and Softened (2026-11-01).
// Every theme lays the chat in a frame (2026-11-01, round XVII's C1): the window's ground, the sidebar and the status
// bar its `crust`, the chat a sheet in it — a theme changes the colours, never the window's shape.
// A half is light or dark, and the board wears its appearance whatever macOS shows (2026-10-12; the dark rules read
// the root's data-theme). A theme is a family of two halves (FAMILIES, below), and the appearance picks the half.
// A project keeps its hue — its
// colour moves to the theme's nearest (skinColor; worn as set until 2026-10-14 was a switch). `crust` is the
// theme's darkest (lightest, in a light one): the frame, the splitter's, the status bar's ground.
const SKINS = {
  black: {
    name: 'Black',
    dark: true,
    asSet: true,
    bg: '#000000',
    panel: '#0a0a0a',
    raise: '#161616',
    crust: '#000000',
    ink: '#ececea',
    muted: '#8f8f8a',
    line: '#1f1f1d',
    accent: '#e08a68',
    working: '#d9a82a',
    idle: '#2f9e5b',
    needs: '#ef6060',
    watch: '#45c8c8',
    spend: '#f28a3c',
    code: '#000000',
    hl: ['#7c7c74', '#c678dd', '#98c379', '#d19a66', '#61afef', '#e5c07b', '#e06c75', '#8fa6c4'],
    proj: ['#3b7ddd', '#8a5cf6', '#2e9e6a', '#e5892a'],
    ansi: [
      '#1c1c1c',
      '#ef6060',
      '#5fb86a',
      '#d9a82a',
      '#5b8def',
      '#b07ce8',
      '#45c8c8',
      '#d0d0cc',
      '#5a5a57',
      '#ff7b7b',
      '#7fd18a',
      '#f0c24a',
      '#7fa8ff',
      '#c99bf5',
      '#6fe0e0',
      '#f4f4f0',
    ],
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    dark: true,
    bg: '#1a1b26',
    panel: '#1f2335',
    raise: '#24283b',
    crust: '#16161e',
    ink: '#c0caf5',
    muted: '#8790bd',
    line: '#292e42',
    accent: '#7aa2f7',
    working: '#e0af68',
    idle: '#9ece6a',
    needs: '#f7768e',
    watch: '#7dcfff',
    spend: '#ff9e64',
    code: '#16161e',
    hl: ['#565f89', '#bb9af7', '#9ece6a', '#ff9e64', '#7aa2f7', '#e0af68', '#f7768e', '#7dcfff'],
    proj: ['#7aa2f7', '#bb9af7', '#9ece6a', '#ff9e64', '#f7768e', '#7dcfff', '#e0af68', '#73daca'],
    ansi: [
      '#15161e',
      '#f7768e',
      '#9ece6a',
      '#e0af68',
      '#7aa2f7',
      '#bb9af7',
      '#7dcfff',
      '#a9b1d6',
      '#414868',
      '#f7768e',
      '#9ece6a',
      '#e0af68',
      '#7aa2f7',
      '#bb9af7',
      '#7dcfff',
      '#c0caf5',
    ],
  },
  catppuccin: {
    name: 'Catppuccin',
    dark: true,
    bg: '#1e1e2e',
    panel: '#24273a',
    raise: '#313244',
    crust: '#11111b',
    ink: '#cdd6f4',
    muted: '#9399b2',
    line: '#313244',
    accent: '#cba6f7',
    working: '#f9e2af',
    idle: '#a6e3a1',
    needs: '#f38ba8',
    watch: '#94e2d5',
    spend: '#fab387',
    code: '#181825',
    hl: ['#6c7086', '#cba6f7', '#a6e3a1', '#fab387', '#89b4fa', '#f9e2af', '#f38ba8', '#94e2d5'],
    proj: ['#89b4fa', '#cba6f7', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#f9e2af', '#f5c2e7'],
    ansi: [
      '#45475a',
      '#f38ba8',
      '#a6e3a1',
      '#f9e2af',
      '#89b4fa',
      '#f5c2e7',
      '#94e2d5',
      '#bac2de',
      '#585b70',
      '#f38ba8',
      '#a6e3a1',
      '#f9e2af',
      '#89b4fa',
      '#f5c2e7',
      '#94e2d5',
      '#a6adc8',
    ],
  },
  gruvbox: {
    name: 'Gruvbox',
    dark: true,
    bg: '#282828',
    panel: '#32302f',
    raise: '#3c3836',
    crust: '#1d2021',
    ink: '#ebdbb2',
    muted: '#a89984',
    line: '#45403d',
    accent: '#fe8019',
    working: '#fabd2f',
    idle: '#b8bb26',
    needs: '#fb4934',
    watch: '#8ec07c',
    spend: '#fe8019',
    code: '#1d2021',
    hl: ['#928374', '#fb4934', '#b8bb26', '#d3869b', '#83a598', '#fabd2f', '#fe8019', '#8ec07c'],
    proj: ['#83a598', '#d3869b', '#b8bb26', '#fe8019', '#fb4934', '#8ec07c', '#fabd2f'],
    ansi: [
      '#282828',
      '#cc241d',
      '#98971a',
      '#d79921',
      '#458588',
      '#b16286',
      '#689d6a',
      '#a89984',
      '#928374',
      '#fb4934',
      '#b8bb26',
      '#fabd2f',
      '#83a598',
      '#d3869b',
      '#8ec07c',
      '#ebdbb2',
    ],
  },
  everforest: {
    name: 'Everforest',
    dark: true,
    bg: '#2d353b',
    panel: '#343f44',
    raise: '#3d484d',
    crust: '#232a2e',
    ink: '#d3c6aa',
    muted: '#859289',
    line: '#475258',
    accent: '#a7c080',
    working: '#dbbc7f',
    idle: '#a7c080',
    needs: '#e67e80',
    watch: '#83c092',
    spend: '#e69875',
    code: '#232a2e',
    hl: ['#859289', '#e67e80', '#a7c080', '#d699b6', '#7fbbb3', '#dbbc7f', '#e69875', '#83c092'],
    proj: ['#7fbbb3', '#d699b6', '#a7c080', '#e69875', '#e67e80', '#83c092', '#dbbc7f'],
    ansi: [
      '#475258',
      '#e67e80',
      '#a7c080',
      '#dbbc7f',
      '#7fbbb3',
      '#d699b6',
      '#83c092',
      '#d3c6aa',
      '#859289',
      '#e67e80',
      '#a7c080',
      '#dbbc7f',
      '#7fbbb3',
      '#d699b6',
      '#83c092',
      '#d3c6aa',
    ],
  },
  kanagawa: {
    name: 'Kanagawa',
    dark: true,
    bg: '#1f1f28',
    panel: '#2a2a37',
    raise: '#363646',
    crust: '#16161d',
    ink: '#dcd7ba',
    muted: '#727169',
    line: '#363646',
    accent: '#7e9cd8',
    working: '#e6c384',
    idle: '#98bb6c',
    needs: '#ff5d62',
    watch: '#7fb4ca',
    spend: '#ffa066',
    code: '#16161d',
    hl: ['#727169', '#957fb8', '#98bb6c', '#d27e99', '#7e9cd8', '#e6c384', '#ffa066', '#7aa89f'],
    proj: ['#7e9cd8', '#957fb8', '#98bb6c', '#ffa066', '#ff5d62', '#7aa89f', '#e6c384', '#d27e99'],
    ansi: [
      '#16161d',
      '#c34043',
      '#76946a',
      '#c0a36e',
      '#7e9cd8',
      '#957fb8',
      '#6a9589',
      '#c8c093',
      '#727169',
      '#e82424',
      '#98bb6c',
      '#e6c384',
      '#7fb4ca',
      '#938aa9',
      '#7aa89f',
      '#dcd7ba',
    ],
  },
  'rose-pine': {
    name: 'Rosé Pine',
    dark: true,
    bg: '#191724',
    panel: '#1f1d2e',
    raise: '#26233a',
    crust: '#13111d',
    ink: '#e0def4',
    muted: '#908caa',
    line: '#26233a',
    accent: '#ebbcba',
    working: '#f6c177',
    idle: '#9ccfd8',
    needs: '#eb6f92',
    watch: '#31748f',
    spend: '#f6c177',
    code: '#13111d',
    hl: ['#6e6a86', '#c4a7e7', '#f6c177', '#ebbcba', '#9ccfd8', '#f6c177', '#eb6f92', '#31748f'],
    proj: ['#9ccfd8', '#c4a7e7', '#31748f', '#f6c177', '#eb6f92', '#ebbcba'],
    ansi: [
      '#26233a',
      '#eb6f92',
      '#31748f',
      '#f6c177',
      '#9ccfd8',
      '#c4a7e7',
      '#ebbcba',
      '#e0def4',
      '#6e6a86',
      '#eb6f92',
      '#31748f',
      '#f6c177',
      '#9ccfd8',
      '#c4a7e7',
      '#ebbcba',
      '#e0def4',
    ],
  },
  nord: {
    name: 'Nord',
    dark: true,
    bg: '#2e3440',
    panel: '#3b4252',
    raise: '#434c5e',
    crust: '#242933',
    ink: '#eceff4',
    muted: '#9aa3b5',
    line: '#434c5e',
    accent: '#88c0d0',
    working: '#ebcb8b',
    idle: '#a3be8c',
    needs: '#bf616a',
    watch: '#8fbcbb',
    spend: '#d08770',
    code: '#242933',
    hl: ['#616e88', '#81a1c1', '#a3be8c', '#b48ead', '#88c0d0', '#ebcb8b', '#d08770', '#8fbcbb'],
    proj: ['#81a1c1', '#b48ead', '#a3be8c', '#d08770', '#bf616a', '#88c0d0', '#ebcb8b'],
    ansi: [
      '#3b4252',
      '#bf616a',
      '#a3be8c',
      '#ebcb8b',
      '#81a1c1',
      '#b48ead',
      '#88c0d0',
      '#e5e9f0',
      '#4c566a',
      '#bf616a',
      '#a3be8c',
      '#ebcb8b',
      '#81a1c1',
      '#b48ead',
      '#8fbcbb',
      '#eceff4',
    ],
  },
  'matte-black': {
    name: 'Matte Black',
    dark: true,
    bg: '#121212',
    panel: '#181818',
    raise: '#202020',
    crust: '#0b0b0b',
    ink: '#eaeaea',
    muted: '#8a8a8d',
    line: '#262626',
    accent: '#f59e0b',
    working: '#f59e0b',
    idle: '#bebebe',
    needs: '#d35f5f',
    watch: '#8a8a8d',
    spend: '#f59e0b',
    code: '#0b0b0b',
    hl: ['#5c5c5c', '#f59e0b', '#bebebe', '#e68e0d', '#d0d0d0', '#f59e0b', '#d35f5f', '#9a9a9a'],
    proj: ['#8a8a8d', '#bebebe', '#e68e0d', '#d35f5f', '#f59e0b', '#666666'],
    ansi: [
      '#333333',
      '#d35f5f',
      '#bebebe',
      '#f59e0b',
      '#8a8a8d',
      '#e68e0d',
      '#a0a0a0',
      '#bebebe',
      '#5c5c5c',
      '#d35f5f',
      '#eaeaea',
      '#ffc107',
      '#bebebe',
      '#f59e0b',
      '#d0d0d0',
      '#ffffff',
    ],
  },
  // Softened (2026-11-01, round XV's T9): the board's light as it was before the frame, softened — the whites gone,
  // the grounds two steps apart. Its colours the board's own, as Black's.
  softened: {
    name: 'Softened',
    dark: false,
    asSet: true,
    bg: '#efeee9',
    panel: '#f5f4f0',
    raise: '#e5e3db',
    crust: '#e3e2dc',
    ink: '#21211e',
    muted: '#5e5d56',
    line: '#d6d5cd',
    accent: '#b05232',
    working: '#d9a82a',
    idle: '#237a48',
    needs: '#b42e2e',
    watch: '#0a7474',
    spend: '#e8782a',
    code: '#e7e5de',
    hl: ['#5f5e57', '#9c27a0', '#3c7832', '#82560f', '#2560be', '#8a6310', '#b83c2e', '#6b7f9e'],
    proj: ['#3b7ddd', '#8a5cf6', '#2e9e6a', '#e5892a'],
    tok: {
      '--tool-bg': '#e9e8e2',
      '--code-line': '#d5d3ca',
      '--inline-bg': 'rgb(40 38 30 / .07)',
      '--snip-claude': '#42413b',
      '--nocolor': '#b1b0a8',
      '--ended': '#9f9e96',
      '--term-bg': '#eae8e2',
      '--unread': '#9c4426',
    },
    codeInk: '#9e3f1f',
    you: '#21756a',
  },
  // Flashbang (2026-11-16): a traditional light theme, every ground white — the list, home and the frame too; the drawer
  // the default iTerm2 profile's Light set (Tango) on white, every selection macOS's blue (--page-sel too); the window's title bar
  // white too. Its frame is level with the chat and the cards are white on white, raised by their shadow alone (2026-11-24).
  flashbang: {
    name: 'Flashbang',
    dark: false,
    asSet: true,
    titlebar: true,
    bg: '#ffffff',
    panel: '#ffffff',
    raise: '#f2f2f2',
    crust: '#ffffff',
    ink: '#1f1f1f',
    muted: '#5e5e5e',
    line: '#e3e3e3',
    accent: '#ad5030',
    working: '#d9a82a',
    idle: '#237a48',
    needs: '#b42e2e',
    watch: '#0a7474',
    spend: '#e8782a',
    code: '#f6f6f6',
    hl: ['#5f5e57', '#9c27a0', '#3c7832', '#82560f', '#2560be', '#8a6310', '#b83c2e', '#6b7f9e'],
    proj: ['#3b7ddd', '#8a5cf6', '#2e9e6a', '#e5892a'],
    ansi: [
      '#000000',
      '#cc0000',
      '#4e9a06',
      '#c4a000',
      '#3465a4',
      '#75507b',
      '#06989a',
      '#d3d7cf',
      '#555753',
      '#ef2929',
      '#8ae234',
      '#fce94f',
      '#729fcf',
      '#ad7fa8',
      '#34e2e2',
      '#eeeeec',
    ],
    tok: { '--term-bg': '#ffffff', '--term-sel': '#b5d5ff', '--page-sel': '#b5d5ff' },
  },
  'catppuccin-latte': {
    name: 'Catppuccin Latte',
    dark: false,
    bg: '#eff1f5',
    panel: '#ffffff',
    raise: '#e6e9ef',
    crust: '#dce0e8',
    ink: '#4c4f69',
    muted: '#6c6f85',
    line: '#ccd0da',
    accent: '#8839ef',
    working: '#df8e1d',
    idle: '#40a02b',
    needs: '#d20f39',
    watch: '#179299',
    spend: '#fe640b',
    code: '#e6e9ef',
    hl: ['#9ca0b0', '#8839ef', '#40a02b', '#fe640b', '#1e66f5', '#df8e1d', '#d20f39', '#179299'],
    proj: ['#1e66f5', '#8839ef', '#40a02b', '#fe640b', '#d20f39', '#179299', '#df8e1d'],
    ansi: [
      '#5c5f77',
      '#d20f39',
      '#40a02b',
      '#df8e1d',
      '#1e66f5',
      '#ea76cb',
      '#179299',
      '#acb0be',
      '#6c6f85',
      '#d20f39',
      '#40a02b',
      '#df8e1d',
      '#1e66f5',
      '#ea76cb',
      '#179299',
      '#bcc0cc',
    ],
  },
  'flexoki-light': {
    name: 'Flexoki Light',
    dark: false,
    bg: '#fffcf0',
    panel: '#ffffff',
    raise: '#f2f0e5',
    crust: '#e6e4d9',
    ink: '#100f0f',
    muted: '#6f6e69',
    line: '#e6e4d9',
    accent: '#205ea6',
    working: '#ad8301',
    idle: '#66800b',
    needs: '#af3029',
    watch: '#24837b',
    spend: '#bc5215',
    code: '#f2f0e5',
    hl: ['#b7b5ac', '#5e409d', '#66800b', '#bc5215', '#205ea6', '#ad8301', '#af3029', '#24837b'],
    proj: ['#205ea6', '#5e409d', '#66800b', '#bc5215', '#af3029', '#24837b', '#ad8301', '#a02f6f'],
    ansi: [
      '#100f0f',
      '#af3029',
      '#66800b',
      '#ad8301',
      '#205ea6',
      '#a02f6f',
      '#24837b',
      '#6f6e69',
      '#575653',
      '#d14d41',
      '#879a39',
      '#d0a215',
      '#4385be',
      '#ce5d97',
      '#3aa99f',
      '#b7b5ac',
    ],
  },
  'tokyo-day': {
    name: 'Tokyo Night Day',
    dark: false,
    bg: '#e1e2e7',
    panel: '#e9e9ed',
    raise: '#d6d8e3',
    crust: '#d0d5e3',
    ink: '#3760bf',
    muted: '#6172b0',
    line: '#c4c8da',
    accent: '#2e7de9',
    working: '#8c6c3e',
    idle: '#587539',
    needs: '#c64343',
    watch: '#007197',
    spend: '#b15c00',
    code: '#d0d5e3',
    hl: ['#848cb5', '#9854f1', '#587539', '#b15c00', '#2e7de9', '#8c6c3e', '#c64343', '#007197'],
    proj: ['#2e7de9', '#9854f1', '#587539', '#b15c00', '#c64343', '#007197', '#8c6c3e', '#118c74'],
    ansi: [
      '#6172b0',
      '#f52a65',
      '#587539',
      '#8c6c3e',
      '#2e7de9',
      '#9854f1',
      '#007197',
      '#a8aecb',
      '#8990b3',
      '#f52a65',
      '#587539',
      '#8c6c3e',
      '#2e7de9',
      '#9854f1',
      '#007197',
      '#c4c8da',
    ],
  },
  'gruvbox-light': {
    name: 'Gruvbox Light',
    dark: false,
    bg: '#fbf1c7',
    panel: '#f9f5d7',
    raise: '#f2e5bc',
    crust: '#ebdbb2',
    ink: '#3c3836',
    muted: '#7c6f64',
    line: '#d5c4a1',
    accent: '#af3a03',
    working: '#b57614',
    idle: '#79740e',
    needs: '#9d0006',
    watch: '#427b58',
    spend: '#af3a03',
    code: '#f2e5bc',
    hl: ['#928374', '#9d0006', '#79740e', '#8f3f71', '#076678', '#b57614', '#af3a03', '#427b58'],
    proj: ['#076678', '#8f3f71', '#79740e', '#af3a03', '#9d0006', '#427b58', '#b57614'],
    ansi: [
      '#3c3836',
      '#cc241d',
      '#98971a',
      '#d79921',
      '#458588',
      '#b16286',
      '#689d6a',
      '#7c6f64',
      '#928374',
      '#9d0006',
      '#79740e',
      '#b57614',
      '#076678',
      '#8f3f71',
      '#427b58',
      '#504945',
    ],
  },
  'rose-pine-dawn': {
    name: 'Rosé Pine Dawn',
    dark: false,
    bg: '#faf4ed',
    panel: '#fffaf3',
    raise: '#f4ede8',
    crust: '#f2e9e1',
    ink: '#575279',
    muted: '#797593',
    line: '#dfdad9',
    accent: '#d7827e',
    working: '#ea9d34',
    idle: '#56949f',
    needs: '#b4637a',
    watch: '#286983',
    spend: '#ea9d34',
    code: '#f2e9e1',
    hl: ['#9893a5', '#907aa9', '#ea9d34', '#d7827e', '#56949f', '#ea9d34', '#b4637a', '#286983'],
    proj: ['#56949f', '#907aa9', '#286983', '#ea9d34', '#b4637a', '#d7827e'],
    ansi: [
      '#797593',
      '#b4637a',
      '#286983',
      '#ea9d34',
      '#56949f',
      '#907aa9',
      '#d7827e',
      '#cecacd',
      '#9893a5',
      '#b4637a',
      '#286983',
      '#ea9d34',
      '#56949f',
      '#907aa9',
      '#d7827e',
      '#dfdad9',
    ],
  },
  'everforest-light': {
    name: 'Everforest Light',
    dark: false,
    bg: '#fdf6e3',
    panel: '#fffbef',
    raise: '#f4f0d9',
    crust: '#efebd4',
    ink: '#5c6a72',
    muted: '#829181',
    line: '#e0dcc7',
    accent: '#8da101',
    working: '#dfa000',
    idle: '#8da101',
    needs: '#f85552',
    watch: '#35a77c',
    spend: '#f57d26',
    code: '#f4f0d9',
    hl: ['#939f91', '#f85552', '#8da101', '#df69ba', '#3a94c5', '#dfa000', '#f57d26', '#35a77c'],
    proj: ['#3a94c5', '#df69ba', '#8da101', '#f57d26', '#f85552', '#35a77c', '#dfa000'],
    ansi: [
      '#5c6a72',
      '#f85552',
      '#8da101',
      '#dfa000',
      '#3a94c5',
      '#df69ba',
      '#35a77c',
      '#e0dcc7',
      '#829181',
      '#f85552',
      '#8da101',
      '#dfa000',
      '#3a94c5',
      '#df69ba',
      '#35a77c',
      '#efebd4',
    ],
  },
  'kanagawa-lotus': {
    name: 'Kanagawa Lotus',
    dark: false,
    bg: '#f2ecbc',
    panel: '#f6f1cc',
    raise: '#e5ddb0',
    crust: '#dcd5ac',
    ink: '#545464',
    muted: '#716e61',
    line: '#d5cea3',
    accent: '#4d699b',
    working: '#de9800',
    idle: '#6f894e',
    needs: '#c84053',
    watch: '#4e8ca2',
    spend: '#cc6d00',
    code: '#e5ddb0',
    hl: ['#8a8980', '#624c83', '#6f894e', '#b35b79', '#4d699b', '#77713f', '#cc6d00', '#597b75'],
    proj: ['#4d699b', '#624c83', '#6f894e', '#cc6d00', '#c84053', '#597b75', '#77713f', '#b35b79'],
    ansi: [
      '#545464',
      '#c84053',
      '#6f894e',
      '#77713f',
      '#4d699b',
      '#b35b79',
      '#597b75',
      '#716e61',
      '#8a8980',
      '#d7474b',
      '#6e915f',
      '#836f4a',
      '#6693bf',
      '#624c83',
      '#5e857a',
      '#43436c',
    ],
  },
  'flexoki-dark': {
    name: 'Flexoki Dark',
    dark: true,
    bg: '#1c1b1a',
    panel: '#232221',
    raise: '#282726',
    crust: '#100f0f',
    ink: '#cecdc3',
    muted: '#878580',
    line: '#343331',
    accent: '#4385be',
    working: '#d0a215',
    idle: '#879a39',
    needs: '#d14d41',
    watch: '#3aa99f',
    spend: '#da702c',
    code: '#100f0f',
    hl: ['#575653', '#8b7ec8', '#879a39', '#da702c', '#4385be', '#d0a215', '#d14d41', '#3aa99f'],
    proj: ['#4385be', '#8b7ec8', '#879a39', '#da702c', '#d14d41', '#3aa99f', '#d0a215', '#ce5d97'],
    ansi: [
      '#100f0f',
      '#d14d41',
      '#879a39',
      '#d0a215',
      '#4385be',
      '#ce5d97',
      '#3aa99f',
      '#878580',
      '#575653',
      '#af3029',
      '#66800b',
      '#ad8301',
      '#205ea6',
      '#a02f6f',
      '#24837b',
      '#cecdc3',
    ],
  },
  'nord-light': {
    name: 'Nord Light',
    dark: false,
    bg: '#eceff4',
    panel: '#f4f6f9',
    raise: '#e5e9f0',
    crust: '#d8dee9',
    ink: '#2e3440',
    muted: '#4c566a',
    line: '#d8dee9',
    accent: '#5e81ac',
    working: '#b48a3c',
    idle: '#5f8a4a',
    needs: '#bf616a',
    watch: '#4c8a89',
    spend: '#b5664d',
    code: '#e5e9f0',
    hl: ['#7b88a1', '#5e81ac', '#5f8a4a', '#9a6b93', '#3f7d93', '#a37b2c', '#b5664d', '#4c8a89'],
    proj: ['#5e81ac', '#9a6b93', '#5f8a4a', '#b5664d', '#bf616a', '#3f7d93', '#a37b2c'],
    ansi: [
      '#3b4252',
      '#bf616a',
      '#5f8a4a',
      '#a37b2c',
      '#5e81ac',
      '#9a6b93',
      '#3f7d93',
      '#d8dee9',
      '#4c566a',
      '#bf616a',
      '#5f8a4a',
      '#a37b2c',
      '#5e81ac',
      '#9a6b93',
      '#4c8a89',
      '#e5e9f0',
    ],
  },
};
// the board's own, as a tile in the picker draws them (the tokens themselves are :root's; the crust its frame)
const OWN_SKINS = {
  dark: {
    name: 'peixAIrada',
    dark: true,
    bg: '#1c1c1a',
    panel: '#22221f',
    crust: '#282825',
    ink: '#e6e4dc',
    muted: '#9d9c92',
    line: '#2e2e2b',
    accent: '#e08a68',
    working: '#d9a82a',
    idle: '#2f9e5b',
    needs: '#f36464',
    watch: '#45c8c8',
    proj: ['#3b7ddd', '#8a5cf6', '#2e9e6a', '#e5892a'],
  },
  light: {
    name: 'peixAIrada',
    dark: false,
    bg: '#f1f0ec',
    panel: '#f5f4f0',
    crust: '#dedcd6',
    ink: '#21211e',
    muted: '#5c5b54',
    line: '#d6d5cd',
    accent: '#ad5030',
    working: '#d9a82a',
    idle: '#116e3d',
    needs: '#a61e22',
    watch: '#066b6b',
    proj: ['#3b7ddd', '#8a5cf6', '#2e9e6a', '#e5892a'],
  },
};
// A theme is a family of two halves (2026-11-01, round XVII's A1; two slots, a dark theme and a light one picked apart,
// before — Auto paired strangers): the appearance (Auto · Dark · Light) picks the half, the family the same day and
// night (prefs.theme). The halves a palette lacked are its own published variant (Tokyo Night Day, Gruvbox Light, Rosé
// Pine Dawn, Everforest Light, Kanagawa Lotus, Flexoki Dark; Nord Light Nord's Snow Storm); Black, Matte Black,
// Softened and Flashbang have one half, the other the board's own. In the picker's order.
const FAMILIES = {
  own: { name: 'peixAIrada', dark: 'own-dark', light: 'own-light' },
  'tokyo-night': { name: 'Tokyo Night', dark: 'tokyo-night', light: 'tokyo-day' },
  catppuccin: { name: 'Catppuccin', dark: 'catppuccin', light: 'catppuccin-latte' },
  gruvbox: { name: 'Gruvbox', dark: 'gruvbox', light: 'gruvbox-light' },
  'rose-pine': { name: 'Rosé Pine', dark: 'rose-pine', light: 'rose-pine-dawn' },
  everforest: { name: 'Everforest', dark: 'everforest', light: 'everforest-light' },
  kanagawa: { name: 'Kanagawa', dark: 'kanagawa', light: 'kanagawa-lotus' },
  flexoki: { name: 'Flexoki', dark: 'flexoki-dark', light: 'flexoki-light' },
  nord: { name: 'Nord', dark: 'nord', light: 'nord-light' },
  black: { name: 'Black', dark: 'black', light: 'own-light' },
  'matte-black': { name: 'Matte Black', dark: 'matte-black', light: 'own-light' },
  softened: { name: 'Softened', dark: 'own-dark', light: 'softened' },
  flashbang: { name: 'Flashbang', dark: 'own-dark', light: 'flashbang' },
};
/** A half's family — the first that has it, so the board's own is the board's own family's. */
const famOf = k =>
  k ? Object.keys(FAMILIES).find(f => FAMILIES[f].dark === k || FAMILIES[f].light === k) || null : null;
const halfOf = (f, dark) => (FAMILIES[f] || FAMILIES.own)[dark ? 'dark' : 'light'];
const ANSI = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];
// Inks fitted (2026-11-01, round XV): a theme's small-text colours hold 4.5:1 on the grounds they are set on — each
// moved in OKLCH lightness, its hue and chroma kept (chroma cut only where sRGB ends), away from its grounds until it
// holds INK_MIN, a margin for grounds composited. The board's own are fitted in the CSS (the same rule, run once); a
// theme's here, as its block is written: its own inks, and for what it has none of — the PR and ticket states, VS
// Code's blue — the board's of its appearance, before their fit. A ground is a colour, or the ink itself at a tint
// over one (a chip's wash, the asking red's). → test/inks.test.mjs
const INK_MIN = 4.6;
const INK_BASE = {
  light: {
    'pr-open': '#1a6c3b',
    'pr-merged': '#6634c0',
    'pr-closed': '#b42e2e',
    'pr-draft': '#5c5c56',
    'tk-todo': '#4f5b6c',
    'tk-doing': '#1556ad',
    'tk-done': '#156b48',
    vscode: '#0066b8',
  },
  dark: {
    'pr-open': '#3fb950',
    'pr-merged': '#a371f7',
    'pr-closed': '#f85149',
    'pr-draft': '#8b8b85',
    'tk-todo': '#8c9bab',
    'tk-doing': '#579dff',
    'tk-done': '#4bce97',
    vscode: '#4aa5f0',
  },
};
const rgbOf = h => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = c =>
  '#' +
  c
    .map(v =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const linOf = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamOf = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const lumOf = c => 0.2126 * linOf(c[0]) + 0.7152 * linOf(c[1]) + 0.0722 * linOf(c[2]);
const contrastOf = (a, b) => {
  const x = lumOf(a),
    y = lumOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mixOf = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
const oklchOf = c => {
  const [r, g, b] = c.map(linOf),
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(A, B), Math.atan2(B, A)];
};
const fromOklch = (L, C, h) => {
  for (let c = C; ; c -= 0.002) {
    const a = Math.max(0, c) * Math.cos(h),
      b = Math.max(0, c) * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
      m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
      s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const v = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (c <= 0 || v.every(x => x >= -1e-4 && x <= 1.0001)) return v.map(x => gamOf(Math.min(1, Math.max(0, x))));
  }
};
const worstOn = (c, grounds) =>
  Math.min(...grounds.map(g => contrastOf(c, Array.isArray(g) ? g : mixOf(c, g.over, g.tint))));
function fitInk(h, grounds, dark) {
  let c = rgbOf(h);
  if (worstOn(c, grounds) >= INK_MIN) return h;
  const [L0, C, hue] = oklchOf(c);
  for (let L = L0, i = 0; i < 160 && worstOn(c, grounds) < INK_MIN; i++) {
    L = Math.min(1, Math.max(0, L + (dark ? 0.004 : -0.004)));
    c = rgbOf(hexOf(fromOklch(L, C, hue)));
  }
  return hexOf(c);
}
/** A theme's inks, each fitted to where it is set as small text: the chat, the header, the sidebar's grey and the status
 *  bar (flat); muted on a bubble and a tool row too; the accent on the chat and the header; inline code on its tint;
 *  a PR's or a ticket's state on its chip's wash, the asking red on its own; syntax on the code block. */
function themeInks(t) {
  const g = h => rgbOf(h),
    m = (a, b, p) => mixOf(g(a), g(b), p),
    ink = g(t.ink);
  const bg = g(t.bg),
    panel = g(t.panel),
    raise = g(t.raise),
    side = g(t.crust),
    bar = g(t.crust);
  const tool = t.tok?.['--tool-bg'] ? g(t.tok['--tool-bg']) : m(t.raise, t.panel, 0.6),
    flat = [bg, panel, side, bar],
    chips = [bg, panel, side];
  const [com, key, str, num, fn, cls, vr, meta] = t.hl;
  const base = {
    muted: t.muted,
    accent: t.accent,
    'code-ink': t.codeInk || num,
    needs: t.needs,
    watch: t.watch,
    idle: t.idle,
    you: t.you || t.watch,
    'working-ink': t.working,
    ...INK_BASE[t.dark ? 'dark' : 'light'],
    'hl-com': com,
    'hl-key': key,
    'hl-str': str,
    'hl-num': num,
    'hl-fn': fn,
    'hl-cls': cls,
    'hl-var': vr,
    'hl-meta': meta,
  };
  const on = k =>
    k === 'muted'
      ? [...flat, raise, tool]
      : k === 'accent'
        ? [bg, panel]
        : k === 'code-ink'
          ? [bg, panel, raise].map(x => mixOf(ink, x, 0.08))
          : k.startsWith('hl-')
            ? [g(t.code)]
            : /^(pr|tk)-/.test(k)
              ? [...chips, ...chips.map(over => ({ tint: 0.12, over }))]
              : k === 'needs'
                ? [...flat, ...chips.map(over => ({ tint: 0.09, over }))]
                : flat;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fitInk(v, on(k), t.dark)]));
}
// Each theme a block of tokens under its own data-skin, set only beside its own appearance's data-theme (applySkin).
// Three classes deep, so it wins over :root and the dark block's two.
const skinTokens = t => {
  const f = themeInks(t);
  return `--bg: ${t.bg}; --panel: ${t.panel}; --ink: ${t.ink}; --muted: ${f.muted}; --line: ${t.line}; --accent: ${f.accent}; --unread: ${t.accent}; --ended: color-mix(in srgb, ${t.muted} 70%, ${t.bg});
    --user-bg: ${t.raise}; --tool-bg: color-mix(in srgb, ${t.raise} 60%, ${t.panel}); --code-bg: ${t.code}; --code-line: ${t.line}; --inline-bg: color-mix(in srgb, ${t.ink} 8%, transparent);
    --snip-claude: color-mix(in srgb, ${t.ink} 82%, ${t.panel}); --nocolor: ${t.muted}; --term-bg: ${t.code}; --term-sel: rgba(${rgbOf(t.accent).join(', ')}, .3);   /* as xterm reads a colour: it parses no color-mix(), and drew no selection (2026-11-24) */
    --crust: ${t.crust}; --bar: ${t.crust}; --frame: ${t.crust}; --hd-ink: ${t.ink}; --hd-muted: ${f.muted}; --hd-line: ${t.line}; --hd-panel: ${t.panel}; --hd-inline: color-mix(in srgb, ${t.ink} 8%, transparent);
    --working: ${t.working}; --idle: ${f.idle}; --spend: ${t.spend}; ${Object.entries(f)
      .filter(([n]) => !['muted', 'accent', 'idle'].includes(n))
      .map(([n, v]) => `--${n}: ${v};`)
      .join(' ')}
    ${Object.entries(t.tok || {})
      .map(([n, v]) => `${n}: ${v};`)
      .join(' ')}`; // a theme's own where the rule above would guess (Softened's)
};
// A light half under Settings › Appearance › Dark frame (2026-11-01, round XVII's D1): the frame its family's dark half
// — the window's ground that half's own, and what sits on it, the list and the status bar, in its tokens (the CSS's
// Ink block sets the grounds that read them). A family whose dark half is the board's own (Softened) has the CSS's.
// A card on a dark frame (2026-11-03, round XXII): their ground is the frame's a step towards the ink, the CSS's --step, so what
// is fitted to the frame alone is fitted again there. A light frame's step lies between two grounds already held.
const raisedInks = (t, side) => {
  const f = themeInks(t),
    step = mixOf(rgbOf(t.ink), side, 0.06),
    wash = (k, p) => [step, { tint: p, over: step }];
  return Object.entries(f)
    .filter(([k]) => ['muted', 'needs', 'watch', 'idle', 'you', 'working-ink'].includes(k) || /^(pr|tk)-/.test(k))
    .map(([k, v]) => [
      k,
      fitInk(v, /^(pr|tk)-/.test(k) ? wash(k, 0.12) : k === 'needs' ? wash(k, 0.09) : [step], true),
      v,
    ])
    .filter(([, a, b]) => a !== b)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
};
const skinCss = (k, t) => {
  const at = `:root:root[data-skin="${k}"]`,
    d = !t.dark && SKINS[halfOf(famOf(k), true)];
  return (
    `${at} { ${skinTokens(t)} }` +
    (t.dark
      ? `\n${at} #sessions { ${raisedInks(t, rgbOf(t.crust))} }`
      : d
        ? `\n${at}[data-frame="dark"] { --frame: ${d.bg}; }
  ${at}[data-frame="dark"] :is(#sessions, #sbar) { color-scheme: dark; ${skinTokens(d)} --side: var(--bg); --bar: var(--bg); }
  ${at}[data-frame="dark"] #sessions { ${raisedInks(d, rgbOf(d.bg))} }`
        : `\n${at}[data-frame="dark"] { --frame: #1e1e1c; }`)
  );
};
document.head.append(
  Object.assign(document.createElement('style'), {
    id: 'skins',
    textContent: Object.entries(SKINS)
      .map(([k, t]) => skinCss(k, t))
      .join('\n'),
  }),
);
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches; // macOS's, which the board follows only when asked
// A new look spreads from where it was asked for (2026-10-11, Telegram's theme switch): the change made inside a view
// transition, the new page revealed in a circle growing from that point over the old one. No point — a key — or no
// view transitions, or reduced motion: the change at once.
const centreOf = el => {
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};
function revealFrom(pt, change) {
  if (!pt || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return change();
  const r = Math.hypot(Math.max(pt.x, innerWidth - pt.x), Math.max(pt.y, innerHeight - pt.y));
  const vt = document.startViewTransition(change);
  vt.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${pt.x}px ${pt.y}px)`, `circle(${r}px at ${pt.x}px ${pt.y}px)`] },
        {
          duration: 460,
          easing: 'cubic-bezier(.2, .7, .2, 1)',
          pseudoElement: '::view-transition-new(root)',
          id: 'reveal-look',
        },
      );
      noteMotion(null, 'look');
    })
    .catch(() => {});
}
const isSkin = k => !!SKINS[k] || k === 'own-dark' || k === 'own-light';
const skinDarkOf = k => (SKINS[k] ? SKINS[k].dark : k === 'own-dark');
// A board from before the families (2026-11-01): the family of what it wore — following macOS, of the slot it showed,
// else of the other (a slot left empty was the board's own) —, the board's own for a theme gone (Osaka Jade,
// Ristretto); picked rather than followed, the appearance of the theme it wore. Frame › Ink became the dark frame,
// Stage went.
if (['skin', 'skinDark', 'skinLight', 'frame', 'headMark'].some(k => k in prefs)) {
  if (['skin', 'skinDark', 'skinLight'].some(k => k in prefs)) {
    const d = sysDark(),
      worn = prefs.skinFollow
        ? [d ? prefs.skinDark : prefs.skinLight, d ? prefs.skinLight : prefs.skinDark]
        : [prefs.skin];
    prefs.theme = worn.map(famOf).find(Boolean) || 'own';
    if (!prefs.skinFollow && isSkin(prefs.skin)) prefs.look = skinDarkOf(prefs.skin) ? 'dark' : 'light';
  }
  if ('frame' in prefs) prefs.darkFrame = prefs.frame === 'ink';
  for (const k of ['skin', 'skinDark', 'skinLight', 'frame', 'headMark']) delete prefs[k]; // headMark: Capsule · Line until 2026-11-01
  savePrefs(); // once: the head's script reads these
}
if (!FAMILIES[prefs.theme]) prefs.theme = 'own';
if (!prefs.skinFollow && prefs.look !== 'dark' && prefs.look !== 'light') prefs.look = sysDark() ? 'dark' : 'light'; // picked, as macOS was
/** The appearance worn: macOS's while following it, else the one picked (prefs.look). */
const darkNow = () => (prefs.skinFollow ? sysDark() : prefs.look === 'dark');
let skinPreview; // the half the picker shows while it is up ('own-dark', 'own-light' or a theme), undefined when it is down
/** What is worn now: the picker's preview, else the theme's half in the appearance worn. */
const wornKey = () => skinPreview ?? halfOf(prefs.theme, darkNow());
/** The theme worn now, null for the board's own. */
const skinOn = () => (SKINS[wornKey()] ? wornKey() : null);
/** The appearance picked: auto (following macOS), dark or light. */
const lookMode = () => (prefs.skinFollow ? 'auto' : prefs.look === 'dark' ? 'dark' : 'light');
const skinLabel = k => SKINS[k]?.name || `peixAIrada ${skinDarkOf(k) ? 'dark' : 'light'}`;
/** A half as a swatch draws it: its palette, the board's own's from OWN_SKINS. */
const swatchOf = k => SKINS[k] || OWN_SKINS[k === 'own-dark' ? 'dark' : 'light'];
// A project's colour under a theme: the nearest of the theme's own hues, by the hue's angle; a grey, a black, a white
// and a colour the theme has no match for stay as set — as every colour does under a theme of the board's own (asSet).
const hueOf = hex => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16),
    [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255),
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (!d || d / (1 - Math.abs(mx + mn - 1)) < 0.15) return null;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (x * 60 + 360) % 360;
};
function skinColor(c) {
  const k = skinOn(),
    h = hueOf(c);
  if (!k || h === null || SKINS[k].asSet) return c;
  let best = c,
    bd = 1e9;
  for (const p of SKINS[k].proj) {
    const q = hueOf(p);
    if (q === null) continue;
    const d = Math.min(Math.abs(h - q), 360 - Math.abs(h - q));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
// The frame (2026-11-01, round XV; every theme's, round XVII): the chat laid in a frame of its own appearance's shades
// (T3) — or, in light, Settings › Appearance › Dark frame (prefs.darkFrame; Frame › Ink, T5, until round XVII's D1,
// and Stage, T6, a paper frame round a dark chat, gone) a graphite one, the theme's dark half's. <html data-frame> is
// the frame's appearance, as data-theme is the chat's: what sits on the frame — the list, the status bar — reads it
// (the CSS's frame blocks, skinCss's), the rest data-theme.
/** The theme and its appearance on the root, and its name in the settings. The terminals and the board's colours
 *  follow (reskin). The app's window wears the appearance picked — its pages, its find bar, its ground — or macOS's
 *  while the board follows it, so the board's own media query still says macOS's then. */
let lookPosted, barPosted;
function applySkin() {
  const k = wornKey(),
    root = document.documentElement,
    look = skinDarkOf(k) ? 'dark' : 'light';
  root.dataset.theme = look;
  if (SKINS[k]) root.dataset.skin = k;
  else delete root.dataset.skin;
  root.dataset.frame = look === 'light' && prefs.darkFrame ? 'dark' : look;
  const want = prefs.skinFollow ? null : prefs.look === 'dark';
  if (want !== lookPosted) {
    lookPosted = want;
    window.webkit?.messageHandlers?.hub?.postMessage({ type: 'appearance', dark: want });
  } // post is declared further down
  // a theme that asks for it (2026-11-16, Flashbang) paints the window's title bar its frame; none, macOS's own
  const bar = SKINS[k]?.titlebar && root.dataset.frame === 'light' ? SKINS[k].crust : null;
  if (bar !== barPosted) {
    barPosted = bar;
    window.webkit?.messageHandlers?.hub?.postMessage({ type: 'titlebar', color: bar });
  }
  showLook();
}
/** Settings › Appearance (2026-10-16; a switch, *follow macOS*, off by default before): Auto — the half of macOS's
 *  appearance — Dark or Light, whatever macOS shows; under it the themes, a swatch a family, each its two halves
 *  (2026-11-01, round XVII; a row of tiles an appearance before), and the dark frame, off in dark. ⌥⌘Y is the grid,
 *  the board wearing each as you move. */
function showLook() {
  const mode = lookMode(),
    f = prefs.theme;
  for (const b of document.querySelectorAll('#lookPick [data-look]'))
    b.setAttribute('aria-checked', String(b.dataset.look === mode));
  $('#lookSay').textContent = {
    auto: `Follows macOS, ${sysDark() ? 'dark' : 'light'} now`,
    dark: 'Dark, whatever macOS shows',
    light: 'Light, whatever macOS shows',
  }[mode];
  const box = $('#themePick'),
    html = Object.entries(FAMILIES)
      .map(([k, fam]) => {
        const d = swatchOf(fam.dark),
          l = swatchOf(fam.light);
        return `<button type="button" role="radio" data-fam="${k}" aria-checked="${k === f}" title="${skinLabel(fam.dark)} · ${skinLabel(fam.light)}" style="--db:${d.bg};--da:${d.accent};--lb:${l.bg};--la:${l.accent}"><i></i><span>${fam.name}</span></button>`;
      })
      .join(''); // the table's own names: nothing to escape
  if (box._drawn !== html) box.innerHTML = box._drawn = html; // setHtml's way — it is declared further down, and this runs at load
  $('#themeSay').textContent =
    mode === 'auto'
      ? `${skinLabel(halfOf(f, true))} while macOS is dark, ${skinLabel(halfOf(f, false))} while it is light`
      : skinLabel(halfOf(f, mode === 'dark'));
  // the dark frame: in light — off, with why, in dark
  const r = $('#frameRow'),
    say = r.querySelector('small'),
    off = darkNow();
  r.classList.toggle('off', off);
  $('#darkFrame').disabled = off;
  $('#darkFrame').checked = !!prefs.darkFrame;
  say.textContent = off ? say.dataset.off : say.dataset.d;
}
applySkin();
const reskin = () => {
  applySkin();
  for (const tm of [...terms, ...ov.minis.values()]) if (tm.xt) tm.xt.options.theme = xtTheme();
  redrawColors();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reskin);
// Auto: macOS's appearance picks the half; Dark or Light: that half, worn whatever macOS does next.
function setLook(mode, from = null) {
  if (mode === lookMode()) return;
  revealFrom(from, () => {
    prefs.skinFollow = mode === 'auto';
    if (mode !== 'auto') prefs.look = mode;
    savePrefs();
    reskin();
  });
}
/** A family worn, spreading from where it was picked (a swatch, a tile; none from a key). */
function setTheme(f, from = null) {
  if (!FAMILIES[f] || f === prefs.theme) return;
  revealFrom(from, () => {
    prefs.theme = f;
    savePrefs();
    reskin();
  });
}
$('#lookPick').addEventListener('click', e => {
  const b = e.target.closest('[data-look]');
  if (b) setLook(b.dataset.look, centreOf(b));
});
$('#themePick').addEventListener('click', e => {
  const b = e.target.closest('[data-fam]');
  if (b) setTheme(b.dataset.fam, centreOf(b));
});
$('#darkFrame').addEventListener('change', e => {
  const on = e.target.checked;
  revealFrom(centreOf(e.target), () => {
    prefs.darkFrame = on;
    savePrefs();
    applySkin();
  });
});
$('#themeBtn').addEventListener('click', () => {
  settingsOpen(false);
  themesOpen();
});
// ⌥⌘Y: the grid, a tile a family. The arrows move and the board behind follows, in its half of the appearance worn;
// ⏎ or a click wears it; Esc, or a click on the backdrop, puts back what was worn.
const themePick = { list: [], sel: 0, kept: false };
const miniSkin = (f, fam, i) => {
  const dark = darkNow(),
    t = swatchOf(halfOf(f, dark)),
    p = t.proj,
    card = (c, w1, w2, ask) =>
      `<i class="mc${ask ? ' ask' : ''}" style="--c:${c}"><u style="width:${w1}%"></u><u style="width:${w2}%"></u></i>`;
  const half =
    skinLabel(halfOf(f, dark))
      .replace(fam.name, '')
      .trim()
      .replace(/^(Dark|Light)$/, w => w.toLowerCase()) || (dark ? 'dark' : 'light'); // Day, Latte, light… — the board's own, its appearance
  return `<button class="tt${i === themePick.sel ? ' sel' : ''}" data-i="${i}" style="--tbg:${t.bg};--tpn:${t.panel};--tcr:${t.crust};--tink:${t.ink};--tmu:${t.muted};--tnd:${t.needs};--thd:${p[0]}">
      <span class="tshot"><span class="ml">${card(t.needs, 70, 45, 1)}${card(p[1], 80, 55)}${card(p[0], 60, 70)}${card(p[2], 75, 40)}</span>
        <span class="mr"><span class="mh"><b></b></span><span class="mt"><u style="width:82%"></u><u style="width:64%"></u><u class="code" style="width:90%"></u><u style="width:48%"></u><s></s></span></span>
        <span class="sw">${[t.needs, t.working, t.idle, t.watch, t.accent, ...p.slice(0, 3)].map(c => `<i style="background:${c}"></i>`).join('')}</span></span>
      <span class="nm">${esc(fam.name)}${f === prefs.theme ? '<em>worn</em>' : ''}<small>${esc(half)}</small></span></button>`;
};
function themesRender() {
  const q = $('#themeq').value.trim().toLowerCase();
  themePick.list = Object.entries(FAMILIES).filter(
    ([, fam]) => !q || fuzzy([fam.name, skinLabel(fam.dark), skinLabel(fam.light)], q),
  );
  themePick.sel = Math.max(0, Math.min(themePick.sel, themePick.list.length - 1));
  $('#themegrid').innerHTML =
    themePick.list.map(([f, fam], i) => miniSkin(f, fam, i)).join('') || '<div class="none">no theme matches</div>';
  const [f, fam] = themePick.list[themePick.sel] || [];
  if (!fam) return;
  skinPreview = halfOf(f, darkNow());
  $('#themenote').textContent = `${fam.name} — ⏎ wears it`;
  $('#themehow').textContent = prefs.skinFollow
    ? 'following macOS: its dark half while macOS is dark, its light half while it is light'
    : `its ${darkNow() ? 'dark' : 'light'} half, whatever macOS shows · Settings › Appearance › Auto follows macOS`;
  $('#themegrid .tt.sel')?.scrollIntoView({ block: 'nearest' });
  reskin();
}
function themesOpen() {
  const dlg = $('#themes');
  if (dlg.open) return;
  if (inApp) post({ type: 'focus' });
  themePick.kept = false;
  $('#themeq').value = '';
  themePick.sel = Math.max(0, Object.keys(FAMILIES).indexOf(prefs.theme));
  dlg.showModal();
  repostPane();
  themesRender();
  $('#themeq').focus();
}
// `from`: where the pick was made — a tile clicked — for the theme to spread from there in a circle (revealFrom); ⏎
// keeps what the arrows were already showing, so nothing is revealed.
function themeKeep(i = themePick.sel, from = null) {
  const [f] = themePick.list[i] || [];
  if (!f) return;
  prefs.theme = f;
  savePrefs();
  themePick.kept = true;
  revealFrom(i === themePick.sel ? null : from, () => {
    skinPreview = undefined;
    $('#themes').close();
    reskin();
  }); // the close event comes a task later
}
$('#themes').addEventListener('close', () => {
  skinPreview = undefined;
  reskin();
});
$('#themes').addEventListener('click', e => {
  if (e.target === e.currentTarget) return e.currentTarget.close();
  const b = e.target.closest('.tt');
  if (b) themeKeep(+b.dataset.i, centreOf(b));
});
$('#themeq').addEventListener('input', () => {
  themePick.sel = 0;
  themesRender();
});
$('#themeq').addEventListener('keydown', e => {
  const cols = Math.max(1, Math.round($('#themegrid').clientWidth / ($('#themegrid .tt')?.offsetWidth || 1)));
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (step) {
    e.preventDefault();
    themePick.sel = Math.max(0, Math.min(themePick.list.length - 1, themePick.sel + step));
    themesRender();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    themeKeep();
  }
});
// Esc on the page itself: a dialog (the picker, the project editor) or the settings popover closes,
// and the key is *taken* — preventDefault, so WebKit reports it handled. An Esc the page leaves alone climbs to the
// app's window, which in full screen takes it to leave full screen: the picker closed and the window shrank with it
// (2026-09-20). A <dialog>'s own Esc does not
// count as handled, hence closing it here, in the capture phase, before anything else sees the key. With nothing to
// close the key is not touched: the filter boxes and the rename box have their own Esc, and full screen keeps its.
// A countdown to a chat's resume is something to close too (2026-10-07), outside a terminal.
// With the pane up an Esc pressed on one of its pages is the shell's, which calls hotEscape() instead; one pressed here
// reaches the page (2026-10-14: the shell swallowed it too, and claude's drawer beside a page never heard its Esc), and
// outside a terminal or a box — which keep their own — it is hotEscape()'s as well: the chat tab back.
document.addEventListener(
  'keydown',
  e => {
    if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (renderBoard.held) {
      cdEnd(false);
      e.preventDefault();
      e.stopPropagation();
      return;
    } // a card in the hand goes back first (2026-11-02)
    let took = false;
    const dlg = document.querySelector('dialog[open]');
    if (dlg?.id === 'settings' && e.target === $('#sq') && $('#sq').value) {
      $('#sq').value = '';
      settingsFind();
      took = true;
    } // a search let go first
    else if (dlg?.id === 'room' && chatEscape())
      took = true; // the chat's panel: a question, the people first
    else if (dlg?.id === 'zeGame' && zeCallEnd(false))
      took = true; // Zé's game: a chat's call let go, the game goes on
    else if (dlg?.id === 'pick' && agentEscape())
      took = true; // ⌥⌘N's agent list shut, the chats back (2026-11-06)
    else if (dlg) {
      dlg.close();
      took = true;
    } else if (state.paneVisible && !e.target.closest?.('input, textarea, select, [contenteditable], .tbody'))
      took = hotEscape();
    if (!took) return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
