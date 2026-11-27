// ---- the chat: a GitHub repo's issue, with the people the board is shared with (2026-10-17) -----------------------
// The server reads the repo (chatTick in server/chat.mjs); every page gets what it knows — `chat`: its issue and what you
// have not read there, who you are, the invitations waiting for you — and what changed (`chatmsgs`). One chat, with no
// name and no rooms (2026-10-18): the panel (#room, a non-modal dialog over the status bar's left end, where its
// segment is) is its messages and a box. A poll is a message (2026-10-20): its answers are buttons, a vote GitHub's
// reaction on it (the server's chatVotes); the box's ▤ asks one, and lunch's dialog one about lunch. The repo's admin also gets the people — invite (the people of the chats' PRs
// suggested), cancel, remove. Settings › Chat makes a repo, joins one, or leaves.
// What comes in is someone else's words, drawn by chatMd alone — markdown with no raw HTML, no attribute but a link's
// address, https or mailto, opened in the system's browser —, never by md() (whose links open a chat's files and
// pages); and nothing here hands a word of it on: no drawer, no claude, no Reply… (test/chat.test.mjs). Its pictures
// (2026-11-25) are the server's to fetch (GET /api/chat/pic, server/chat-pics.mjs): a message names one by its address
// — GitHub's attachment, a GIF on Giphy, Tenor or Imgur (picOf) —, and the page draws the bytes it was given, never
// the address; an <img> of GitHub's own page's is taken for its address alone, the rest of the tag shown as text.
// Your own message is edited in the box (2026-11-25; its pictures kept, ↑ in an empty box the last), any message wears
// GitHub's eight reactions (a chip each, who on hover, yours a click away), and emoji are GitHub's names: a :shortcode:
// drawn as its emoji, the box's picker and its : suggestions (GET /api/chat/emojis, once the panel opens).
const chatUi = {
  n: null,
  msgs: [],
  gone: new Set(),
  loading: false,
  view: 'log',
  people: null,
  peopleErr: null,
  sure: null,
  sending: false,
  watch: 0,
  seenSent: 0,
  err: null,
  setSure: false,
  places: null,
  placesErr: null,
  placesAsk: false,
  newRepo: null,
  useRepo: null,
  poll: null,
  voting: new Set(),
  out: [],
  outSeq: 0,
  sendQ: Promise.resolve(),
  pics: [],
  picSeq: 0,
  atEnd: true,
  viewing: null,
  editing: null,
  emo: null,
  emoNames: null,
  emoAsk: false,
  sug: null,
  rxFor: null,
  reacting: new Map(),
  reactQ: Promise.resolve(),
};

$('#rmPollBtn').innerHTML = ICON.poll;
$('#rmPicBtn').innerHTML = ICON.pic;
$('#rmEmoBtn').innerHTML = ICON.emoji;
$('#rmediting [data-rm="unedit"]').innerHTML = ICON.close;
$('#rmPeople').innerHTML = ICON.people;
$('#rmMore').innerHTML = ICON.more;
$('#rmClose').innerHTML = ICON.close;

// a picture's address the panel draws as one (the server's picUrl holds the same list): GitHub's attachments, a few GIF
// hosts' files, and a Giphy page's GIF
const PIC_ASSET =
  /^https:\/\/github\.com\/(?:user-attachments\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[\w.-]+\/[\w.-]+\/assets\/\d+\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

const PIC_DIRECT =
  /^https:\/\/(?:user-images\.githubusercontent\.com|media[0-4]?\.giphy\.com|i\.giphy\.com|media\.tenor\.com|i\.imgur\.com)\/[\w./%~+-]+(?:\?[\w.=&%~+-]*)?$/i;

const PIC_GIPHY = /^https:\/\/(?:www\.)?giphy\.com\/(?:gifs|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{6,40})\/?$/;

function picOf(address) {
  const url = String(address ?? '').trim();
  const giphy = PIC_GIPHY.exec(url);

  return giphy
    ? `https://media.giphy.com/media/${giphy[1]}/giphy.gif`
    : PIC_ASSET.test(url) || PIC_DIRECT.test(url)
      ? url
      : null;
}

/** Raw HTML in a message, as text — but an <img> naming a picture, as GitHub's page writes one dropped there
 *  (`<img width="892" alt="…" src="https://github.com/user-attachments/assets/…">`): that picture, its alt kept. */
function chatRawHtml(text) {
  const attr = (tag, name) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);

    return match ? (match[1] ?? match[2] ?? match[3]).replace(/&amp;/g, '&') : null;
  };

  let out = '';
  let at = 0;

  for (const match of String(text).matchAll(/<img\b[^>]*>/gi)) {
    const src = picOf(attr(match[0], 'src'));

    if (!src) continue;
    out += `${esc(text.slice(at, match.index))}<img src="${esc(src)}" alt="${esc(attr(match[0], 'alt') || '')}">`;
    at = match.index + match[0].length;
  }

  return out + esc(String(text).slice(at));
}

const chatMarked = hasMd
  ? new marked.Marked({
      gfm: true,
      breaks: true,
      renderer: {
        html: token => chatRawHtml(token.text ?? ''),
        image: token =>
          picOf(token.href)
            ? `<img src="${esc(picOf(token.href))}" alt="${esc(token.text || '')}">`
            : esc(`[image: ${token.text || token.href || ''}]`),
      },
    })
  : null;

const CHAT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
];

const chatHtml = new Map();

/** A picture's place in a message, filled once its bytes are here (chatPicsFill): a button, which shows it large. */
function chatPicNode(url, alt) {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'rmpic';
  button.dataset.pic = url;
  if (alt) button.dataset.alt = alt;
  button.setAttribute('aria-label', alt ? `Picture: ${alt}` : 'Picture');
  return button;
}

/** A message's words as the panel draws them: raw HTML escaped by the parser, then only CHAT_TAGS, and no attribute but a
 *  link's address — https or mailto —, which it says on hover; a picture (an <img> the parser made of one, or a
 *  paragraph that is a picture's address alone) a place for it, by its address. */
function chatMd(text) {
  const markdown = String(text ?? '');

  if (chatHtml.has(markdown)) return chatHtml.get(markdown);

  let html = !chatMarked
    ? esc(markdown).replace(/\n/g, '<br>')
    : DOMPurify.sanitize(chatMarked.parse(markdown), {
        ALLOWED_TAGS: CHAT_TAGS,
        ALLOWED_ATTR: ['href', 'src', 'alt'],
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:https:\/\/|mailto:)/i,
      });

  const tpl = document.createElement('template');

  tpl.innerHTML = html;

  for (const img of tpl.content.querySelectorAll('img')) {
    const pic = picOf(img.getAttribute('src'));

    img.replaceWith(
      pic
        ? chatPicNode(pic, img.getAttribute('alt'))
        : document.createTextNode(`[image: ${img.getAttribute('alt') || ''}]`),
    );
  }

  for (const link of tpl.content.querySelectorAll('a')) {
    const href = link.getAttribute('href');

    if (!href || link.querySelector('.rmpic')) {
      link.replaceWith(...link.childNodes);
      continue;
    } // a picture linked: the picture, which opens itself

    const pic =
      link.parentElement?.tagName === 'P' &&
      link.parentElement.childNodes.length === 1 &&
      link.textContent.trim() === href &&
      picOf(href);

    if (pic) {
      link.replaceWith(chatPicNode(pic, ''));
      continue;
    }

    link.title = href;
    link.rel = 'noopener noreferrer';
  }

  if (chatUi.emo) {
    // :tada: as GitHub draws it, 🎉 — not in code, and a name it does not know left as written
    const walk = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);

    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (node.nodeValue.includes(':') && !node.parentElement?.closest('code, pre')) {
        node.nodeValue = node.nodeValue.replace(/:([\w+-]+):/g, (all, name) => chatUi.emo.get(name) ?? all);
      }
    }
  }

  html = tpl.innerHTML;
  if (chatHtml.size > 2000) chatHtml.clear();
  chatHtml.set(markdown, html);
  return html;
}

// ---- pictures (2026-11-25): asked of the server four at a time, kept for the page's life as blob: addresses -------
// chatPics: an address → {src, w, h, still} once here (`still` a GIF's first frame, drawn under reduced motion), {err, at}
// for a minute, or the ask on its way. A place is filled at once from what is here — the log is drawn whole on a change, so a
// picture's size goes with it and nothing jumps — and the rest once each answer comes.
const chatPics = new Map();
const chatPicQ = [];

let chatPicRun = 0;

const PIC_TYPES = /^image\/(png|jpeg|gif|webp)$/;
const PIC_MAX = 10 * 1024 * 1024;

/** A picture's bytes as a blob: address, its size, and a GIF's still: what a place is filled with. */
async function chatPicOf(blob) {
  const src = URL.createObjectURL(blob);

  const img = await new Promise(ok => {
    const image = new Image();

    image.onload = () => ok(image);
    image.onerror = () => ok(null);
    image.src = src;
  });

  if (!img) {
    URL.revokeObjectURL(src);
    return { err: 'not a picture this page can draw' };
  }

  let still = null;

  if (blob.type === 'image/gif') {
    try {
      const canvas = document.createElement('canvas');

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      still = URL.createObjectURL(await new Promise(ok => canvas.toBlob(ok, 'image/png')));
    } catch {}
  }

  return { src, w: img.naturalWidth, h: img.naturalHeight, still };
}

function chatPicGet(url) {
  if (chatPics.has(url)) return chatPics.get(url);

  const ask = new Promise(ok => {
    chatPicQ.push({ url, ok });
    chatPicPump();
  }).then(got => {
    chatPics.set(url, got.err ? { ...got, at: Date.now() } : got);
    return got;
  });

  chatPics.set(url, ask);
  return ask;
}

