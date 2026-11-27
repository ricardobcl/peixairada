---
name: release
description: Cut a release of peixAIrada — draft its notes from the commits and docs/DECISIONS.md since the last release, have Ricardo edit them, then commit, tag, push and publish it on GitHub. Use when asked to release, cut or ship a release, or to write release notes for the board.
---

# Cutting a release

A release (decided 2026-11-27, docs/DECISIONS.md) is the signed commit that sets `package.json`'s version to the next
minor (0.2, 0.3…) and puts its notes at the top of `CHANGELOG.md`, tagged `v0.N.0` and published on GitHub from the same
notes. Every board on *Releases* (Settings › Updates › Follow, the default) takes the newest release and shows its notes:
in Settings before it updates, in What's new after. The notes are for the people who use the board, not for the code.

## 1. Gather

In the main checkout, on `main`, with nothing staged:

```sh
node scripts/release.mjs                 # since the last release
node scripts/release.mjs --since <date>  # a narrower start, e.g. the first release
```

It prints the last release and the next version, the `DECISIONS.md` entries since, and every commit since with the part
it touches (`page`, `server`, `app`, `deps`, or `notes` for docs, tests and the harness). Read the decision entries that
matter: they say what each feature is and how it ended up. Use the commit list to catch what has no entry.

## 2. Draft

Write the notes as markdown in the scratchpad, sections in this order, only those with something in them:

```markdown
### New

- **Space** (⌥⌘X) shows every chat as a node with its agents around it. …

### Changed

### Security

### Fixed
```

- **One line per feature**, however many commits built it. Bold its name the first time. A feature reworked several
  times in the range is described as it stands at the end, never as a history.
- **What a person can now do, and where**: the key, the Settings pane, the menu. Plain sentences, present tense.
- **Leave out the work behind the board**: refactors, the harness, lint and format, tests, docs, notes. Leave out file,
  function and route names, commit hashes, and the board's internal words for things (`prefs.*`, lanes' code names).
- **Fixes people would notice** by name; the rest as "and about N smaller fixes".
- **Security**: say what was fixed in a word and whether the user has to do anything. Never how it could be exploited.
- **No names of people, the org or its repos** (CLAUDE.md's rule): "a colleague", `acme` stand-ins. No thanks.
- **A setting that changes what people see by default** goes first under Changed, saying how to get the old way back.

## 3. Edit with Ricardo

Show him the whole draft in the chat and ask for changes. Apply them and show it again. **Do not cut until he says it
is good**: pushing a release is what every other board will take.

## 4. Cut and publish

```sh
node scripts/release.mjs cut <notes.md>   # CHANGELOG.md, package.json and the lock's version; one signed commit
                                          # "Release 0.N"; a signed tag v0.N.0
node scripts/release.mjs publish          # pushes main and the tag to origin, then gh release create from the notes
```

`cut` refuses a staged change or a change to the three files it writes; the release commit holds the release alone.
`publish` refuses a release commit no key in `.github/allowed_signers` signed (no board would take it), and pushes
`main` as it is: every commit on it until the release goes out with it. Say what was published and link the GitHub
release (`gh release view v0.N.0 --web` opens it; its URL is in `gh release view v0.N.0 --json url`).
