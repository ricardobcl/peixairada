// A transcript's words: a prompt cleaned, a snippet, markdown as a sentence (plain), a tool call said
// in a line.

export const SYNTHETIC_RE =
  /^\s*<(local-command|command-name|command-message|command-args|bash-input|bash-stdout|bash-stderr|user-memory-input|system-reminder|task-notification)\b/;
export const CLEAR_RE = /^\s*<command-name>\/(clear|reset|new)<\/command-name>/; // the head of a transcript /clear began
const STRIP_RE = /<(system-reminder|ide_selection|ide_opened_file)>[\s\S]*?<\/\1>/g;

export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block?.type === 'text')
    .map(block => block.text || '')
    .join('\n');
}

export function cleanPrompt(text) {
  return text.replace(STRIP_RE, '').trim();
}

/** At most `max` UTF-16 units, never half an emoji: a cut between a surrogate pair left a lone one, a U+FFFD on the page. */
export const cut = (text, max) => (text.length > max ? text.slice(0, max).replace(/[\uD800-\uDBFF]$/, '') : text);

export function snippet(text, max = 240) {
  const oneLine = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  return oneLine.length > max ? `${cut(oneLine, max - 1)}…` : oneLine;
}

/** Markdown as a sentence (2026-10-12): a card, a picker and an alert show the start of a prompt or a reply, and the
 *  syntax was drawn as it stood — `[a link](https://…)`, `## a heading`, `- an item`, a PR's whole URL over three lines.
 *  A link is its words, a heading or a quote loses its marker, an item starts with ·, a table's cells are put in a row,
 *  bold and emphasis go; a GitHub PR or issue URL is `repo#n` (the board's own short reference), any other URL loses its
 *  scheme and its long segments. Inline code keeps its backticks: the page draws them as code. */
const GH_URL_RE = /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)[^\s)\]>]*/g;
const ITEM_RE = /^\s*(?:[-*+]|\d{1,3}[.)])\s+/;

export function plain(text) {
  return String(text || '')
    .replace(/^\s*(?:```|~~~).*$/gm, '')
    .split('\n')
    .map(line => {
      if (/^[\s:|-]*$/.test(line) && line.includes('--')) return ''; // a table's rule, or a --- one — two tests, linear: as one regex a long run of dashes and a letter after took seconds (2026-10-14)
      line = line.replace(/^\s*(?:>\s?)+/, '').replace(/^\s{0,3}#{1,6}\s+/, '');
      const item = ITEM_RE.test(line);

      if (item) line = line.replace(ITEM_RE, '');

      line = line.replace(/^\s*\|(.*)\|\s*$/, (_, row) =>
        row
          .split('|')
          .map(cell => cell.trim())
          .filter(Boolean)
          .join(' · '),
      );

      return (item ? '· ' : '') + line;
    })
    .join('\n')
    .replace(/!?\[([^\]\n]*)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/(^|[\s(])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?=[\s).,;:!?]|$)/gm, '$1$2')
    .replace(GH_URL_RE, '$1#$2')
    .replace(/https?:\/\/(?:www\.)?([^\s)\]>]+)/g, (_, rest) =>
      rest
        .replace(/\/$/, '')
        .split('/')
        .map(seg => (seg.length > 24 ? `${seg.slice(0, 12)}…` : seg))
        .join('/'),
    );
}

export const plainSnippet = (text, max) => snippet(plain(String(text || '').slice(0, Math.max(2000, max * 8))), max); // the start is all a snippet shows: a long reply is not walked whole

export function summarizeToolInput(name, input = {}) {
  try {
    switch (name) {
      case 'Bash':
        return input.description || (input.command || '').split('\n')[0];
      case 'Read':
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
        return input.file_path || '';
      case 'NotebookEdit':
        return input.notebook_path || input.file_path || ''; // a notebook's path has a name of its own (2026-10-14)
      case 'Grep':
      case 'Glob':
        return `${input.pattern || ''}${input.path ? `  in ${input.path}` : ''}`;
      case 'Agent':
        return input.description || snippet(input.prompt, 100);
      case 'Monitor':
        return input.description || (input.command || '').split('\n')[0];
      case 'WebFetch':
        return input.url || '';
      case 'WebSearch':
        return input.query || '';
      case 'AskUserQuestion':
        return input.questions?.[0]?.question || '';
      case 'Skill':
        return input.skill || '';
      case 'SendMessage':
        return `to ${input.to || '?'}: ${snippet(input.message, 80)}`;
      default:
        return snippet(JSON.stringify(input), 140);
    }
  } catch {
    return '';
  }
}

export function resultText(block) {
  const content = block.content;

  return typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('\n')
      : '';
}

export function toolResultSnippet(block) {
  return snippet(resultText(block), 200);
}
