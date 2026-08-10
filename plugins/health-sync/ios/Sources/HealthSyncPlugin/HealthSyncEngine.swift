import Foundation
import HealthKit

/**
 * Reading HealthKit and posting it, with no WebView involved.
 *
 * This is the whole reason the plugin exists. When iOS wakes the app for new
 * health data the process is alive but the WKWebView is suspended, so none of
 * the TypeScript in client/src/lib/health.ts can run. Everything it does —
 * pick the window, aggregate per day, convert units, post — has to exist a
 * second time here, in Swift.
 *
 * That duplication is a real cost and worth naming: two implementations of the
 * same mapping will drift unless someone keeps them together. The units and
 * metric names below are the contract in shared/models/health.ts, and the
 * server rejects anything that disagrees rather than storing it — which is
 * what turns a drift into a visible 400 instead of a wrong number on a chart.
 */
@objc public class HealthSyncEngine: NSObject {

    public static let shared = HealthSyncEngine()

    /**
     * The App Group both the app and its widget belong to.
     *
     * Must match the identifier enabled under Signing & Capabilities on BOTH
     * targets, and in the Apple developer portal. A mismatch is not an error at
     * build time — UserDefaults(suiteName:) simply returns nil and the widget
     * shows its placeholder forever.
     */
    public static let appGroup = "group.com.sakredbody.app"
    public static let widgetKey = "sakred.widget.snapshot"

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard

    private enum Key {
        static let apiOrigin = "sakred.health.apiOrigin"
        static let token = "sakred.health.token"
        static let overlapDays = "sakred.health.overlapDays"
        static let enabled = "sakred.health.bgEnabled"
        static let lastRunAt = "sakred.health.lastRunAt"
        static let lastResult = "sakred.health.lastResult"
    }

    // MARK: - Configuration

    @objc public func configure(apiOrigin: String, token: String?, overlapDays: Int) {
        defaults.set(apiOrigin, forKey: Key.apiOrigin)
        defaults.set(overlapDays, forKey: Key.overlapDays)
        if let token = token {
            defaults.set(token, forKey: Key.token)
        } else {
            // Logout. The observers stay registered — re-registering them is
            // the expensive part — but a run with no token posts nothing.
            defaults.removeObject(forKey: Key.token)
        }
    }

    @objc public var isEnabled: Bool { defaults.bool(forKey: Key.enabled) }
    @objc public var lastRunAt: String? { defaults.string(forKey: Key.lastRunAt) }
    @objc public var lastResult: String? { defaults.string(forKey: Key.lastResult) }

    // MARK: - The metric table

    /// One HealthKit type, our metric name, and how a day of it is reduced.
    private struct Plan {
        let identifier: HKQuantityTypeIdentifier
        let metric: String
        let unit: HKUnit
        let options: HKStatisticsOptions
        /// HKUnit.percent() yields a fraction; our contract is 0–100.
        let scale: Double

        init(_ identifier: HKQuantityTypeIdentifier, _ metric: String, _ unit: HKUnit,
             _ options: HKStatisticsOptions, scale: Double = 1) {
            self.identifier = identifier
            self.metric = metric
            self.unit = unit
            self.options = options
            self.scale = scale
        }
    }