function chatPicPump() {
  while (chatPicRun < 4 && chatPicQ.length) {
    const { url, ok } = chatPicQ.shift();

    chatPicRun++;

    (async () => {
      await keySafe();
      const response = await fetch(`/api/chat/pic?u=${encodeURIComponent(url)}`, { headers: keyHeaders() });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        return { err: result.error || `HTTP ${response.status}` };
      }

      return chatPicOf(await response.blob());
    })()
      .catch(error => ({ err: error.message }))
      .then(ok)
      .finally(() => {
        chatPicRun--;
        chatPicPump();
      });
  }
}

const STILL = matchMedia('(prefers-reduced-motion: reduce)');
const stillNow = () => STILL.matches;

STILL.addEventListener('change', () => {
  for (const el of document.querySelectorAll('#room .rmpic.on:not(.bad)')) {
    const got = chatPics.get(el.dataset.pic);

    if (got?.src) chatPicPut(el, got);
  }
}); // turned on or off: every GIF shown follows

/** A place filled: the picture at its size — a GIF still under reduced motion, moving under the pointer or the keys —,
 *  or why it is not shown (a click opens its address in your browser). */
function chatPicPut(el, got) {
  el.classList.remove('wait');
  el.classList.add('on');

  if (got.err) {
    el.classList.add('bad');
    el.title = `Not shown: ${got.err} — click to open it in your browser`;
    el.textContent = `${el.dataset.alt || 'A picture'} · not shown`;
    return;
  }

  const img = src => {
    const image = document.createElement('img');

    image.src = src;
    image.alt = el.dataset.alt || '';
    image.width = got.w;
    image.height = got.h;
    image.decoding = 'async';
    return image;
  };

  el.replaceChildren(img(got.src), ...(got.still && stillNow() ? [img(got.still)] : []));
  el.classList.toggle('still', !!got.still && stillNow());

  if (el.closest('#rmlog') && chatUi.atEnd) {
    const log = $('#rmlog');

    log.scrollTop = log.scrollHeight;
  }
}

function chatPicsFill(root) {
  for (const el of root.querySelectorAll('.rmpic:not(.on, .wait)')) {
    const url = el.dataset.pic;
    let got = chatPics.get(url);

    if (got?.err && Date.now() - got.at > 60_000) {
      chatPics.delete(url);
      got = null;
    } // not shown: asked again a minute on (the chat still being read, a host down)

    if (got && !(got instanceof Promise)) {
      chatPicPut(el, got);
      continue;
    }

    el.classList.add('wait');

    (got || chatPicGet(url)).then(loaded => {
      for (const place of document.querySelectorAll('.rmpic.wait')) {
        if (place.dataset.pic === url) chatPicPut(place, loaded);
      }
    });
  }
}

/** A picture large, over the board: a click or Esc lets it go; its original in your browser. */
function chatView(el) {
  const got = chatPics.get(el.dataset.pic);

  if (!got?.src) return;
  $('#rmviewImg').src = got.src;
  $('#rmviewImg').alt = el.dataset.alt || '';
  $('#rmviewAlt').textContent = el.dataset.alt || '';
  chatUi.viewing = el.dataset.pic;
  $('#rmview').showModal();
  repostPane();
}

$('#rmview').addEventListener('click', event => {
  if (event.target.closest('#rmviewOut')) openExternal(chatUi.viewing, { s: null });
  $('#rmview').close();
});

// your pictures for the next message: up to GitHub as they are added (POST /api/chat/upload — its bytes from a paste, a
// drop or the picker; the app's Finder drop its path), shown from here meanwhile, in the tray over the box
function chatPicsAdd(files) {
  const chat = state.chat;

  if (!chat.ready || chat.room == null) return false;

  if (!chat.pics?.can) {
    note($('#rmPicBtn'), `No pictures from here: ${chat.pics?.why || 'the chat is still being read'}`, true);
    return true;
  }

  for (const file of files) {
    const name = file.name || file.path?.split('/').pop() || 'pasted.png';

    if (file.path ? !/\.(png|jpe?g|gif|webp)$/i.test(file.path) : !PIC_TYPES.test(file.type)) {
      note($('#rmbox'), `${name}: a PNG, JPEG, GIF or WebP picture`, true);
      continue;
    }

    if (file.size > PIC_MAX) {
      note($('#rmbox'), `${name}: larger than 10 MB`, true);
      continue;
    }

    if (chatUi.pics.length >= 10) {
      note($('#rmbox'), 'Ten pictures to a message at most', true);
      break;
    }

    const pic = {
      key: ++chatUi.picSeq,
      name: name.replace(/\.\w{1,5}$/, ''),
      file: file.path ? null : file,
      path: file.path || null,
      got: null,
      url: null,
      err: null,
      up: null,
    };

    chatUi.pics.push(pic);
    chatPicUp(pic);
  }

  chatTrayDraw();
  $('#rmbox').focus();
  return true;
}

function chatPicUp(pic) {
  pic.err = null;

  pic.up = (async () => {
    if (pic.file && !pic.got) {
      pic.got = await chatPicOf(pic.file);
      chatTrayDraw();
      chatDraw();
    }

    await keySafe();

    const response = await fetch(
      `/api/chat/upload?${pic.path ? `path=${encodeURIComponent(pic.path)}` : `name=${encodeURIComponent(pic.file.name || 'pasted.png')}`}`,
      { method: 'POST', body: pic.file || undefined, headers: keyHeaders() },
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    pic.url = result.url;
    if (pic.got && !pic.got.err) chatPics.set(result.url, pic.got);
    else pic.got = await chatPicGet(result.url); // the app's drop: the server kept its bytes
  })()
    .catch(error => {
      pic.err = error.message;
    })
    .finally(() => {
      chatTrayDraw();
      chatDraw();
    });

  chatTrayDraw();
  return pic.up;
}

function chatTrayDraw() {
  const tray = $('#rmpics');

  tray.hidden = !chatUi.pics.length || !!chatUi.poll;

  setHtml(
    tray,
    chatUi.pics
      .map(
        pic =>
          `<span class="rmtp${pic.err ? ' fail' : pic.url ? '' : ' up'}" data-k="${pic.key}" title="${esc(pic.err ? `${pic.name}: not uploaded — ${pic.err}` : pic.url ? pic.name : `${pic.name}: uploading…`)}">${
            pic.got?.src ? `<img src="${esc(pic.got.src)}" alt="">` : '<span class="rmtpw"></span>'
          }<button type="button" class="rmbtn" data-rm="unpic" title="Not this one" aria-label="Drop ${esc(pic.name)}">${ICON.close}</button></span>`,
      )
      .join(''),
  );
}

/** A message on its way, its pictures as you gave them: drawn from here. */
const chatOutPics = outgoing =>
  !outgoing.pics?.length
    ? ''
    : `<div class="rmoutpics">${outgoing.pics.map(pic => (pic.got?.src ? `<span class="rmpic on"><img src="${esc(pic.got.src)}" width="${pic.got.w}" height="${pic.got.h}" alt=""></span>` : '<span class="rmpic wait"></span>')).join('')}</div>`;

const mdAlt = name =>
  String(name)
    .replace(/[[\]\\\n]/g, ' ')
    .trim()
    .slice(0, 80);

// ---- emoji (2026-11-25): GitHub's names, asked once the panel opens; the picker's first row what you used last, then
// the ones a chat reaches for most; a name hunted by its start, a word's start, then anywhere in it
const EMO_TOP = [
  '+1',
  '-1',
  'smile',
  'joy',
  'rofl',
  'sweat_smile',
  'wink',
  'slightly_smiling_face',
  'upside_down_face',
  'thinking',
  'heart_eyes',
  'sunglasses',
  'partying_face',
  'grimacing',
  'sob',
  'scream',
  'facepalm',
  'shrug',
  'pray',
  'clap',
  'raised_hands',
  'muscle',
  'ok_hand',
  'wave',
  'handshake',
  'v',
  'eyes',
  'heart',
  'fire',
  'tada',
  'rocket',
  'sparkles',
  'star',
  'zap',
  'boom',
  '100',
  'white_check_mark',
  'x',
  'warning',
  'bug',
  'skull',
  'see_no_evil',
  'coffee',
  'beers',
  'pizza',
  'hamburger',
  'ramen',
  'sushi',
  'fish',
  'tropical_fish',
  'fishing_pole_and_fish',
  'whale',
];

// a reaction's emoji, GitHub's eight in its own order (the server's REACTIONS)
const REACT_EMO = {
  '+1': '👍',
  '-1': '👎',
  laugh: '😄',
  hooray: '🎉',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀',
};

function chatEmoLoad() {
  if (chatUi.emo || chatUi.emoAsk) return;
  chatUi.emoAsk = true;

  api('GET', '/api/chat/emojis').then(
    result => {
      chatUi.emo = new Map(Object.entries(result.emojis || {}));
      chatUi.emoNames = [...chatUi.emo.keys()].sort();
      chatHtml.clear(); // the words drawn again, their :names: as emoji
      chatDraw();
      if (!$('#rmemo').hidden) chatEmoDraw();
    },
    () => {
      chatUi.emoAsk = false; // asked again the next time the panel opens
    },
  );
}

/** The names whose emoji a search finds, best first: `query`'s start, a word's start in the name, then anywhere. */
function chatEmoFind(query, max) {
  const names = chatUi.emoNames || [];

  query = String(query).toLowerCase().replace(/^:|:$/g, '');
  if (!query) return [];

  const starts = [];
  const wordStarts = [];
  const inside = [];

  for (const name of names) {
    if (name.startsWith(query)) starts.push(name);
    else if (name.includes(`_${query}`)) wordStarts.push(name);
    else if (name.includes(query)) inside.push(name);
    if (starts.length >= max) break;
  }

  return [...starts.sort((left, right) => left.length - right.length), ...wordStarts, ...inside].slice(0, max);
}

const emoNote = name => {
  const earlier = prefs.emojiRecent.filter(other => other !== name);

  prefs.emojiRecent = [name, ...earlier].slice(0, 24);
  savePrefs();
};

/** Words into the box where its caret is, as typed there. */
function chatInsert(text) {
  const box = $('#rmbox');

  box.focus();
  box.setRangeText(text, box.selectionStart, box.selectionEnd, 'end');
  chatGrow();
}

function chatEmoOpen(on = $('#rmemo').hidden) {
  $('#rmemo').hidden = !on;
  $('#rmEmoBtn').setAttribute('aria-expanded', String(on));
  $('#rmEmoBtn').classList.toggle('on', on);
  if (!on) return;
  chatSugClose();
  chatEmoLoad();
  $('#rmemoq').value = '';
  chatEmoDraw();
  $('#rmemoq').focus();
}

function chatEmoDraw() {
  const query = $('#rmemoq').value.trim();
  const emojis = chatUi.emo;

  if (!emojis) return setHtml($('#rmemog'), '<div class="rmnone">Asking GitHub for its emoji…</div>');

  const names = query
    ? chatEmoFind(query, 96)
    : [...new Set([...prefs.emojiRecent, ...EMO_TOP])].filter(name => emojis.has(name));

  setHtml(
    $('#rmemog'),
    names.length
      ? names
          .map(
            name =>
              `<button type="button" class="rmeb" data-emo="${esc(name)}" title=":${esc(name)}:" role="option" aria-label="${esc(name.replace(/_/g, ' '))}">${emojis.get(name)}</button>`,
          )
          .join('')
      : `<div class="rmnone">No emoji called “${esc(query)}”</div>`,
  );
}

function chatEmoPick(name) {
  const ch = chatUi.emo?.get(name);

  if (!ch) return;
  emoNote(name);
  chatEmoOpen(false);
  chatInsert(ch);
}

$('#rmemoq').addEventListener('input', chatEmoDraw);

$('#rmemoq').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const first = $('#rmemog .rmeb');

    if (first) chatEmoPick(first.dataset.emo);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    $('#rmemog .rmeb')?.focus();
  }
});

