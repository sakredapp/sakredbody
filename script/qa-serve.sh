#!/bin/sh
# The QA server every browser harness in script/ points at.
#
# It serves dist/, not source — which is the trap this exists to remove. A
# server left running from an older build answers every request happily, and
# the harness measures a product that does not match the working tree: an
# afternoon was spent tracing a walkthrough defect that had already been fixed,
# because the bundle on :5199 predated the fix. `assertFreshBuild` in cdp.ts
# now refuses that case; this is how you get out of it.
#
#   npm run build && script/qa-serve.sh
#
# The connection string is read from .env.qa and never printed. The session
# secret is generated per run, so a restart signs everybody out — correct for a
# throwaway server, and one less long-lived secret on disk.
set -e
cd "$(dirname "$0")/.."

[ -f .env.qa ] || { echo "no .env.qa — see script/qa-target.ts for what it must contain" >&2; exit 1; }
[ -f dist/index.cjs ] || { echo "no dist/ — run npm run build first" >&2; exit 1; }

URL=$(sed -n 's/^SAKREDBODY_QA_DATABASE_URL=//p' .env.qa)
[ -n "$URL" ] || { echo "SAKREDBODY_QA_DATABASE_URL is not set in .env.qa" >&2; exit 1; }

PORT=${PORT:-5199}
if command -v lsof >/dev/null 2>&1; then
  OLD=$(lsof -ti "tcp:$PORT" || true)
  [ -n "$OLD" ] && kill $OLD && sleep 1
fi

# DATABASE_URL, not the QA variable: the application deliberately never reads
# that one, so that no half-configured process can find a QA target by
# accident. Pointing this server at QA is a decision made here, out loud.
DATABASE_URL="$URL" \
SAKRED_QA=1 \
SESSION_SECRET="$(openssl rand -hex 32)" \
PORT="$PORT" \
  nohup node dist/index.cjs > "${TMPDIR:-/tmp}/sakred-qa-$PORT.log" 2>&1 &

for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/login"; then
    echo "QA server on http://127.0.0.1:$PORT — build $(date -r dist/public/index.html '+%H:%M:%S')"
    exit 0
  fi
done
echo "server did not come up; see ${TMPDIR:-/tmp}/sakred-qa-$PORT.log" >&2
exit 1
