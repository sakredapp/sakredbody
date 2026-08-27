#!/usr/bin/env bash
#
# Build a signed Android App Bundle and drop it in ~/Downloads.
#
# Gradle buries the output at
# android/app/build/outputs/bundle/release/app-release.aab, which is both hard
# to find and identically named every time — so two builds a week apart are
# indistinguishable in the Play Console upload dialog. This copies it out under
# a name carrying the version and build number.
#
# Usage: npm run android:aab
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# Gradle needs a JDK on JAVA_HOME. Respect an existing one; otherwise fall back
# to the Homebrew JDK, which is what this machine has. Fail loudly rather than
# letting Gradle emit its own less obvious error.
if [ -z "${JAVA_HOME:-}" ]; then
  BREW_JDK="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  if [ -d "$BREW_JDK" ]; then
    export JAVA_HOME="$BREW_JDK"
  else
    echo "No JDK found. Install one with: brew install openjdk@21" >&2
    exit 1
  fi
fi

if [ ! -f android/keystore.properties ]; then
  echo "android/keystore.properties is missing — the bundle would be unsigned." >&2
  echo "It is gitignored by design; restore it from 1Password." >&2
  exit 1
fi

# Rebuilding the client here is what broke the iOS/Android pair.
#
# Cut iOS first and its archive consumes one build; then this script makes
# another and Android ships that. Two web applications from one SHA — it
# happened on the first archive of build 34, whose bundle carried four asset
# names that were nowhere in dist.
#
# The client is reproducible now, so a rebuild would produce the same bytes,
# and the parity check below proves it rather than assuming it. Set
# SAKRED_SKIP_CLIENT_BUILD=1 when the pair is being cut from one build that
# has already been made — script/release-pair.sh does.
if [ "${SAKRED_SKIP_CLIENT_BUILD:-0}" = "1" ]; then
  echo "› using the client build already in dist/"
  [ -d dist/public ] || { echo "  …except there isn't one. Run npm run build first." >&2; exit 1; }
else
  echo "› building web client"
  npm run build:client >/dev/null
fi

echo "› syncing native project"
npx cap sync android >/dev/null

# `cap sync` regenerates the plugin paths, and when node_modules is reached
# through a symlink — a second worktree, a workspace, a hoisted install — it
# resolves the real location and writes a path that walks out of the checkout
# to get there. It builds here and nowhere else. Android 52 was assembled from
# exactly that and left the rewrite in `git status` afterwards.
#
# Normalise the path portion only, never the whole file: a plugin added or
# removed since the last commit is a legitimate change sync just made, and
# reverting it would silently ship a build missing a plugin.
echo "› normalising generated native paths"
node script/normalise-native-paths.mjs

# And refuse to go further if anything still escapes. A release artifact that
# depends on this machine's neighbouring directory must not be uploadable.
node script/normalise-native-paths.mjs --check

# And refuse to build a shell whose web payload is not the one in dist. This
# is the check that makes "one commit, one application" a property of the
# release rather than a habit of whoever cut it.
echo "› checking the web payload against dist"
node script/native-parity.mjs

echo "› assembling signed bundle"
(cd android && ./gradlew bundleRelease --no-daemon -q)

AAB="android/app/build/outputs/bundle/release/app-release.aab"
[ -f "$AAB" ] || { echo "Gradle reported success but produced no bundle at $AAB" >&2; exit 1; }

# Name it after what the Play Console actually cares about, so a stale upload
# is obvious before it is rejected for a duplicate version code.
VERSION_NAME=$(grep -m1 'versionName' android/app/build.gradle | sed 's/[^"]*"\([^"]*\)".*/\1/')
VERSION_CODE=$(grep -m1 'versionCode' android/app/build.gradle | sed 's/[^0-9]*\([0-9]*\).*/\1/')
OUT="$HOME/Downloads/sakredbody-${VERSION_NAME}-${VERSION_CODE}.aab"

cp "$AAB" "$OUT"
echo
echo "  $OUT"
echo "  $(du -h "$OUT" | cut -f1)  versionName=$VERSION_NAME  versionCode=$VERSION_CODE"
echo
echo "Remember: bump versionCode in android/app/build.gradle before the next upload."