// the grid walked by the arrows, eight to a row (CSS's); ↑ from the first row back to the search
$('#rmemog').addEventListener('keydown', event => {
  const all = [...$('#rmemog').querySelectorAll('.rmeb')];
  const index = all.indexOf(document.activeElement);
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[event.key];

  if (index < 0 || !step) return;
  event.preventDefault();
  if (index + step < 0) return $('#rmemoq').focus();
  all[Math.min(all.length - 1, index + step)]?.focus();
});

// : and a name in the box: its emoji offered under the pointer of the caret — ↑↓ walk them, ⇥ or ⏎ takes one, esc lets
// them go; a name closed by its colon becomes its emoji as it is typed
function chatSugUpdate() {
  const box = $('#rmbox');
  const before = box.value.slice(0, box.selectionStart);

  if (box.selectionStart !== box.selectionEnd || !chatUi.emo) return chatSugClose();
  const done = /(^|[\s([{])(:([\w+-]+):)$/.exec(before);

  if (done && chatUi.emo.has(done[3])) {
    box.setRangeText(chatUi.emo.get(done[3]), before.length - done[2].length, before.length, 'end');
    emoNote(done[3]);
    chatGrow();
    return chatSugClose();
  }

  const match = /(^|[\s([{]):([\w+-]{2,})$/.exec(before);
  const list = match ? chatEmoFind(match[2], 8) : [];

  if (!list.length) return chatSugClose();
  const same = chatUi.sug?.list.join() === list.join();

  chatUi.sug = { start: before.length - match[2].length - 1, list, sel: same ? chatUi.sug.sel : 0 };
  chatSugDraw();
}

function chatSugDraw() {
  const suggestions = chatUi.sug;

  $('#rmsug').hidden = !suggestions;
  if (!suggestions) return;

  setHtml(
    $('#rmsug'),
    suggestions.list
      .map(
        (name, index) =>
          `<div class="rmsi${index === suggestions.sel ? ' on' : ''}" data-emo="${esc(name)}" role="option" aria-selected="${index === suggestions.sel}"><span class="e">${chatUi.emo.get(name)}</span>:${esc(name)}:</div>`,
      )
      .join(''),
  );
}

function chatSugClose() {
  if (!chatUi.sug) return false;
  chatUi.sug = null;
  chatSugDraw();
  return true;
}

function chatSugPick(name = chatUi.sug?.list[chatUi.sug.sel]) {
  const suggestions = chatUi.sug;
  const box = $('#rmbox');

  if (!suggestions || !name) return;
  const next = box.value[box.selectionStart];

  box.setRangeText(
    chatUi.emo.get(name) + (next && /\s/.test(next) ? '' : ' '),
    suggestions.start,
    box.selectionStart,
    'end',
  );

  emoNote(name);
  chatSugClose();
  chatGrow();
  box.focus();
}

$('#rmsug').addEventListener('mousedown', event => {
  const it = event.target.closest('.rmsi');

  if (!it) return;
  event.preventDefault(); // the box keeps the keys
  chatSugPick(it.dataset.emo);
});

// ---- reactions (2026-11-25): a chip for each given, yours lit, who on hover; given or taken back at once, then as
// GitHub took it (POST /api/chat/react)
function chatReactsHtml(message) {
  const me = state.chat.me?.login;
  const by = new Map();

  if (message.reacts?.length) {
    for (const reaction of message.reacts) by.set(reaction.r, [...(by.get(reaction.r) || []), reaction.who]);
  } else for (const [kind, count] of Object.entries(message.rc || {})) by.set(kind, Array(count).fill(null));
  if (!by.size) return '';

  const chips = Object.keys(REACT_EMO)
    .filter(kind => by.has(kind))
    .map(kind => {
      const who = by.get(kind);
      const mine = who.includes(me);
      const names = who.filter(Boolean).map(login => (login === me ? 'you' : login));

      return `<button type="button" class="rmrc${mine ? ' mine' : ''}" data-rm="react" data-r="${esc(kind)}" aria-pressed="${mine}" title="${esc(names.length ? names.join(', ') : `${who.length}`)}" aria-label="${esc(`${kind}: ${who.length}${mine ? ', yours among them' : ''}`)}">${REACT_EMO[kind]}<b>${who.length}</b></button>`;
    })
    .join('');

  return `<div class="rmrx">${chips}<button type="button" class="rmrc add" data-rm="rxpick" title="React" aria-label="React">${ICON.react}</button></div>`;
}

/** Your reaction toggled at once; GitHub told in the order you clicked, one after another (a quick second click is
 *  not lost), its word taken once none of yours on that message is still on its way. */
function chatReact(id, kind) {
  const message = chatUi.msgs.find(entry => entry.id === id);
  const me = state.chat.me;

  if (!message || message.poll || !me) return;

  const toggle = before => {
    const list = before.reacts ? [...before.reacts] : [];
    const had = list.some(reaction => reaction.who === me.login && reaction.r === kind);

    const reacts = had
      ? list.filter(reaction => !(reaction.who === me.login && reaction.r === kind))
      : [...list, { r: kind, who: me.login, face: me.face }];

    const rc = {};

    for (const reaction of reacts) rc[reaction.r] = (rc[reaction.r] || 0) + 1;
    return { ...before, reacts, rc };
  };

  chatTake([toggle(message)], []);
  chatDraw();
  chatUi.reacting.set(id, (chatUi.reacting.get(id) || 0) + 1);

  chatUi.reactQ = chatUi.reactQ.then(async () => {
    let got = null;

    try {
      got = (await api('POST', '/api/chat/react', { id, r: kind })).msg;
    } catch (error) {
      const now = chatUi.msgs.find(entry => entry.id === id);

      if (now) chatTake([toggle(now)], []); // this one back as it was
      note($(`#rmlog .rmmsg[data-id="${id}"] .rmbody`) || $('#rmlog'), `Not reacted: ${error.message}`, true);
    }

    const left = chatUi.reacting.get(id) - 1;

    if (left) chatUi.reacting.set(id, left);
    else chatUi.reacting.delete(id);
    if (got && !left && got.n === chatUi.n) chatTake([got], []);
    chatDraw();
  });
}

/** GitHub's eight, by the message's own React button. */
function chatRxOpen(id, at) {
  const picker = $('#rmrxp');

  chatUi.rxFor = id;

  setHtml(
    picker,
    Object.entries(REACT_EMO)
      .map(
        ([kind, emoji]) =>
          `<button type="button" class="rmrb" data-rx="${esc(kind)}" title="${esc(kind)}" aria-label="${esc(kind)}">${emoji}</button>`,
      )
      .join(''),
  );

  picker.hidden = false;

  // over the button, or under it where the log has no room above (the panel's head is not the row's)
  const room = $('#room').getBoundingClientRect();
  const log = $('#rmlog').getBoundingClientRect();
  const rect = at.getBoundingClientRect();
  const up = rect.top - picker.offsetHeight - 4;

  picker.style.left = `${Math.max(8, Math.min(room.width - picker.offsetWidth - 8, rect.right - room.left - picker.offsetWidth))}px`;
  picker.style.top = `${(up >= log.top ? up : rect.bottom + 4) - room.top}px`;
  picker.querySelector('.rmrb').focus();
}

function chatRxClose() {
  if ($('#rmrxp').hidden) return false;
  $('#rmrxp').hidden = true;
  chatUi.rxFor = null;
  return true;
}

$('#rmrxp').addEventListener('click', event => {
  const button = event.target.closest('[data-rx]');

  if (!button) return;
  const id = chatUi.rxFor;

  chatRxClose();
  chatReact(id, button.dataset.rx);
});

// ---- your message edited (2026-11-25): in the box, as Telegram's and WhatsApp's are — its words there, its pictures
// kept as they were (a picture added from the tray joins them), ⏎ saves, esc puts back what the box held; ↑ in an empty
// box takes your last. Drawn at once, faded till GitHub has it; one that did not save stays in the box, saying why.
/** A message's words and its pictures apart: a paragraph that is pictures alone is one of them. */
function chatSplitPics(body) {
  const text = [];
  const pics = [];

  const pic = /!\[[^\]\n]*\]\(([^)\s]+)\)|<img\b[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)[^>]*>/gi;

  for (const para of String(body).split(/\n{2,}/)) {
    const found = [...para.matchAll(pic)];

    if (found.length && found.every(match => picOf(match[1] || match[2])) && !para.replace(pic, '').trim()) {
      pics.push(para.trim());
    } else text.push(para);
  }

  return { text: text.join('\n\n').trim(), pics };
}

function chatEditStart(id) {
  const message = chatUi.msgs.find(entry => entry.id === id);
  const box = $('#rmbox');

  if (!message || message.poll || message.who !== state.chat.me?.login) return;
  if (chatUi.poll) chatPollForm(false);
  const { text, pics } = chatSplitPics(message.body);

  chatUi.editing = {
    id,
    pics,
    body: message.body,
    draft: chatUi.editing ? chatUi.editing.draft : box.value,
    saving: false,
  };

  chatSugClose();
  chatEmoOpen(false);
  box.value = text;
  chatGrow();
  chatDraw();
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  $(`#rmlog .rmmsg[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function chatEditEnd(restore) {
  const ed = chatUi.editing;

  if (!ed) return false;
  chatUi.editing = null;
  $('#rmbox').value = restore ? ed.draft : '';
  chatGrow();
  chatDraw();
  $('#rmbox').focus();
  return true;
}

async function chatEditSave() {
  const ed = chatUi.editing;
  const message = chatUi.msgs.find(entry => entry.id === ed?.id);

  if (!ed || ed.saving) return;
  if (!message) return chatEditEnd(true);
  ed.saving = true;
  chatDraw();
  const added = chatUi.pics.slice();

  try {
    await Promise.all(added.map(pic => pic.up));
    const bad = added.find(pic => pic.err);

    if (bad) throw new Error(`${bad.name}: ${bad.err}`);

    const body = [$('#rmbox').value.trim(), ...ed.pics, ...added.map(pic => `![${mdAlt(pic.name)}](${pic.url})`)]
      .filter(Boolean)
      .join('\n\n');

    if (!body) throw new Error('nothing left — delete it instead');

    if (body !== ed.body) {
      chatTake([{ ...message, body, edited: new Date().toISOString() }], []);
      chatDraw();
      const result = await api('POST', '/api/chat/edit', { id: ed.id, body });

      if (result.msg.n === chatUi.n) chatTake([result.msg], []);
    }

    chatUi.pics = chatUi.pics.filter(pic => !added.includes(pic));
    chatTrayDraw();
    chatEditEnd(false);
  } catch (error) {
    const now = chatUi.msgs.find(entry => entry.id === ed.id);

    if (now && now.body !== ed.body) chatTake([{ ...now, body: ed.body, edited: message.edited }], []);
    ed.saving = false;
    chatDraw();
    note($('#rmediting'), `Not saved: ${error.message}`, true);
  }
}

const chatClock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const chatFace = (url, cls = 'face') =>
  /^(https:\/\/avatars\.githubusercontent\.com\/|data:image\/)/.test(url || '')
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`
    : `<span class="${cls}"></span>`;

/** The status bar's word on the chat (renderBar): its unread count, an invitation waiting, what went wrong — nothing
 *  while there is no chat and no invitation. Reads state alone: the bar is drawn before this section has run. */
function chatSeg() {
  const chat = state.chat;

  if (!chat.on) {
    return chat.invites?.length
      ? `<button class="seg chatseg inv" id="sbChat" title="${esc(`${chat.invites[0].by || 'Someone'} invited you to the chat in ${chat.invites[0].repo} — click to join it`)}">${ICON.chat}invited</button>`
      : '';
  }

  const unread = chat.unread || 0;

  return `<button class="seg chatseg${chat.error ? ' err' : ''}" id="sbChat" title="${esc(chat.error ? `The chat: ${chat.error}` : `The chat in ${chat.repo}${unread ? ` — ${unread} new` : ''} · click to open it`)}">${ICON.chat}chat${unread ? `<b>${rn('chat', unread)}</b>` : ''}</button>`;
}

function chatSegClick() {
  if (state.chat.on && !state.chat.missing) {
    if ($('#room').open) $('#room').close();
    else chatOpen();
  } else settingsAt('chat', '#chatSet');
}

/** The panel, on the messages — or on the people. */
function chatOpen(view = 'log') {
  const chat = state.chat;

  if (!chat.on || chat.missing) return settingsAt('chat', '#chatSet');
  const dlg = $('#room');

  chatUi.view = view;
  chatUi.sure = null;

  if (!dlg.open) {
    if ($('#hmenu').open) $('#hmenu').close();
    dlg.show();
    repostPane();
    if (inApp) post({ type: 'focus' });
    chatWatch();
  }

  if (view === 'people') chatPeopleLoad();
  chatLoad();
  chatEmoLoad();
  chatDraw(true);
  renderBar();
  chatSeenNow(); // what came while it was shut is read now

  if (chat.ready && chat.pics && !chat.pics.can) {
    api('GET', '/api/chat?pics=1').then(
      latest => {
        state.chat = latest;
        chatChanged();
      },
      () => {},
    );
  } // shared since? (its invitation taken by the server)

  if (view !== 'log') $('#rmfind').focus();
  else (chatUi.poll ? $('#rmform input') : $('#rmbox')).focus();
}

/** The chat's messages, read as the panel first shows them — and again for another issue (the repo's, or its first
 *  closed on GitHub). */
async function chatLoad() {
  const room = state.chat.room;

  if (room === chatUi.n && (chatUi.msgs.length || chatUi.loading)) return;

  Object.assign(chatUi, {
    n: room,
    msgs: [],
    gone: new Set(),
    loading: room != null,
    err: null,
    sure: null,
    seenSent: 0,
  });

  chatDraw(true);
  if (room == null) return;

  try {
    const result = await api('GET', '/api/chat/messages');

    if (chatUi.n !== room) return;

    if (result.room === room) {
      chatTake(
        result.msgs.filter(message => !chatUi.gone.has(message.id)),
        [],
      );
    }
  } catch (error) {
    if (chatUi.n === room) chatUi.err = error.message;
  }

  if (chatUi.n !== room) return;
  chatUi.loading = false;
  chatDraw(true);
  chatSeenNow();
}

/** Messages into the panel, by their ids: an edit in place, a delete out (and kept out of a fetch still on its way). */
function chatTake(add, gone) {
  const by = new Map(chatUi.msgs.map(message => [message.id, message]));

  for (const message of add) by.set(message.id, message);

  for (const id of gone) {
    by.delete(id);
    chatUi.gone.add(id);
  }

  chatUi.msgs = [...by.values()].sort((left, right) => left.id - right.id);
}

function chatLogHtml() {
  const chat = state.chat;
  const me = chat.me?.login;
  const admin = chat.role === 'admin';

  const sure = !chatUi.sure
    ? ''
    : `<div class="rmsure" role="group"><span>${admin ? 'Stop the chat on this board? It stays on GitHub, and you its admin.' : 'Leave the chat? Coming back takes a new invitation.'}</span><button type="button" class="btn" data-rm="unsure">Cancel</button><button type="button" class="btn danger" data-rm="leave">${admin ? 'Stop' : 'Leave'}</button></div>`;

  if (!chat.ready) return `${sure}<div class="rmnone">${esc(chat.error || 'Reading the chat…')}</div>`;

  if (chat.room == null) {
    return `${sure}<div class="rmnone">No chat in ${esc(chat.repo)} yet — its admin's board starts it.</div>`;
  }

  // yours on their way (chatSend) after everything said, as you see them: faded while they go, and one that did not go
  // says so under its words — Try again, or Edit (its words back in the box)
  const outs = chatUi.out
    .filter(outgoing => outgoing.n === chatUi.n)
    .map(outgoing => ({ who: me || 'you', face: chat.me?.face, at: outgoing.at, body: outgoing.body, out: outgoing }));

  if (!chatUi.msgs.length && !outs.length) {
    return `${sure}<div class="rmnone">${esc(chatUi.err || (chatUi.loading ? 'Reading…' : 'Nothing said yet.'))}</div>`;
  }

  let out = sure;
  let prev = null;

  for (const message of [...chatUi.msgs, ...outs]) {
    if (!prev || dayOf(prev.at) !== dayOf(message.at)) {
      out += `<div class="rmday">${esc(dayOf(message.at))}</div>`;
      prev = null;
    }

    const cont = prev?.who === message.who && new Date(message.at) - new Date(prev.at) < 5 * 60_000;
    const mine = message.who === me || !!message.out;
    const outgoing = message.out;

    const ed =
      !outgoing && chatUi.editing?.id === message.id ? (chatUi.editing.saving ? ' editing saving' : ' editing') : '';

    out +=
      `<div class="rmmsg${cont ? ' cont' : ''}${mine ? ' mine' : ''}${outgoing ? ` out${outgoing.err ? ' fail' : ''}` : ''}${ed}" ${outgoing ? `data-out="${outgoing.key}"` : `data-id="${message.id}"`}>${chatFace(message.face)}` +
      `<div class="rmwho"><b>${esc(message.who)}</b><time datetime="${esc(message.at)}" title="${esc(new Date(message.at).toLocaleString())}">${esc(chatClock(message.at))}</time>${message.edited ? `<span class="edited" title="Edited ${esc(new Date(message.edited).toLocaleString())}">edited</span>` : ''}${outgoing && !outgoing.err ? '<span class="vh">sending</span>' : ''}</div>` +
      `<div class="rmbody">${message.poll ? chatPollHtml(message) : chatMd(message.body)}${outgoing ? chatOutPics(outgoing) : ''}</div>${
        !outgoing && !message.poll ? chatReactsHtml(message) : ''
      }${
        outgoing?.err
          ? `<div class="rmfail" role="status"><span>Not sent: ${esc(outgoing.err)}</span><button type="button" class="btn" data-rm="retry">Try again</button><button type="button" class="btn" data-rm="edit" title="Its words back in the box">Edit</button></div>`
          : !outgoing
            ? `<div class="rmacts">${
                !message.poll
                  ? `<button type="button" class="rmbtn" data-rm="rxpick" title="React" aria-label="React">${ICON.react}</button>`
                  : ''
              }${
                mine && !message.poll
                  ? `<button type="button" class="rmbtn" data-rm="editmsg" title="Edit your message — or ↑ in an empty box" aria-label="Edit">${ICON.edit}</button>`
                  : ''
              }${
                mine || admin
                  ? `<button type="button" class="rmbtn rmdel" data-rm="del" title="${mine ? 'Delete your message' : "Delete this message — as the chat's admin"}" aria-label="Delete">${ICON.close}</button>`
                  : ''
              }</div>`
            : ''
      }</div>`;

    prev = message;
  }

  return out;
}

/** A poll as the panel draws it: the question, an answer a row — a click votes for it, again takes it back —, its share
 *  of the people who answered, and who, you first. */
function chatPollHtml(message) {
  const poll = message.poll;
  const me = state.chat.me?.login;
  const votes = message.votes || [];
  const people = new Set(votes.map(vote => vote.who)).size;

  const rows = poll.opts
    .map(option => {
      const vs = votes
        .filter(vote => vote.r === option.r)
        .sort((left, right) => (right.who === me) - (left.who === me));

      const mine = vs.some(vote => vote.who === me);

      return (
        `<button type="button" class="rmopt${mine ? ' mine' : ''}" data-rm="vote" data-r="${esc(option.r)}" aria-pressed="${mine}" style="--p:${people ? Math.round((vs.length / people) * 100) : 0}%">` +
        `<span class="rmol">${esc(option.label)}</span><b>${vs.length}</b>${
          vs.length
            ? `<span class="rmvs">${vs
                .slice(0, 6)
                .map(vote => chatFace(vote.face, 'vf'))
                .join('')}<span>${esc(vs.map(vote => (vote.who === me ? 'you' : vote.who)).join(', '))}</span></span>`
            : ''
        }</button>`
      );
    })
    .join('');

  return (
    `<div class="rmpoll"><div class="rmq">${ICON.poll}<span>${esc(poll.q)}</span></div>${rows}` +
    `<div class="rmpf">${people ? `${people} answered` : 'Nobody has answered yet'} · ${poll.many ? 'as many answers as you like' : 'one answer each'}</div></div>`
  );
}

/** Your answer, drawn at once and then as GitHub took it; on a poll of one answer each it moves yours. */
async function chatVote(id, kind) {
  const message = chatUi.msgs.find(entry => entry.id === id);
  const me = state.chat.me;

  if (!message?.poll || !me || chatUi.voting.has(id)) return;

  const before = message.votes || [];
  const had = before.some(vote => vote.who === me.login && vote.r === kind);

  chatUi.voting.add(id);

  chatTake(
    [
      {
        ...message,
        votes: had
          ? before.filter(vote => !(vote.who === me.login && vote.r === kind))
          : [
              ...before.filter(vote => message.poll.many || vote.who !== me.login),
              { r: kind, who: me.login, face: me.face, at: new Date().toISOString() },
            ],
      },
    ],
    [],
  );

  chatDraw();

  try {
    const result = await api('POST', '/api/chat/vote', { id, r: kind });

    if (result.msg.n === chatUi.n) chatTake([result.msg], []);
  } catch (error) {
    const now = chatUi.msgs.find(entry => entry.id === id);

    if (now) chatTake([{ ...now, votes: before }], []);
    chatDraw();
    note($(`#rmlog .rmmsg[data-id="${id}"] .rmq`) || $('#rmlog'), `Not voted: ${error.message}`, true);
  } finally {
    chatUi.voting.delete(id);
  }

  chatDraw();
}

// the poll's form, in the box's place: the question, two answers or more — eight at most, one for each reaction GitHub
// has —, one answer each or several. What is typed is chatUi.poll's; the form is drawn again only when its rows change.
function chatPollForm(fill = null) {
  chatUi.poll = fill === false ? null : { q: '', answers: ['', ''], many: false, ...fill };

  if (chatUi.poll && chatUi.poll.answers.length < 2) {
    chatUi.poll.answers.push(...Array(2 - chatUi.poll.answers.length).fill(''));
  }

  chatPollDraw();
  if (chatUi.poll) $(`#rmform [data-pf="${fill?.q ? 'post' : 'q'}"]`).focus();
  else $('#rmbox').focus();
}

function chatPollDraw() {
  const poll = chatUi.poll;
  const form = $('#rmform');
  const text = 'type="text" spellcheck="false" autocomplete="off"';

  form.hidden = !poll;
  $('#rmrow').hidden = !!poll;
  chatTrayDraw();
  if (!poll) return;
  const lunch = state.lunch?.set;

  form.innerHTML =
    `<input ${text} data-pf="q" maxlength="200" placeholder="Ask the chat — Lunch at 12:30?" aria-label="The question" value="${esc(poll.q)}">${poll.answers
      .map(
        (answer, index) =>
          `<div class="rma"><input ${text} data-pf="a" data-i="${index}" maxlength="80" placeholder="Answer ${index + 1}" aria-label="Answer ${index + 1}" value="${esc(answer)}">${
            poll.answers.length > 2
              ? `<button type="button" class="rmbtn" data-pf="drop" data-i="${index}" title="Drop this answer" aria-label="Drop answer ${index + 1}">${ICON.close}</button>`
              : ''
          }</div>`,
      )
      .join(
        '',
      )}<div class="rmpfoot"><button type="button" class="btn" data-pf="add"${poll.answers.length >= 8 ? ' disabled title="Eight at most — one for each reaction GitHub has"' : ''}>Add an answer</button>` +
    `<label><input type="checkbox" data-pf="many"${poll.many ? ' checked' : ''}>Several each</label><span class="spacer"></span>${
      lunch
        ? '<button type="button" class="btn" data-pf="lunch" title="Who is going to lunch, and where — lunch\'s places">Lunch</button>'
        : ''
    }<button type="button" class="btn" data-pf="cancel">Cancel</button><button type="button" class="btn go" data-pf="post">Ask</button></div>`;
}

/** Lunch's poll: who is going and where — the day's places not closed, and Not today. */
function lunchPoll() {
  const lunch = state.lunch || {};

  const places = (lunch.places || [])
    .filter(place => place.state !== 'closed')
    .map(place => place.name)
    .slice(0, 7);

  return {
    q: lunch.at ? `Lunch at ${lunch.at}?` : 'Lunch?',
    answers: [...(places.length ? places : ['Going']), 'Not today'],
    many: false,
  };
}

async function chatPollPost(btn) {
  const poll = chatUi.poll;

  if (!poll || chatUi.sending) return;
  chatUi.sending = true;
  btn.disabled = true;

  try {
    const result = await api('POST', '/api/chat/poll', {
      q: poll.q,
      answers: poll.answers.filter(answer => answer.trim()),
      many: poll.many,
    });

    if (result.msg.n === chatUi.n) chatTake([result.msg], []);
    chatPollForm(false);
    chatDraw(true);
  } catch (error) {
    btn.disabled = false;
    note(btn, `Not asked: ${error.message}`, true);
  } finally {
    chatUi.sending = false;
  }
}

$('#rmform').addEventListener('input', event => {
  const poll = chatUi.poll;
  const field = event.target.dataset.pf;

  if (!poll) return;
  if (field === 'q') poll.q = event.target.value;
  else if (field === 'a') poll.answers[Number(event.target.dataset.i)] = event.target.value;
  else if (field === 'many') poll.many = event.target.checked;
});

$('#rmform').addEventListener('click', event => {
  const button = event.target.closest('button[data-pf]');
  const poll = chatUi.poll;

  if (!button || !poll) return;
  const action = button.dataset.pf;

  if (action === 'add' && poll.answers.length < 8) {
    poll.answers.push('');
    chatPollDraw();
    $(`#rmform [data-pf="a"][data-i="${poll.answers.length - 1}"]`).focus();
  } else if (action === 'drop') {
    poll.answers.splice(Number(button.dataset.i), 1);
    chatPollDraw();
    $('#rmform [data-pf="a"]').focus();
  } else if (action === 'lunch') chatPollForm(lunchPoll());
  else if (action === 'cancel') chatPollForm(false);
  else if (action === 'post') chatPollPost(button);
});

// ⏎ walks down the form, a new answer past the last; ⌘⏎ asks
$('#rmform').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || event.target.type === 'checkbox') return;
  event.preventDefault();

  const poll = chatUi.poll;
  const field = event.target.dataset.pf;
  const index = field === 'q' ? -1 : Number(event.target.dataset.i);

  if (event.metaKey || event.ctrlKey) return chatPollPost($('#rmform [data-pf="post"]'));
  if (field !== 'q' && field !== 'a') return;
  if (index + 1 < poll.answers.length) return $(`#rmform [data-pf="a"][data-i="${index + 1}"]`).focus();
  if (event.target.value.trim() && poll.answers.length < 8) {
    poll.answers.push('');
    chatPollDraw();
    $(`#rmform [data-pf="a"][data-i="${poll.answers.length - 1}"]`).focus();
  } else $('#rmform [data-pf="post"]').focus();
});

function chatDraw(toEnd = false) {
  const dlg = $('#room');

  if (!dlg.open) return;

  const chat = state.chat;
  const admin = chat.role === 'admin';
  const people = chatUi.view === 'people';
  const room = chat.room;

  $('#rmTitle').textContent = people ? 'People' : 'Chat';
  $('#rmPeople').hidden = !admin;
  $('#rmPeople').classList.toggle('on', people);
  $('#rmPeople').setAttribute('aria-pressed', String(people));
  $('#rmlog').hidden = people;
  $('#rmpeople').hidden = !people;
  $('#rmfoot').hidden = people || room == null;
  if (people) return chatPeopleDraw();

  const log = $('#rmlog');
  const atEnd = toEnd || log.scrollHeight - log.scrollTop - log.clientHeight < 48;

  setHtml(log, chatLogHtml());
  chatPicsFill(log);

  if (atEnd) {
    log.scrollTop = log.scrollHeight;
    chatUi.atEnd = true;
  }

  $('#rmediting').hidden = !chatUi.editing;
  $('#rmbox').placeholder = chatUi.editing ? 'Your message — ⏎ saves, esc cancels' : 'Message — ⏎ sends, ⇧⏎ a new line';
  const pics = chat.pics;

  $('#rmPicBtn').setAttribute('aria-disabled', String(!pics?.can));

  $('#rmPicBtn').title = pics?.can
    ? 'Pictures and GIFs — or paste one, or drop it here'
    : `No pictures from here: ${pics?.why || 'the chat is still being read'}`;

  setHtml(
    $('#rmsay'),
    chat.repo
      ? `<span>${esc(chat.me?.login ? `as ${chat.me.login}` : '')}</span><a href="https://github.com/${esc(chat.repo)}${room != null ? `/issues/${room}` : ''}" data-rm="gh" title="The chat on GitHub — its messages are this issue's comments">${esc(chat.repo)}</a>`
      : '',
  );
}

function chatGrow() {
  const box = $('#rmbox');

  box.style.height = 'auto';
  box.style.height = `${Math.min(140, box.scrollHeight + 2)}px`;
}

/** Your message, in the log as ⏎ is pressed (2026-10-27; the box waited on GitHub before): drawn on its way, then as
 *  GitHub's comment once the server has it. One that did not go stays where it was said, saying so — on this page
 *  alone, since nobody else has it. Sent one after another, in the order typed (the server writes them so anyway). */
function chatSend() {
  if (chatUi.editing) return chatEditSave();

  const box = $('#rmbox');
  const body = box.value;

  if ((!body.trim() && !chatUi.pics.length) || chatUi.n == null) return;
  box.value = '';
  chatGrow();

  const outgoing = {
    key: ++chatUi.outSeq,
    n: chatUi.n,
    body,
    pics: chatUi.pics.splice(0),
    at: new Date().toISOString(),
    err: null,
  };

  chatTrayDraw();
  chatUi.out.push(outgoing);
  chatDraw(true);
  chatPost(outgoing);
}

/** Sent once its pictures are up: the words, then each picture as markdown — as GitHub's own uploader writes one. */
function chatPost(outgoing) {
  chatUi.sendQ = chatUi.sendQ.then(async () => {
    try {
      await Promise.all(outgoing.pics.map(pic => pic.up));
      const bad = outgoing.pics.find(pic => pic.err);

      if (bad) throw new Error(`${bad.name}: ${bad.err}`);

      outgoing.final = outgoing.pics.length
        ? [outgoing.body.trim(), ...outgoing.pics.map(pic => `![${mdAlt(pic.name)}](${pic.url})`)]
            .filter(Boolean)
            .join('\n\n')
        : outgoing.body;

      const result = await api('POST', '/api/chat/send', { body: outgoing.final });

      chatUi.out = chatUi.out.filter(queued => queued !== outgoing);
      if (result.msg.n === chatUi.n) chatTake([result.msg], []);
    } catch (error) {
      outgoing.err = error.message;
    }

    chatDraw();
  });
}

/** A message that did not go: sent again, as the newest (a picture that did not go up, up again) — or its words back
 *  in the box, before what is typed there, and its pictures in the tray. */
function chatRetry(key, edit) {
  const outgoing = chatUi.out.find(queued => queued.key === key);

  if (!outgoing) return;
  chatUi.out = chatUi.out.filter(queued => queued !== outgoing);
  for (const pic of outgoing.pics) if (pic.err) chatPicUp(pic);

  if (edit) {
    const box = $('#rmbox');

    box.value = outgoing.body + (box.value.trim() ? `\n${box.value}` : '');
    chatUi.pics.unshift(...outgoing.pics);
    chatTrayDraw();
    chatGrow();
    chatDraw();
    box.focus();
    return;
  }

  Object.assign(outgoing, { at: new Date().toISOString(), err: null, final: null });
  chatUi.out.push(outgoing);
  chatDraw(true);
  chatPost(outgoing);
}

/** While the panel is up the server looks often (POST /api/chat/watch, every 15 s), else every 20 s. */
function chatWatch() {
  clearInterval(chatUi.watch);

  const ping = () => {
    if ($('#room').open && !document.hidden) api('POST', '/api/chat/watch', {}).catch(() => {});
  };

  ping();
  chatUi.watch = setInterval(ping, 15_000);
}

/** The chat, read to its newest message — only while it is truly in front of you. */
function chatSeenNow() {
  if (!$('#room').open || chatUi.view !== 'log' || chatUi.n == null || document.hidden || !document.hasFocus()) return;
  const top = chatUi.msgs.at(-1)?.id;

  if (!top || (!state.chat.unread && chatUi.seenSent >= top)) return;
  chatUi.seenSent = top;
  api('POST', '/api/chat/seen', { id: top }).catch(() => {});
}

// the people (the admin's): who is in, who is invited, whom to invite — the box narrows all three, and invites a login
// none of them has
async function chatPeopleLoad() {
  try {
    chatUi.people = await api('GET', '/api/chat/people');
    chatUi.peopleErr = null;
  } catch (error) {
    chatUi.peopleErr = error.message;
  }

  chatDraw();
}

function chatPeopleDraw() {
  const people = chatUi.people;
  const query = $('#rmfind').value.trim().replace(/^@/, '').toLowerCase();
  const chat = state.chat;

  if (!people) return setHtml($('#rmplist'), `<div class="rmnone">${esc(chatUi.peopleErr || 'Asking GitHub…')}</div>`);

  const hit = login => !query || login.toLowerCase().includes(query);
  const ago = ts => (ts ? `${rel(ts)} ago` : '');

  const row = (login, face, small, btns, sure = '') =>
    `<div class="rmp" data-login="${esc(login)}">${chatFace(face)}<span><b>${esc(login)}</b>${small ? `<small>${esc(small)}</small>` : ''}</span><span>${btns}</span>${sure}</div>`;

  const known = new Set(
    [
      chat.me?.login,
      ...people.members.map(member => member.login),
      ...people.invites.map(invite => invite.login),
      ...people.suggest.map(suggested => suggested.login),
    ]
      .filter(Boolean)
      .map(login => login.toLowerCase()),
  );

  const typed =
    query && /^[a-z0-9][a-z0-9-]{0,38}$/i.test(query) && !known.has(query)
      ? row(
          $('#rmfind').value.trim().replace(/^@/, ''),
          null,
          'a GitHub login',
          '<button type="button" class="btn" data-rm="invite">Invite</button>',
        )
      : '';

  const sug = people.suggest
    .filter(suggested => hit(suggested.login))
    .map(suggested =>
      row(
        suggested.login,
        suggested.face,
        `${suggested.prs} PR${suggested.prs === 1 ? '' : 's'} in your chats`,
        '<button type="button" class="btn" data-rm="invite">Invite</button>',
      ),
    )
    .join('');

  const inv = people.invites
    .filter(invite => hit(invite.login))
    .map(invite =>
      row(
        invite.login,
        invite.face,
        invite.expired ? 'expired' : `invited ${ago(invite.at)}`,
        `${invite.expired ? '<button type="button" class="btn" data-rm="invite">Again</button>' : ''}<button type="button" class="btn" data-rm="cancel" data-id="${invite.id}">Cancel</button>`,
      ),
    )
    .join('');

  const mem = people.members
    .filter(member => hit(member.login))
    .map(member =>
      row(
        member.login,
        member.face,
        member.role || '',
        '<button type="button" class="btn danger" data-rm="sureRemove">Remove…</button>',
        chatUi.sure === `remove:${member.login}`
          ? `<div class="rmsure" role="group"><span>Remove ${esc(member.login)}? They lose the chat and its history.</span><button type="button" class="btn" data-rm="unsure">Cancel</button><button type="button" class="btn danger" data-rm="remove">Remove</button></div>`
          : '',
      ),
    )
    .join('');

  const you = chat.me ? row(chat.me.login, chat.me.face, 'you · its admin', '') : '';

  setHtml(
    $('#rmplist'),
    `${
      (typed ? `<h6>Invite</h6>${typed}` : '') +
      (sug ? `<h6>From your chats’ PRs</h6>${sug}` : '') +
      (inv ? `<h6>Invited</h6>${inv}` : '')
    }<h6>In the chat</h6>${you}${mem || (query ? '' : '<div class="rmnone">Nobody else yet — invite someone above.</div>')}` +
      `<p class="rmnone" style="padding: 12px 0 0">An invitation is GitHub’s: they join from Settings › Chat on their board, or from GitHub’s email.</p>`,
  );
}

async function chatAct(what, body, anchor, done) {
  try {
    const result = await api('POST', `/api/chat/${what}`, body);

    done?.(result);
  } catch (error) {
    note(anchor, error.message, true);
  }
}

$('#room').addEventListener('click', event => {
  if (!$('#rmrxp').hidden && !event.target.closest('#rmrxp, [data-rm="rxpick"]')) chatRxClose();
  if (!$('#rmemo').hidden && !event.target.closest('#rmemo, #rmEmoBtn')) chatEmoOpen(false);
  if (event.target.closest('#rmClose')) return $('#room').close();
  if (event.target.closest('#rmEmoBtn')) return chatEmoOpen();
  const eb = event.target.closest('#rmemog .rmeb');

  if (eb) return chatEmoPick(eb.dataset.emo);
  if (event.target.closest('#rmPollBtn')) return chatPollForm(chatUi.poll ? false : {});

  if (event.target.closest('#rmPeople')) {
    chatUi.view = chatUi.view === 'people' ? 'log' : 'people';
    chatUi.sure = null;

    if (chatUi.view === 'people') {
      chatPeopleLoad();
      $('#rmfind').focus();
    }

    chatDraw(true);
    return;
  }

  const more = event.target.closest('#rmMore');

  if (more) {
    const chat = state.chat;
    const rect = more.getBoundingClientRect();

    return ctxShow(
      [
        ...(chat.room != null
          ? [
              {
                t: 'The chat on GitHub',
                fn: () => openExternal(`https://github.com/${chat.repo}/issues/${chat.room}`, { s: null }),
              },
              { hr: true },
            ]
          : []),
        { t: 'Chat settings…', fn: () => settingsAt('chat', '#chatSet') },
        {
          t: chat.role === 'admin' ? 'Stop the chat on this board…' : 'Leave the chat…',
          warn: true,
          fn: () => {
            chatUi.view = 'log';
            chatUi.sure = 'leave';
            chatDraw();
          },
        },
      ],
      rect.left,
      rect.bottom + 4,
      'chat',
    );
  }

  const pic = event.target.closest('#rmlog .rmpic.on');

  if (pic) return pic.classList.contains('bad') ? openExternal(pic.dataset.pic, { s: null }) : chatView(pic);

  if (event.target.closest('#rmPicBtn')) {
    return state.chat.pics?.can
      ? $('#rmFile').click()
      : note($('#rmPicBtn'), `No pictures from here: ${state.chat.pics?.why || 'the chat is still being read'}`, true);
  }

  const link = event.target.closest('#rmlog a[href], #rmsay a[href]');

  if (link) {
    event.preventDefault();
    openExternal(link.href, { s: null });
    return;
  } // the system's browser: never a chat's pane

  const act = event.target.closest('[data-rm]')?.dataset.rm;
  const control = event.target.closest('[data-rm]');

  if (!act) return;

  const login = control.closest('.rmp')?.dataset.login;
  const id = Number(control.closest('.rmmsg')?.dataset.id);

  if (act === 'unsure') {
    chatUi.sure = null;
    chatDraw();
  } else if (act === 'vote') chatVote(id, control.dataset.r);
  else if (act === 'react') chatReact(id, control.dataset.r);
  else if (act === 'rxpick') {
    if (chatUi.rxFor === id && !$('#rmrxp').hidden) chatRxClose();
    else chatRxOpen(id, control);
  } else if (act === 'editmsg') chatEditStart(id);
  else if (act === 'unedit') chatEditEnd(true);
  else if (act === 'retry' || act === 'edit') chatRetry(Number(control.closest('.rmmsg')?.dataset.out), act === 'edit');
  else if (act === 'unpic') {
    const key = Number(control.closest('.rmtp')?.dataset.k);

    chatUi.pics = chatUi.pics.filter(added => added.key !== key);
    chatTrayDraw();
    $('#rmbox').focus();
  } else if (act === 'del') {
    control.closest('.rmmsg').classList.add('going');

    chatAct('delete', { id }, control, () => {
      chatTake([], [id]);
      chatDraw();
    });
  } else if (act === 'leave') {
    chatAct('leave', {}, control, latest => {
      state.chat = latest;
      $('#room').close();
      chatChanged();
    });
  } else if (act === 'invite') {
    chatAct('invite', { login }, control, people => {
      chatUi.people = people;
      $('#rmfind').value = '';
      chatDraw();

      note(
        $('#rmfind'),
        people.invited
          ? `Invited ${people.login} — they join from their board, or GitHub's email`
          : `${people.login} is in already`,
      );
    });
  } else if (act === 'cancel') {
    chatAct('cancel', { id: Number(control.dataset.id) }, control, people => {
      chatUi.people = people;
      chatDraw();
    });
  } else if (act === 'sureRemove') {
    chatUi.sure = `remove:${login}`;
    chatDraw();
  } else if (act === 'remove') {
    chatAct('remove', { login }, control, people => {
      chatUi.people = people;
      chatUi.sure = null;
      chatDraw();
    });
  }
});

$('#rmbox').addEventListener('keydown', event => {
  if (event.isComposing) return;
  const suggestions = chatUi.sug;

  if (suggestions && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();

    suggestions.sel =
      (suggestions.sel + (event.key === 'ArrowDown' ? 1 : suggestions.list.length - 1)) % suggestions.list.length;

    return chatSugDraw();
  }

  if (suggestions && (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))) {
    event.preventDefault();
    return chatSugPick();
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatSend();
  } else if (
    event.key === 'ArrowUp' &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.altKey &&
    !$('#rmbox').value &&
    !chatUi.editing
  ) {
    // your last message, back in the box to edit (never a poll)
    const me = state.chat.me?.login;
    const last = chatUi.msgs.findLast(message => message.who === me && !message.poll);

    if (last) {
      event.preventDefault();
      chatEditStart(last.id);
    }
  }
});

$('#rmbox').addEventListener('input', () => {
  chatGrow();
  chatSugUpdate();
});

$('#rmbox').addEventListener('blur', () =>
  setTimeout(() => document.activeElement !== $('#rmbox') && chatSugClose(), 150),
);

// a picture pasted (a screenshot's ⌃⇧⌘4, an image copied): to the tray — what has words to paste pastes them instead
$('#rmbox').addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])].filter(file => PIC_TYPES.test(file.type));

  if (!files.length || event.clipboardData.types.includes('text/plain')) return;
  event.preventDefault();
  chatPicsAdd(files);
});