    private lazy var plans: [Plan] = {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        var out: [Plan] = [
            Plan(.stepCount, "steps", .count(), .cumulativeSum),
            Plan(.distanceWalkingRunning, "distanceMeters", .meter(), .cumulativeSum),
            Plan(.flightsClimbed, "flightsClimbed", .count(), .cumulativeSum),
            Plan(.appleExerciseTime, "exerciseMinutes", .minute(), .cumulativeSum),
            Plan(.activeEnergyBurned, "activeCalories", .kilocalorie(), .cumulativeSum),
            Plan(.dietaryWater, "waterMl", HKUnit.literUnit(with: .milli), .cumulativeSum),
            Plan(.dietaryEnergyConsumed, "dietaryCalories", .kilocalorie(), .cumulativeSum),

            Plan(.restingHeartRate, "restingHeartRate", bpm, .discreteAverage),
            Plan(.heartRateVariabilitySDNN, "heartRateVariability",
                 HKUnit.secondUnit(with: .milli), .discreteAverage),
            Plan(.vo2Max, "vo2Max", HKUnit(from: "ml/kg*min"), .discreteAverage),

            Plan(.bodyMass, "weightKg", HKUnit.gramUnit(with: .kilo), .discreteAverage),
            // percent() is 0–1 in HealthKit. Without the ×100 a body fat of
            // 0.18 falls under the server's floor of 1 and is dropped, so the
            // metric would simply never appear and nothing would say why.
            Plan(.bodyFatPercentage, "bodyFatPercent", .percent(), .discreteAverage, scale: 100),
            Plan(.height, "heightCm", HKUnit.meterUnit(with: .centi), .discreteMax),

            Plan(.respiratoryRate, "respiratoryRate", bpm, .discreteAverage),
            Plan(.oxygenSaturation, "oxygenSaturation", .percent(), .discreteAverage, scale: 100),
            Plan(.bodyTemperature, "bodyTemperatureC", .degreeCelsius(), .discreteAverage),
        ]
        return out
    }()

