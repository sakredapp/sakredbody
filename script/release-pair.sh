#!/usr/bin/env bash
#
# One web build, into both shells, verified.
#
# The manual sequence this replaces protected iOS 34 / Android 61 and would
# not have protected the next one: it lived in a chat message. Everything it
# did is here, in the order that makes the ordering irrelevant — the client is
# built once, both shells are synced from that one build, and the payload in
# each is compared to dist by content hash before either artifact is cut.
#
#   script/release-pair.sh            # build, sync, verify — then cut by hand
#   script/release-pair.sh --android  # …and assemble the signed APK and AAB
#
# iOS is deliberately not archived from here. `xcodebuild` prompts for signing
# and takes minutes, and a script that sometimes blocks on a keychain dialog
# is a script people stop running. Archive from Xcode or by hand once this has
# said the shells agree.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "› building the web client, once"
npm run build >/dev/null

echo "› syncing both shells from that build"
npx cap sync >/dev/null

# `cap sync` rewrites the generated plugin paths, and through a symlinked
# node_modules it writes paths that walk out of the checkout. See the note in
# script/normalise-native-paths.mjs.
echo "› normalising generated native paths"
node script/normalise-native-paths.mjs >/dev/null
node script/normalise-native-paths.mjs --check

echo "› checking both shells carry the same web application"
node script/native-parity.mjs

if [ "${1:-}" = "--android" ]; then
  echo
  SAKRED_SKIP_CLIENT_BUILD=1 bash script/build-aab.sh
else
  echo
  echo "  Both shells hold the build in dist/. Archive iOS from here, and run"
  echo "  SAKRED_SKIP_CLIENT_BUILD=1 script/build-aab.sh for Android."
fi