$('#rmFile').addEventListener('change', event => {
  const files = [...event.target.files];

  event.target.value = '';
  chatPicsAdd(files);
});

// a file dropped on the panel is the chat's, not the drawer's (attach.js's drop, on the document, never hears it)
const roomFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');

$('#room').addEventListener('dragover', event => {
  if (!roomFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'copy';
  $('#room').classList.add('dropping');
});

$('#room').addEventListener('dragleave', event => {
  if (!$('#room').contains(event.relatedTarget)) $('#room').classList.remove('dropping');
});

$('#room').addEventListener('drop', event => {
  if (!roomFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  $('#room').classList.remove('dropping');
  chatPicsAdd([...event.dataTransfer.files]);
});

/** The app's Finder drop (peixDrop: paths, WebKit never sees the drag): the chat's when its panel has the keys and every
 *  file is a picture — uploaded by its path —, else false, and it goes to the drawer as ever. */
function chatTakesDrop(paths) {
  if (
    !$('#room').open ||
    !$('#room').contains(document.activeElement) ||
    chatUi.view !== 'log' ||
    !paths.length ||
    !paths.every(path => /\.(png|jpe?g|gif|webp)$/i.test(String(path)))
  ) {
    return false;
  }

  return chatPicsAdd(paths.map(path => ({ path })));
}

$('#rmlog').addEventListener(
  'scroll',
  () => {
    const log = $('#rmlog');

    chatUi.atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  },
  { passive: true },
);

$('#rmfind').addEventListener('input', () => chatPeopleDraw());

$('#rmfind').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#rmplist').querySelector('[data-rm="invite"]')?.click();
  }
});

