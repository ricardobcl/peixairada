// disclaim <program> [args…] — run the program in this very process (the same pid), answering to macOS for itself.
//
// macOS asks the *responsible* process for the microphone, the camera, Automation: the one a process was started
// under, inherited by every child unless a spawn disclaims it. A drawer's claude was the board's server's — node under
// launchd, a hardened binary with no audio-input entitlement — so /voice was refused without anyone being asked
// (2026-11-23). Claude Code carries the entitlement and the usage string itself: run through this, it is its own
// responsible process, and macOS asks for "claude". The server builds this file with cc into its state folder.
//
// posix_spawn's SETEXEC is an exec, so the pid, the terminal and every descriptor stay; the disclaim is
// responsibility_spawnattrs_setdisclaim, the call Chromium and Qt Creator make (libsystem's, in none of the SDK's
// headers). Where it is missing or refused, the program is exec'd as it would have been.
#include <errno.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

extern char **environ;
int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attrs, int disclaim) __attribute__((weak_import));

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: disclaim <program> [args...]\n"); return 64; }
  posix_spawnattr_t attr;
  if (posix_spawnattr_init(&attr) == 0 && posix_spawnattr_setflags(&attr, POSIX_SPAWN_SETEXEC) == 0 &&
      responsibility_spawnattrs_setdisclaim && responsibility_spawnattrs_setdisclaim(&attr, 1) == 0)
    posix_spawnp(NULL, argv[1], NULL, &attr, argv + 1, environ);   // returns only when it failed
  execvp(argv[1], argv + 1);
  fprintf(stderr, "disclaim: %s: %s\n", argv[1], strerror(errno));
  return errno == ENOENT ? 127 : 126;
}
