#!/usr/bin/env bash
#
# Build, install and drive the app on an iOS simulator — without Xcode's UI.
#
# ── Why this exists ───────────────────────────────────────────────────────
#
# The health bridge failed in a way no unit test can reach: a native call that
# never answers. Proving it fixed needs the real bridge, and until now that
# meant a full archive, an upload, a TestFlight wait, and a person tapping
# through onboarding on a handset — an hour per attempt, several attempts a
# day, with the developer unable to see anything the device saw.
#
# A simulator runs the same Swift. It is not a substitute for a device — the
# simulator's HealthKit has no real data and Health Connect does not exist on
# it at all — but it answers the question that actually mattered: does the
# bridge reply, and does the app do something sensible when it does not.
#
#   ./script/sim.sh build     compile for the simulator
#   ./script/sim.sh install   boot a device and install the app
#   ./script/sim.sh run       launch it and stream its logs
#   ./script/sim.sh shot NAME screenshot to the scratch dir
#   ./script/sim.sh logs      stream just this app's console
#   ./script/sim.sh all       build, install, run
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

DEVICE="${SIM_DEVICE:-iPhone 17}"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ios/App/App/Info.plist 2>/dev/null || echo "com.sakred.body")"
# PRODUCT_BUNDLE_IDENTIFIER is often a build setting rather than a literal in
# the plist, in which case the line above prints the $(VAR) unexpanded.
case "$BUNDLE_ID" in
  *'$'*) BUNDLE_ID="$(grep -m1 'PRODUCT_BUNDLE_IDENTIFIER = ' ios/App/App.xcodeproj/project.pbxproj | sed 's/.*= *//; s/;.*//')" ;;
esac
DERIVED="$REPO/.sim-build"
APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
SHOTS="${SIM_SHOTS:-/tmp/sakred-sim}"

udid() {
  xcrun simctl list devices available \
    | grep -m1 "$DEVICE (" \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
}

boot() {
  local id; id="$(udid)"
  [ -n "$id" ] || { echo "No simulator named '$DEVICE'." >&2; exit 1; }
  if ! xcrun simctl list devices | grep "$id" | grep -q Booted; then
    xcrun simctl boot "$id"
    # A device reports Booted well before it will accept an install.
    xcrun simctl bootstatus "$id" -b >/dev/null 2>&1 || true
  fi
  echo "$id"
}

case "${1:-all}" in
  build)
    echo "› web bundle"
    npm run build:client >/dev/null
    echo "› cap sync"
    npx cap sync ios >/dev/null
    echo "› xcodebuild (simulator)"
    # Swift Package Manager keeps its clone cache as bare repositories, and
    # refuses to read them when git is told `safe.bareRepository=explicit`.
    # That flag arrives here through the environment rather than any config
    # file, so every build re-fetched Firebase, Google Ads and Capacitor from
    # GitHub — minutes, every time, for packages already on disk.
    #
    # Cleared for this command only. Nothing is changed globally and no other
    # process sees it: the protection is against git discovering a bare repo
    # somewhere unexpected, and the path being read here is SPM's own cache.
    unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
    # -derivedDataPath keeps this out of the shared DerivedData that Xcode.app
    # uses, so a CLI build here never invalidates an archive in progress.
    #
    # Signing is left alone deliberately, and that took two tries to get right.
    #
    # CODE_SIGNING_ALLOWED=NO is the usual incantation for a simulator build,
    # and it stood here until the first run that ever reached HealthKit — which
    # died on "Missing com.apple.developer.healthkit entitlement". HealthKit is
    # an entitlement, and that flag drops the entitlements file on the floor.
    #
    # Forcing an ad-hoc identity with an empty team was worse, not better: for a
    # simulator destination Xcode builds *two* entitlement files, App.app.xcent
    # and App.app-Simulated.xcent, and only the Simulated one carries the real
    # keys. Overriding CODE_SIGN_STYLE pushed the build onto the empty one, so
    # it signed successfully with a dict containing nothing at all.
    #
    # The project's own automatic signing already does the right thing here, so
    # the correct amount of intervention is none. Verified by dumping the
    # embedded entitlements rather than by the build succeeding — an empty dict
    # signs perfectly well.
    xcodebuild \
      -project ios/App/App.xcodeproj \
      -scheme App \
      -configuration Debug \
      -sdk iphonesimulator \
      -destination "platform=iOS Simulator,name=$DEVICE" \
      -derivedDataPath "$DERIVED" \
      build
    ;;
  install)
    id="$(boot)"
    [ -d "$APP" ] || { echo "No app at $APP — run: ./script/sim.sh build" >&2; exit 1; }
    xcrun simctl uninstall "$id" "$BUNDLE_ID" >/dev/null 2>&1 || true
    xcrun simctl install "$id" "$APP"
    echo "installed $BUNDLE_ID on $id"
    ;;
  run)
    id="$(boot)"
    xcrun simctl launch "$id" "$BUNDLE_ID"
    ;;
  logs)
    id="$(boot)"
    # The WebView's console.log lands in os_log under the app's process.
    xcrun simctl spawn "$id" log stream \
      --style compact \
      --predicate "processImagePath CONTAINS 'App.app'"
    ;;
  shot)
    id="$(boot)"
    mkdir -p "$SHOTS"
    out="$SHOTS/${2:-shot}.png"
    xcrun simctl io "$id" screenshot "$out"
    echo "$out"
    ;;
  all)
    "$0" build && "$0" install && "$0" run
    ;;
  *)
    echo "usage: $0 {build|install|run|logs|shot NAME|all}" >&2
    exit 1
    ;;
esac