/** Esc in the panel lets go of one thing at a time — a question, the people — before the panel. */
function chatEscape() {
  if ($('#rmview').open) {
    $('#rmview').close();
    return true;
  }

  if (chatRxClose() || chatSugClose()) return true;

  if (!$('#rmemo').hidden) {
    chatEmoOpen(false);
    $('#rmbox').focus();
    return true;
  }

  if (chatEditEnd(true)) return true;

  if (chatUi.sure) {
    chatUi.sure = null;
    chatDraw();
    return true;
  }

  if (chatUi.poll && chatUi.view === 'log') {
    chatPollForm(false);
    return true;
  }

  if (chatUi.view === 'people') {
    chatUi.view = 'log';
    chatDraw(true);
    $('#rmbox').focus();
    return true;
  }

  return false;
}

$('#room').addEventListener('close', () => {
  chatRxClose();
  chatSugClose();
  chatEmoOpen(false);
  clearInterval(chatUi.watch);
  chatUi.watch = 0;
  chatUi.sure = null;
  renderBar();
});

for (const ev of ['focus', 'visibilitychange']) window.addEventListener(ev, chatSeenNow);

/** What the server knows changed: the bar, the panel, Settings' pane. */
function chatChanged() {
  if (state.chat.repo !== chatUi.repo) {
    Object.assign(chatUi, {
      repo: state.chat.repo,
      n: null,
      msgs: [],
      gone: new Set(),
      people: null,
      view: 'log',
      sure: null,
      poll: null,
      out: [],
      pics: [],
      editing: null,
    });

    chatPollDraw();
  } // another repo: nothing of the last one's

  renderBar();
  renderChatSet();
  if (state.chat.missing && !chatUi.places && $('#settings').open) chatPlacesLoad();
  if (!$('#room').open) return;
  if (!state.chat.on || state.chat.missing) return $('#room').close();
  if (state.chat.ready && state.chat.room !== chatUi.n) chatLoad();
  chatDraw();
  chatSeenNow();
}

