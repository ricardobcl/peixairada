# peixAIrada from a terminal (2026-11-27), in the checkout:
#   make install   the packages, the server as a login agent, the Mac app: the README's install in one
#   make server    the packages and the login agent alone (any browser is the board: scripts/launchd.sh open)
#   make app       the Mac app alone, built and put in /Applications
#   make update    the board's Update now: signed commits fast-forwarded, only what they changed started again
.PHONY: help install server app update
help:
	@sed -n '2,5p' Makefile | cut -c3-
install: server app
server:
	npm ci
	scripts/launchd.sh install
app:
	mac/build.sh install
update:
	@node scripts/update.mjs
