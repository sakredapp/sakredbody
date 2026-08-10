# The home-screen widget

Everything except one step is written and compiling. The exception is creating
the iOS Widget Extension **target**, which has to be done in Xcode — adding a
target means writing `project.pbxproj` by hand, and a malformed one does not
fail cleanly, it corrupts the project.

Android needs nothing: the provider, layout and manifest entry are committed and
already build.

---

## What is already done

| Piece | Where | State |
|---|---|---|
| Shared store, iOS | `HealthSyncPlugin.updateWidget` → App Group `UserDefaults` | compiles |
| Shared store, Android | `HealthSyncPlugin.updateWidget` → `SharedPreferences` | compiles |
| Widget UI, iOS | `plugins/health-sync/ios/Widget/SakredWidget.swift` | parses; needs a target |
| Widget UI, Android | `android/app/src/main/java/com/sakredbody/app/SakredWidgetProvider.java` | **builds** |
| Feeding it | `client/src/lib/widget.ts`, called on every app open | shipped |

The widget shows the protocol day, today's practices and last night's sleep,
plus "under your usual" read against that member's own average. If nothing has
synced it says "Open to get started"; if the last sync is over 36 hours old it
says "Not synced today" rather than quietly showing an old number.

---

## iOS — the seven steps

### 1. Add the target

Xcode → **File → New → Target…** → **Widget Extension** → Next.

- Product Name: **`SakredWidget`**
- Team: your team (NATI GLOBAL INCORPORATED)
- **Uncheck all three checkboxes.** They are all ticked by default, and the
  set of them varies by Xcode version — at time of writing: **Include Live
  Activity**, **Include Control**, **Include Configuration App Intent**.

  Each generates source declaring its own entry point, and the widget below
  declares its own `@main`. Leaving any of them on produces "Invalid
  redeclaration of 'main'", which reads as a problem with the pasted file
  rather than with a checkbox two dialogs ago.

  If a future Xcode adds a fourth option here, the rule is the same: this
  widget takes no configuration, shows no Live Activity and provides no
  Control, so nothing in that list should be ticked.
- Leave **Project: App** and **Embed in Application: App** as they are.
- Bundle Identifier should read `com.sakredbody.app.SakredWidget` — derived, not
  typed. If it says anything else, the Product Name is wrong.
- Finish. When Xcode offers to activate the new scheme, click **Activate**.

### 2. Replace the generated source

Xcode creates `SakredWidget/SakredWidget.swift` with sample code. Delete its
contents and paste the file from this repo:

```
plugins/health-sync/ios/Widget/SakredWidget.swift
```

Do not add the repo file to the project as a reference — copy the contents in.
Keeping one file in two places is how they drift.

Xcode may also generate `SakredWidgetBundle.swift` containing an `@main`
struct. **Delete that file** — the pasted source declares its own `@main`, and
two of them is a compile error that reads as unrelated.

### 3. Create the App Group

This is the part that silently does nothing when it is wrong.

Select the project → **App** target → **Signing & Capabilities** →
**+ Capability** → **App Groups** → **+** →

```
group.com.sakredbody.app
```

Then select the **SakredWidget** target → **Signing & Capabilities** →
**+ Capability** → **App Groups** → tick the **same** group.

Both targets must have it. The identifier must match
`HealthSyncEngine.appGroup` in
`plugins/health-sync/ios/Sources/HealthSyncPlugin/HealthSyncEngine.swift`
exactly. A mismatch is not a build error — `UserDefaults(suiteName:)` returns
nil, `updateWidget` resolves `written: false`, and the widget shows its
placeholder forever with nothing in any log to explain it.

### 4. Deployment target

Select the **SakredWidget** target → **General** → **Minimum Deployments** →
set to **iOS 14.0** or higher, matching the App target. Xcode sometimes
defaults a new extension to a newer iOS than the app, which builds fine and
then refuses to install on the phone you are testing with.

### 5. Build

⌘B. If it fails, the two likely causes in order:

- **"Invalid redeclaration of 'main'"** — the generated `SakredWidgetBundle.swift`
  is still there. Delete it.
- **"Cannot find 'WidgetCenter'"** in the App target — `import WidgetKit` is
  missing from `HealthSyncPlugin.swift`. It is committed, so this means the
  plugin did not re-sync: run `npx cap sync ios`.

### 6. Run it

⌘R to your phone, open the app once so it writes a snapshot, then background
it. Long-press the home screen → **+** → search **Sakred Body**.

The widget will show placeholder text in the picker — that is deliberate, and
it is the one place real data must never appear.

### 7. Archive

When archiving for TestFlight, Xcode includes the extension automatically. The
build number of the widget target must match the app's, or App Store Connect
rejects the upload. Xcode keeps them in step if you set
`CURRENT_PROJECT_VERSION` on both; check it after the first archive.

---

## Android — nothing to do

Already committed and building. To see it:

1. Install the debug APK.
2. Open the app once so it writes to `SharedPreferences`.
3. Long-press the home screen → **Widgets** → **Sakred Body** → drag it out.

The provider is `exported="false"` — only this app can trigger its update
broadcast, which is what we want; nothing outside needs to.

---

## How it stays current

`client/src/lib/widget.ts` runs on every app open, alongside the notification
scheduler, because the two draw on the same numbers and one going stale while
the other did not is the inconsistency a member notices first.

On iOS the plugin calls `WidgetCenter.reloadAllTimelines()` after writing;
without it the widget keeps its last frame until the system decides to refresh,
which can be hours. On Android the plugin broadcasts `APPWIDGET_UPDATE` for the
same reason. `updatePeriodMillis` in `widget_sakred_info.xml` is a 30-minute
fallback for a phone the app has not been opened on — the OS treats it as a
hint, not a promise.

## What the widget cannot do

- **Call the API.** No network of its own. If it is not in the snapshot, it
  cannot be shown.
- **Update on its own schedule.** Both platforms budget widget refreshes and
  ignore anything they consider greedy.
- **Read the WebView.** None of the TypeScript exists in that process, which is
  why the snapshot is stored already formatted.