function chatMsgs(change) {
  if (change.n !== chatUi.n) return;

  // a new one of yours takes the place of the first on its way with its words (chatSend): the stream can bring it
  // before the send's own answer
  const me = state.chat.me?.login;
  const held = new Set(chatUi.msgs.map(message => message.id));

  for (const message of change.add || []) {
    const outgoing =
      !held.has(message.id) &&
      message.who === me &&
      chatUi.out.find(
        queued =>
          !queued.err &&
          queued.n === message.n &&
          (queued.final ?? queued.body).replace(/\r\n?/g, '\n').trim() === String(message.body ?? '').trim(),
      );

    if (outgoing) chatUi.out = chatUi.out.filter(queued => queued !== outgoing);
  }

  chatTake(change.add || [], change.gone || []);

  if (chatUi.editing && (change.gone || []).includes(chatUi.editing.id)) {
    chatEditEnd(true);
    note($('#rmbox'), 'The message you were editing was deleted', true);
  }

  chatDraw();
  chatSeenNow();
}

/** A message from someone else, while the room is not in front of you: a chime in front, else the app's banner or the
 *  browser's — never with a Reply… (no session), and a click opens the room. */
function chatAlert(alert) {
  if ($('#room').open && chatUi.view === 'log' && document.visibilityState === 'visible' && document.hasFocus()) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) chime('reply');

  if (inApp) {
    post({
      type: 'alert',
      kind: 'chat',
      heading: alert.heading || 'Chat',
      project: '',
      title: alert.title || '',
      snippet: alert.snippet || '',
      sessionId: '',
      hash: '',
      serverNotify: !!state.serverNotify,
      quiet: !!alert.quiet,
      drawer: false,
    });
  }

  if (alert.quiet || !('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(alert.heading || 'Chat', {
    body: `${alert.title}\n${alert.snippet || ''}`,
    tag: 'chat',
  });

  notification.onclick = () => {
    window.focus();
    chatOpen();
    notification.close();
  };
}

