#!/usr/bin/env bash
# Was this value a deliberate override, or drift?
#
# The design library landed AFTER most of the build, so a difference between a
# component and its .dc.html is one of two very different things:
#
#   drift     — the value was set from a round-1 comp or a prose transcription
#               and never revisited. Align it.
#   override  — we changed it on purpose, and the commit message says why.
#               Leave it, and record the reason.
#
# Guessing between them is how a design pass silently undoes a considered
# decision. This prints the commits that introduced a value so the question is
# answered from history rather than from memory.
#
#   design/check-override.sh 'maxWidth: 420' web/components/LocationStatusText.tsx
#
# Reads the introducing commit's SUBJECT: if it names the design, a round, or a
# ruling, treat it as an override and go read the whole message.
set -euo pipefail

value=${1:?usage: check-override.sh <string> <path>}
path=${2:?usage: check-override.sh <string> <path>}

cd "$(dirname "$0")/.."

echo "── $value"
# --all, because a value may have been introduced on a branch that was later
# merged; --follow is deliberately absent since -S already survives renames
# poorly and the pre-restructure path is checked separately below.
found=$(git log --format='  %h %ad %s' --date=short -S "$value" -- "$path" || true)
legacy=$(git log --format='  %h %ad %s' --date=short -S "$value" -- "${path#web/}" 2>/dev/null || true)

if [ -z "$found$legacy" ]; then
  echo "  (never introduced by any commit — check the string is exact)"
else
  printf '%s\n' "$found" "$legacy" | grep -v '^$' | sort -u -k2
fi