    /// Everything we observe, quantity and category alike.
    private func readTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        for plan in plans {
            if let t = HKObjectType.quantityType(forIdentifier: plan.identifier) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) { types.insert(mindful) }
        return types
    }

    // MARK: - Background delivery

    private var observers: [HKObserverQuery] = []

    /**
     * Register an observer per type and ask iOS to wake us when each changes.
     *
     * This has to run on EVERY launch, including a background launch — an
     * observer query is not persisted across process death, and iOS only
     * delivers to a query that is currently registered. Registering once at
     * first grant and assuming it sticks is the classic way to build a
     * background sync that works until the first time the app is killed.
     */
    @objc public func enableBackgroundDelivery(completion: @escaping (Bool, String?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, "HealthKit is not available on this device.")
            return
        }

        stopObservers()
        let types = readTypes().compactMap { $0 as? HKSampleType }
        guard !types.isEmpty else {
            completion(false, "No readable types.")
            return
        }

        var failures: [String] = []
        let group = DispatchGroup()

        for type in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                guard let self = self else {
                    // iOS stops delivering to an app that does not acknowledge,
                    // so the handler is called on every path including this one.
                    completionHandler()
                    return
                }
                if error != nil {
                    completionHandler()
                    return
                }
                self.runSync { _ in
                    completionHandler()
                }
            }
            store.execute(query)
            observers.append(query)

            group.enter()
            // .hourly is the finest HealthKit allows for most types, and it is
            // a ceiling rather than a promise: iOS coalesces and defers these
            // according to battery and usage. Sleep in particular tends to
            // arrive in one batch when the watch next syncs.
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { success, error in
                if !success {
                    failures.append("\(type.identifier): \(error?.localizedDescription ?? "refused")")
                }
                group.leave()
            }
        }

        group.notify(queue: .main) { [weak self] in
            let ok = failures.count < types.count
            self?.defaults.set(ok, forKey: Key.enabled)
            completion(ok, failures.isEmpty ? nil : failures.joined(separator: "; "))
        }
    }

    @objc public func disableBackgroundDelivery(completion: @escaping (Bool) -> Void) {
        stopObservers()
        store.disableAllBackgroundDelivery { [weak self] _, _ in
            self?.defaults.set(false, forKey: Key.enabled)
            completion(true)
        }
    }

    private func stopObservers() {
        for query in observers { store.stop(query) }
        observers.removeAll()
    }

    // MARK: - The run

    /**
     * Read the trailing window and post it.
     *
     * Deliberately not "everything since the last run". Health data is written
     * late — a ring writes last night's sleep this afternoon — so a window that
     * starts where the last one ended leaves holes that look exactly like quiet
     * days. The server's unique index turns the re-read into an update.
     */
    @objc public func runSync(completion: @escaping (String) -> Void) {
        guard let origin = defaults.string(forKey: Key.apiOrigin), !origin.isEmpty,
              let token = defaults.string(forKey: Key.token), !token.isEmpty else {
            record("not configured")
            completion("not configured")
            return
        }

        let overlap = max(1, defaults.integer(forKey: Key.overlapDays) == 0 ? 7 : defaults.integer(forKey: Key.overlapDays))
        let calendar = Calendar.current
        let end = Date()
        guard let start = calendar.date(byAdding: .day, value: -overlap, to: calendar.startOfDay(for: end)) else {
            completion("bad window")
            return
        }

        collect(from: start, to: end) { [weak self] samples in
            guard let self = self else { return }
            self.workouts(start: start, end: end) { workouts in
                if samples.isEmpty && workouts.isEmpty {
                    self.record("nothing to post")
                    completion("nothing to post")
                    return
                }
                self.post(origin: origin, token: token, samples: samples,
                          workouts: workouts, syncedThrough: end) { result in
                    self.record(result)
                    completion(result)
                }
            }
        }
    }

    private func record(_ result: String) {
        defaults.set(ISO8601DateFormatter().string(from: Date()), forKey: Key.lastRunAt)
        defaults.set(result, forKey: Key.lastResult)
    }

    // MARK: - Collection

    private struct Sample {
        let onDate: String
        let metric: String
        let value: Double
    }

    private struct WorkoutRow {
        let externalId: String
        let workoutType: String
        let startAt: String
        let endAt: String
        let onDate: String
        let durationSeconds: Int
        let activeCalories: Double?
        let distanceMeters: Double?
    }

    private func collect(from start: Date, to end: Date, completion: @escaping ([Sample]) -> Void) {
        let group = DispatchGroup()
        // Statistics queries return on a background queue, so every append
        // goes through this serial queue. Without it the array is mutated from
        // as many threads as there are metrics.
        let lock = DispatchQueue(label: "com.sakredbody.healthsync.collect")
        var samples: [Sample] = []

        for plan in plans {
            guard let type = HKObjectType.quantityType(forIdentifier: plan.identifier) else { continue }
            group.enter()
            statistics(type: type, plan: plan, start: start, end: end) { found in
                lock.async {
                    samples.append(contentsOf: found)
                    group.leave()
                }
            }
        }

        group.enter()
        sleepMinutes(start: start, end: end) { found in
            lock.async {
                samples.append(contentsOf: found)
                group.leave()
            }
        }

        group.enter()
        mindfulMinutes(start: start, end: end) { found in
            lock.async {
                samples.append(contentsOf: found)
                group.leave()
            }
        }

        group.notify(queue: .main) {
            lock.async {
                let snapshot = samples
                DispatchQueue.main.async { completion(snapshot) }
            }
        }
    }

    private func statistics(type: HKQuantityType, plan: Plan, start: Date, end: Date,
                            completion: @escaping ([Sample]) -> Void) {
        let calendar = Calendar.current
        let anchor = calendar.startOfDay(for: start)
        var interval = DateComponents()
        interval.day = 1

        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate),
            options: plan.options,
            anchorDate: anchor,
            intervalComponents: interval
        )

        query.initialResultsHandler = { _, results, _ in
            guard let results = results else {
                completion([])
                return
            }
            var out: [Sample] = []
            results.enumerateStatistics(from: anchor, to: end) { statistic, _ in
                let quantity: HKQuantity?
                switch plan.options {
                case .cumulativeSum: quantity = statistic.sumQuantity()
                case .discreteMax: quantity = statistic.maximumQuantity()
                default: quantity = statistic.averageQuantity()
                }
                guard let q = quantity else { return }
                let value = q.doubleValue(for: plan.unit) * plan.scale
                guard value.isFinite else { return }
                out.append(Sample(onDate: Self.localDate(statistic.startDate),
                                  metric: plan.metric,
                                  value: value))
            }
            completion(out)
        }
        store.execute(query)
    }

    /**
     * Sleep, folded to the date each session ENDS on.
     *
     * A session from 23:40 to 07:10 belongs to the morning, not the evening.
     * Filing it by start date moves a member's sleep between days depending on
     * whether they fell asleep before or after midnight, which is the kind of
     * wrong that never looks like a bug.
     *
     * `inBed` is excluded: on iOS it is written by a phone on a nightstand and
     * counting it inflates a member's sleep by however long they read.
     */
    private func sleepMinutes(start: Date, end: Date, completion: @escaping ([Sample]) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion([])
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let query = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, results, _ in
            guard let results = results as? [HKCategorySample] else {
                completion([])
                return
            }

            var totals: [String: [String: Double]] = [:]
            for sample in results {
                let minutes = sample.endDate.timeIntervalSince(sample.startDate) / 60
                guard minutes > 0 else { continue }
                let date = Self.localDate(sample.endDate)
                var day = totals[date] ?? [:]

                if #available(iOS 16.0, *) {
                    switch sample.value {
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                        day["sleepMinutes", default: 0] += minutes
                        day["sleepDeepMinutes", default: 0] += minutes
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                        day["sleepMinutes", default: 0] += minutes
                        day["sleepRemMinutes", default: 0] += minutes
                    case HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                         HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                        day["sleepMinutes", default: 0] += minutes
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        day["sleepAwakeMinutes", default: 0] += minutes
                    default:
                        break // inBed
                    }
                } else {
                    // Before iOS 16 there are no stages: asleep or in bed.
                    if sample.value == HKCategoryValueSleepAnalysis.asleep.rawValue {
                        day["sleepMinutes", default: 0] += minutes
                    }
                }
                totals[date] = day
            }

            var out: [Sample] = []
            for (date, metrics) in totals {
                for (metric, value) in metrics {
                    out.append(Sample(onDate: date, metric: metric, value: (value * 100).rounded() / 100))
                }
            }
            completion(out)
        }
        store.execute(query)
    }

    private func mindfulMinutes(start: Date, end: Date, completion: @escaping ([Sample]) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
            completion([])
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let query = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, results, _ in
            guard let results = results as? [HKCategorySample] else {
                completion([])
                return
            }
            var totals: [String: Double] = [:]
            for sample in results {
                let minutes = sample.endDate.timeIntervalSince(sample.startDate) / 60
                guard minutes > 0 else { continue }
                totals[Self.localDate(sample.startDate), default: 0] += minutes
            }
            completion(totals.map {
                Sample(onDate: $0.key, metric: "mindfulnessMinutes", value: ($0.value * 100).rounded() / 100)
            })
        }
        store.execute(query)
    }

    /**
     * Workouts, which are events rather than daily totals.
     *
     * `uuid` is the idempotency key the server dedupes on. A workout with no
     * stable id would be re-inserted as a new session on every run, so a member
     * who ran once on Tuesday would accumulate a Tuesday run per background
     * wake for as long as it stayed inside the re-read window.
     */
    private func workouts(start: Date, end: Date, completion: @escaping ([WorkoutRow]) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate,
                                  limit: 200, sortDescriptors: nil) { _, results, _ in
            guard let workouts = results as? [HKWorkout] else {
                completion([])
                return
            }
            let iso = ISO8601DateFormatter()
            completion(workouts.map { workout in
                WorkoutRow(
                    externalId: workout.uuid.uuidString,
                    workoutType: Self.activityName(workout.workoutActivityType),
                    startAt: iso.string(from: workout.startDate),
                    endAt: iso.string(from: workout.endDate),
                    onDate: Self.localDate(workout.startDate),
                    durationSeconds: Int(workout.duration),
                    activeCalories: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                    distanceMeters: workout.totalDistance?.doubleValue(for: .meter())
                )
            })
        }
        store.execute(query)
    }

    /**
     * A readable name for the activity.
     *
     * HKWorkoutActivityType is an enum over UInt with no name at runtime, so
     * this is a lookup rather than reflection. Unmapped types fall through to
     * "other" instead of a number: a coach reading "37" learns nothing, and the
     * value is free text on our side anyway.
     */
    private static func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .hiking: return "hiking"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .functionalStrengthTraining: return "strength"
        case .traditionalStrengthTraining: return "strength"
        case .highIntensityIntervalTraining: return "hiit"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing: return "stairs"
        case .coreTraining: return "core"
        case .flexibility: return "flexibility"
        case .mindAndBody: return "mind and body"
        case .dance: return "dance"
        case .boxing: return "boxing"
        case .martialArts: return "martial arts"
        case .tennis: return "tennis"
        case .golf: return "golf"
        case .cooldown: return "cooldown"
        default: return "other"
        }
    }

    // MARK: - Posting

    private static let units: [String: String] = [
        "steps": "count", "distanceMeters": "m", "flightsClimbed": "count",
        "exerciseMinutes": "min", "activeCalories": "kcal", "totalCalories": "kcal",
        "restingHeartRate": "bpm", "heartRateVariability": "ms", "vo2Max": "mL/kg/min",
        "sleepMinutes": "min", "sleepDeepMinutes": "min", "sleepRemMinutes": "min",
        "sleepAwakeMinutes": "min", "weightKg": "kg", "bodyFatPercent": "%",
        "heightCm": "cm", "respiratoryRate": "brpm", "oxygenSaturation": "%",
        "bodyTemperatureC": "degC", "mindfulnessMinutes": "min", "waterMl": "mL",
        "dietaryCalories": "kcal",
    ]

    private func post(origin: String, token: String, samples: [Sample],
                      workouts: [WorkoutRow], syncedThrough: Date,
                      completion: @escaping (String) -> Void) {
        guard let url = URL(string: origin + "/api/health/sync") else {
            completion("bad api origin")
            return
        }

        // Last value wins for a repeated key. Postgres cannot resolve two rows
        // that conflict with each other inside one statement — it raises
        // "cannot affect row a second time" and the entire sync fails.
        var byKey: [String: Sample] = [:]
        for sample in samples { byKey["\(sample.onDate)|\(sample.metric)"] = sample }

        var byWorkout: [String: WorkoutRow] = [:]
        for workout in workouts { byWorkout[workout.externalId] = workout }

        let payload: [String: Any] = [
            "platform": "healthkit",
            "samples": byKey.values.map { sample -> [String: Any] in
                [
                    "onDate": sample.onDate,
                    "metric": sample.metric,
                    "value": sample.value,
                    "unit": Self.units[sample.metric] ?? "count",
                    "sourceApp": "Apple Health",
                ]
            },
            "workouts": byWorkout.values.map { workout -> [String: Any] in
                var row: [String: Any] = [
                    "externalId": workout.externalId,
                    "workoutType": workout.workoutType,
                    "startAt": workout.startAt,
                    "endAt": workout.endAt,
                    "onDate": workout.onDate,
                    "durationSeconds": workout.durationSeconds,
                    "sourceApp": "Apple Health",
                ]
                // Omitted rather than sent as null: the server's schema treats
                // an absent optional and an explicit null the same, but a
                // smaller body is a body more likely to survive a bad signal.
                if let calories = workout.activeCalories { row["activeCalories"] = calories }
                if let distance = workout.distanceMeters { row["distanceMeters"] = distance }
                return row
            },
            "syncedThrough": ISO8601DateFormatter().string(from: syncedThrough),
            "deviceModel": "ios-background",
        ]

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
            completion("could not encode")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "X-Client-Platform")
        request.httpBody = body
        // A background wake is a small budget. Failing fast and retrying on the
        // next delivery beats holding the wake open on a bad connection.
        request.timeoutInterval = 25

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion("failed: \(error.localizedDescription)")
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 {
                // The token is revoked or expired. Nothing here can refresh it;
                // the next foreground launch re-configures with a live one.
                completion("unauthorized")
                return
            }
            guard (200..<300).contains(status) else {
                completion("http \(status)")
                return
            }
            var accepted = byKey.count + byWorkout.count
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let n = json["accepted"] as? Int {
                accepted = n
            }
            completion("posted \(accepted) values")
        }.resume()
    }

    // MARK: - Dates

    /**
     * The member's own calendar date, in their device's timezone.
     *
     * Not an ISO8601 UTC string sliced to ten characters: for a member in Los
     * Angeles that files everything after 5pm under tomorrow, so an evening
     * walk lands on a day that has not happened yet.
     */
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar.current
        f.timeZone = TimeZone.current
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    static func localDate(_ date: Date) -> String {
        return dayFormatter.string(from: date)
    }
}
