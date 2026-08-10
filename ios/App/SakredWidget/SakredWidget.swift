import WidgetKit
import SwiftUI

/**
 * The home-screen widget.
 *
 * The canonical copy of this file lives at
 * plugins/health-sync/ios/Widget/SakredWidget.swift, version-controlled beside
 * the code that feeds it. This is the copy Xcode compiles.
 *
 * @main lives here because the generated SakredWidgetBundle.swift was removed.
 * An extension needs exactly one entry point: with the bundle present this
 * struct must NOT be @main, and with it deleted it must be. Exactly one of the
 * two files carries it.
 *
 * A widget cannot call the API, cannot read the WebView, and cannot run its own
 * network requests on any schedule it chooses. Everything it renders is the
 * blob the app wrote into the shared App Group on its last sync. That is the
 * entire contract, and it is why the snapshot is stored already formatted —
 * there is nobody here to format it.
 */

private let appGroup = "group.com.sakredbody.app"
private let snapshotKey = "sakred.widget.snapshot"

/** After this long without a sync, the widget stops claiming to be current. */
private let staleAfter: TimeInterval = 36 * 60 * 60

struct SakredEntry: TimelineEntry {
    let date: Date
    let title: String
    let practices: String
    let sleep: String?
    let sleepNote: String?
    let stale: Bool
    /** True before the member has ever connected or synced. */
    let empty: Bool

    static let placeholder = SakredEntry(
        date: Date(),
        title: "Day 4 — Liver Clear",
        practices: "5 practices today.",
        sleep: "6h 40m",
        sleepNote: "about your usual",
        stale: false,
        empty: false
    )
}

struct SakredProvider: TimelineProvider {
    func placeholder(in context: Context) -> SakredEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (SakredEntry) -> Void) {
        // The gallery preview must never show a real member's data, and must
        // never show an empty box either — nobody adds a widget that looks
        // broken in the picker.
        completion(context.isPreview ? .placeholder : read())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SakredEntry>) -> Void) {
        let entry = read()
        // Ask to be woken at the next hour. The app also calls
        // reloadAllTimelines() after each sync, which is what actually keeps
        // this current — this is only the fallback for a phone the app has not
        // been opened on.
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func read() -> SakredEntry {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let snapshot = defaults.dictionary(forKey: snapshotKey),
            let title = snapshot["title"] as? String
        else {
            // No App Group, or nothing written yet. Both look the same from
            // here and both mean the same thing to the member: open the app.
            return SakredEntry(
                date: Date(), title: "Sakred Body", practices: "Open to get started.",
                sleep: nil, sleepNote: nil, stale: false, empty: true
            )
        }

        var stale = false
        if let iso = snapshot["updatedAt"] as? String,
           let updated = ISO8601DateFormatter().date(from: iso) {
            stale = Date().timeIntervalSince(updated) > staleAfter
        }

        return SakredEntry(
            date: Date(),
            title: title,
            practices: snapshot["practices"] as? String ?? "",
            sleep: snapshot["sleep"] as? String,
            sleepNote: snapshot["sleepNote"] as? String,
            stale: stale,
            empty: false
        )
    }
}

/** The ink and gold the app uses. Hard-coded: a widget has no CSS to read. */
private let ink = Color(red: 0.110, green: 0.102, blue: 0.090)
private let gold = Color(red: 0.773, green: 0.624, blue: 0.349)
private let bone = Color(red: 0.949, green: 0.929, blue: 0.894)

struct SakredWidgetView: View {
    var entry: SakredEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            ink
            VStack(alignment: .leading, spacing: family == .systemSmall ? 4 : 6) {
                Text(entry.title)
                    .font(.system(size: family == .systemSmall ? 13 : 15, weight: .semibold, design: .serif))
                    .foregroundColor(bone)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                if !entry.practices.isEmpty {
                    Text(entry.practices)
                        .font(.system(size: family == .systemSmall ? 11 : 12))
                        .foregroundColor(bone.opacity(0.7))
                        .lineLimit(2)
                }

                Spacer(minLength: 0)

                // Sleep is the number people put a widget on their home screen
                // for, so it gets the emphasis even though it is written last.
                if let sleep = entry.sleep {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(sleep)
                            .font(.system(size: family == .systemSmall ? 20 : 24, weight: .medium, design: .serif))
                            .foregroundColor(gold)
                        if let note = entry.sleepNote, family != .systemSmall {
                            Text(note)
                                .font(.system(size: 10))
                                .foregroundColor(bone.opacity(0.5))
                                .lineLimit(1)
                        }
                    }
                } else if !entry.empty {
                    Text("No sleep recorded")
                        .font(.system(size: 10))
                        .foregroundColor(bone.opacity(0.4))
                }

                if entry.stale {
                    // Said plainly rather than shown by dimming. A member whose
                    // ring died should know the number is old, not wonder why
                    // their sleep has not moved in two days.
                    Text("Not synced today")
                        .font(.system(size: 9))
                        .foregroundColor(bone.opacity(0.35))
                }
            }
            .padding(family == .systemSmall ? 12 : 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

@main
struct SakredWidget: Widget {
    let kind = "SakredWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SakredProvider()) { entry in
            if #available(iOS 17.0, *) {
                SakredWidgetView(entry: entry)
                    .containerBackground(ink, for: .widget)
            } else {
                SakredWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Today")
        .description("Your practices and last night's sleep.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
