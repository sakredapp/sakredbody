// swift-tools-version: 5.9
import PackageDescription

// Capacitor 8 resolves iOS plugins through Swift Package Manager, not
// CocoaPods. The podspec alongside this file is kept for a CocoaPods build,
// but `npx cap sync` reads this one — without it the plugin is listed as
// installed and then quietly left out of the Xcode workspace, so every call
// rejects with "not implemented" at runtime.
let package = Package(
    name: "SakredHealthSync",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SakredHealthSync",
            targets: ["HealthSyncPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "HealthSyncPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/HealthSyncPlugin",
            linkerSettings: [
                .linkedFramework("HealthKit")
            ])
    ]
)