// Settings › Chat: off — the invitations waiting, the chats you can read already, a new one (its box filled with the
// newest organization you own, 2026-10-18), a repo by name; the same under a setup's repo GitHub does not show you
// (`missing`), with Forget it; on — the repo, who you are in it, the people (the admin's), and leaving. What is typed
// is chatUi's, so a redraw keeps it.
function chatSetHtml() {
  const chat = state.chat;
  const text = 'type="text" spellcheck="false" autocomplete="off"';

  const group = (title, kw, rows, foot) =>
    `<section class="sgrp" data-kw="${kw}">${title ? `<h6 class="sgh">${title}</h6>` : ''}<div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;

  const row = (label, small, ctl) =>
    `<div class="srow set"><span class="sl"><b>${label}</b><small>${small}</small></span>${ctl}</div>`;

  const invites = (chat.invites || [])
    .map(invite =>
      row(
        `${chatFace(invite.face)} ${esc(invite.by || 'Someone')} invited you`,
        `to the chat in ${esc(invite.repo)}${invite.expired ? ' — expired: ask for another' : ''}`,
        `<button type="button" class="btn" data-chat="join" data-id="${invite.id}"${invite.expired ? ' disabled' : ''}>Join</button>`,
      ),
    )
    .join('');

  if (!chat.on || chat.missing) {
    const places = chatUi.places;
    const owner = places ? places.orgs[0]?.login || places.me.login : null;
    const others = places ? places.orgs.slice(1).map(org => org.login) : [];

    let name = 'chat';

    for (
      let number = 2;
      places?.chats.some(existing => existing.repo.toLowerCase() === `${owner}/${name}`.toLowerCase());
      number++
    ) {
      name = `chat-${number}`;
    }

    const where = chatUi.placesErr
      ? `<span class="serr">${esc(chatUi.placesErr)}</span>`
      : !places
        ? 'A private repo, in an organization you own or your account'
        : places.orgs.length
          ? `A private repo in ${esc(owner)}, ${others.length ? `the newest organization you own (or ${esc(others.join(', '))})` : 'the organization you own'} — then invite people from the chat`
          : 'A private repo in your account — in an organization of yours, people could join with Read alone';

    const found = (places?.chats || [])
      .map(existing =>
        row(
          esc(existing.repo),
          existing.admin ? 'A chat you made — you are its admin' : 'A chat you are in',
          `<button type="button" class="btn" data-chat="use" data-repo="${esc(existing.repo)}">Use</button>`,
        ),
      )
      .join('');

    const gone = chat.missing
      ? group(
          '',
          'chat repo github',
          row(
            esc(chat.repo),
            `<span class="serr">${esc(chat.error || 'not a repo you can read')}</span>`,
            '<button type="button" class="btn" data-chat="leave">Forget it</button>',
          ),
        )
      : '';

    return (
      gone +
      (invites ? group('Invitations', 'chat invitation join invite', invites) : '') +
      (found ? group('Your chats', 'chat repo github use', found) : '') +
      group(
        invites || found || gone ? 'Or' : '',
        'chat repo github room make new join use',
        row(
          'A new chat',
          where,
          `<span class="schat"><input ${text} class="schatnew" value="${esc(chatUi.newRepo ?? (owner ? `${owner}/${name}` : ''))}" placeholder="your-org/chat" aria-label="The new chat's repo"><button type="button" class="btn" data-chat="make">Make it</button></span>`,
        ) +
          row(
            found ? 'Another chat you are in' : 'A chat you are in',
            'Its repo, owner/name — one GitHub lets you read',
            `<span class="schat"><input ${text} class="schatrepo" value="${esc(chatUi.useRepo ?? '')}" placeholder="acme-chat/room" aria-label="The chat's repo"><button type="button" class="btn" data-chat="use">Use</button></span>`,
          ),
        `${chat.missing ? 'Off until the repo can be read.' : 'Off until a repo is set.'} A private GitHub repo is the chat: its issues labelled <code>room</code> the rooms, their comments the messages — read with your <code>gh</code> login. Only its admin invites and removes people.`,
      )
    );
  }

  const admin = chat.role === 'admin';
  const member = !!chat.role && !admin;

  const state_ = chat.error
    ? `<span class="serr">${esc(chat.error)}</span>`
    : !chat.ready
      ? 'Reading it…'
      : `${admin ? 'You are its admin' : 'You are a member'}${chat.me ? ` · as ${esc(chat.me.login)}` : ''}${chat.room == null ? ' · no chat in it yet' : ''}`;

  return group(
    '',
    'chat repo github room people invite leave pictures images gifs',
    `${
      row(esc(chat.repo), state_, '<button type="button" class="btn" data-chat="open">Open</button>') +
      (admin
        ? row(
            'People',
            'Invite, cancel an invitation, remove — only you can',
            '<button type="button" class="btn" data-chat="people">Manage…</button>',
          )
        : '')
    }<div class="srow set"><span class="sl"><b>${!member ? 'Stop the chat here' : 'Leave the chat'}</b><small>${!member ? 'The repo and its rooms stay on GitHub' : 'You leave the repo'}</small></span><button type="button" class="btn danger" data-chat="sure" aria-expanded="${chatUi.setSure}" aria-controls="chatSure">${!member ? 'Stop…' : 'Leave…'}</button>` +
      `<div class="ssure" id="chatSure" role="group" aria-labelledby="chatSureSay"${chatUi.setSure ? '' : ' hidden'}><span id="chatSureSay">${!member ? 'The chat goes from this board; the repo, its rooms and its people stay on GitHub.' : 'You leave the repo and its history; coming back takes a new invitation.'}</span><button type="button" class="btn" data-chat="unsure">Cancel</button><button type="button" class="btn danger" data-chat="leave">${!member ? 'Stop the chat' : 'Leave the chat'}</button></div></div>`,
    `Messages are the repo’s issue comments, on GitHub; GitHub’s own emails about it are turned off for you. Pictures are GitHub’s attachments: a member who only reads the chat puts theirs against <code>${esc(chat.repo)}-files</code>, which its admin’s board makes and keeps shared with everyone in it.`,
  );
}

function renderChatSet(force = false) {
  drawSetup($('#chatSet'), chatSetHtml(), force);
}

/** Settings › Chat in front: the invitations asked now, not in ten minutes — and with no chat, where one could be. */
function loadChatSet() {
  api('GET', '/api/chat?invites=1').then(
    latest => {
      state.chat = latest;
      chatChanged();
      if (!latest.on || latest.missing) chatPlacesLoad();
    },
    () => {},
  );
}

function chatPlacesLoad() {
  if (chatUi.placesAsk) return;
  chatUi.placesAsk = true;

  api('GET', '/api/chat/places')
    .then(
      places => {
        chatUi.places = places;
        chatUi.placesErr = null;
      },
      error => {
        chatUi.placesErr = error.message;
      },
    )
    .finally(() => {
      chatUi.placesAsk = false;
      renderChatSet();
    });
}

$('#chatSet').addEventListener('input', event => {
  if (event.target.matches('.schatnew')) chatUi.newRepo = event.target.value;
  else if (event.target.matches('.schatrepo')) chatUi.useRepo = event.target.value;
});

$('#chatSet').addEventListener('focusout', event => {
  if ($('#chatSet')._stale && !$('#chatSet').contains(event.relatedTarget)) renderChatSet();
});

$('#chatSet').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('.schatrepo, .schatnew')) {
    event.preventDefault();
    event.target.nextElementSibling.click();
  }
});

$('#chatSet').addEventListener('click', event => {
  const button = event.target.closest('[data-chat]');

  if (!button) return;

  const set = latest => {
    state.chat = latest;
    chatChanged();
  };

  const act = button.dataset.chat;
  const box = button.previousElementSibling;

  if (act === 'open') {
    settingsOpen(false);
    chatOpen();
  } else if (act === 'people') {
    settingsOpen(false);
    chatOpen('people');
  } else if (act === 'join') {
    button.disabled = true;

    api('POST', '/api/chat/join', { id: Number(button.dataset.id) }).then(
      latest => {
        set(latest);
        note($('#chatSet'), 'Joined — the chat is in the status bar');
      },
      err => {
        button.disabled = false;
        note(button, err.message, true);
      },
    );
  } else if (act === 'use') {
    const repo = button.dataset.repo || box.value.trim();

    if (repo) {
      api('POST', '/api/chat/use', { repo }).then(
        latest => {
          chatUi.useRepo = null;
          set(latest);
        },
        err => note(button.dataset.repo ? button : box, err.message, true),
      );
    }
  } else if (act === 'make') {
    const repo = box.value.trim();

    if (!repo) return;
    button.disabled = true;
    button.textContent = 'Making it…';

    api('POST', '/api/chat/make', { repo }).then(
      latest => {
        chatUi.newRepo = chatUi.places = null;
        set(latest);
        note($('#chatSet'), `Made ${latest.repo} — invite people from the chat`);
      },
      err => {
        button.disabled = false;
        button.textContent = 'Make it';
        note(button, err.message, true);
      },
    );
  } else if (act === 'sure' || act === 'unsure') {
    chatUi.setSure = act === 'sure';
    renderChatSet(true);

    $('#chatSet')
      .querySelector(act === 'sure' ? '#chatSure .btn' : '[data-chat="sure"]')
      ?.focus();
  } else if (act === 'leave') {
    api('POST', '/api/chat/leave', {}).then(
      latest => {
        chatUi.setSure = false;
        chatUi.places = null;
        set(latest);
        chatPlacesLoad();
      },
      err => note(button, err.message, true),
    );
  }
});
