#!/bin/sh
# Forward a Claude Code hook payload (JSON on stdin) to peixAIrada without ever blocking Claude.
# Register it for Stop / Notification / UserPromptSubmit / SessionEnd in ~/.claude/settings.json —
# see README.md. Failing or absent server = silently ignored.
payload=$(cat)
(curl -s -m 1 -X POST -H 'content-type: application/json' \
  --data-binary "$payload" "http://127.0.0.1:${PEIXAIRADA_PORT:-7331}/hook" >/dev/null 2>&1 &)
exit 0
