"""Best practices for shipping Swift software on Apple platforms."""

from render import sheet, code, cmp, rules, table

G = "iOS Practice"

PRACTICES = sheet("best-practices", "Swift Engineering Best Practices", G,
    "The habits that make Apple-platform code survive a second year and a second engineer.", [

    rules("The ten that matter most", "If you say nothing else in a review, say these.", [
        ("good", "**Make illegal states unrepresentable.** An `enum` with associated values beats four `Bool`s."),
        ("good", "**Value types by default.** Reach for a `class` only when you need identity or shared mutable state."),
        ("good", "**Inject your dependencies.** Anything reading the clock, the network, the disk or a singleton is a constructor parameter."),
        ("good", "**Keep the public surface small.** `internal` is the default for a reason; `public` is a promise."),
        ("good", "**Errors are values.** Typed error enums, no `try!`, no silent `try?` that swallows the cause."),
        ("good", "**One source of truth** per piece of state, owned by exactly one type."),
        ("good", "**`@MainActor` on anything touching UI**, `actor` for shared mutable state, `Sendable` on anything crossing a boundary."),
        ("good", "**Tests are part of the change**, not a follow-up ticket. If it's hard to test, the design is wrong."),
        ("good", "**Delete code.** Dead code, feature flags past their expiry, and \"we might need it\" abstractions all cost real money."),
        ("good", "**Measure before optimising**, with Instruments, on the oldest device you support."),
    ]),

    cmp("Follow the Swift API Design Guidelines", "Clarity at the point of use beats brevity at the point of definition.",
        [("Do", "good", r"""
// Mutating verb / non-mutating -ed, -ing
array.sort();  let sorted = array.sorted()
list.reverse(); let reversed = list.reversed()

// Read like an English phrase at the call site
employees.remove(at: index)
view.insertSubview(child, at: 0)
scanner.scan(services: [heartRate])

// Omit needless words; the type is already in the signature
func add(_ observer: Observer)          // not addObserver(observer:)
extension Collection {
  func removingBoundaries() -> [Element]
}

// Booleans read as assertions
if line.isEmpty, path.isAbsolute { }

// Protocols: -able / -ible for capability, nouns for what it IS
protocol Cancellable { }
protocol Collection { }
"""),
         ("Don't", "bad", r"""
func sortArray(theArray: inout [Int])   // stutters, unclear
employees.remove(index)                 // remove the value, or at that index?
func doWork(_ a: Bool, _ b: Bool)       // unreadable at the call site
var flag = false                        // flag for what?
class MyDataManagerHelperUtil { }       // four nouns, zero meaning

// Abbreviations the reader has to decode
func calcTtlAmt(_ i: [Itm]) -> Dec

// Type name repeated in every member
struct User {
  var userName: String                  // user.userName
  var userAge: Int
}
""")]),

    code("Errors: model them, don't stringly-type them", "", r"""
enum SyncError: Error, Equatable {
  case offline
  case unauthorized
  case server(status: Int)
  case decoding(field: String)
}

extension SyncError: LocalizedError {
  // What the USER sees - never the raw error.
  var errorDescription: String? {
    switch self {
    case .offline:      String(localized: "You appear to be offline.")
    case .unauthorized: String(localized: "Please sign in again.")
    case .server, .decoding: String(localized: "Something went wrong. Try again.")
    }
  }
}

// Typed throws (Swift 6) documents the failure mode in the signature.
func sync() async throws(SyncError) -> Snapshot { ... }

// At the boundary, translate - never leak a transport error into the domain.
do { return try await api.fetch() }
catch let error as URLError where error.code == .notConnectedToInternet {
  throw SyncError.offline
}

// Rules of thumb
// try!   -> only when failure is a programmer error (a bundled resource)
// try?   -> only when you genuinely do not care WHY it failed
// fatalError -> only for unreachable states, with a message that names the invariant
"""),

    cmp("Optionals", "An Optional is a design decision, not a nuisance.",
        [("Do", "good", r"""
guard let user = session.user else { return .signedOut }

// Give the caller a real default
let name = user.nickname ?? user.legalName

// Optional chaining over pyramids
let city = user.address?.city?.capitalized

// Empty collections instead of optional collections
var tags: [Tag] = []          // not [Tag]?

// Non-optional after init: use a factory or a failable init
init?(rawValue: String) { ... }
"""),
         ("Don't", "bad", r"""
let user = session.user!               // crash waiting to happen
var name: String!                      // implicitly unwrapped: no safety at all

if user != nil {
  print(user!.name)                    // the compiler already offered you if-let
}

var items: [Item]?                     // now every caller handles nil AND empty

// try? that hides the reason
let data = try? Data(contentsOf: url)  // was it missing? unreadable? corrupt?
""")]),

    code("Logging & diagnostics", "`OSLog` is structured, fast, privacy-aware and visible in Instruments.", r"""
import OSLog

extension Logger {
  private static let subsystem = Bundle.main.bundleIdentifier!
  static let sync = Logger(subsystem: subsystem, category: "sync")
  static let ui   = Logger(subsystem: subsystem, category: "ui")
}

Logger.sync.debug("Starting sync for \(userID, privacy: .private)")
Logger.sync.error("Sync failed: \(error.localizedDescription, privacy: .public)")
Logger.sync.notice("Uploaded \(count) records in \(duration, format: .fixed(precision: 2))s")

// Dynamic data is redacted by default in release builds - mark .public deliberately.

// Performance regions that show up in Instruments' timeline
let signposter = OSSignposter(logger: Logger.sync)
let state = signposter.beginInterval("decode", id: signposter.makeSignpostID())
defer { signposter.endInterval("decode", state) }

// print() is invisible in production, unstructured, and slows down release builds.
"""),

    code("Configuration, secrets & feature flags", "", r"""
// 1. Build settings live in .xcconfig, not in the project file (mergeable, reviewable).
//    API_BASE_URL = https:/$()/api.staging.example.com
//    Then surface it through Info.plist and read it once:
enum AppConfig {
  static let apiBaseURL: URL = {
    guard let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
          let url = URL(string: raw) else { preconditionFailure("API_BASE_URL missing") }
    return url
  }()
}

// 2. Secrets never live in the repo or in the binary. Tokens go to the Keychain.
func store(token: String, account: String) throws {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: account,
    kSecValueData as String: Data(token.utf8),
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  ]
  SecItemDelete(query as CFDictionary)
  guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw KeychainError.write }
}

// 3. Feature flags are typed, defaulted, and have an owner + an expiry date.
struct FeatureFlags: Sendable {
  var newCheckout = false        // owner: payments, remove after 2026-11
  var useLocalCache = true
}
"""),

    table("Performance checklist", "In rough order of how often each one is the actual culprit.",
        ["Symptom", "Look at", "Fix"],
        [["Janky scrolling", "Time Profiler, main thread", "move work off `@MainActor`; precompute in the model"],
         ["Slow list", "view body count", "smaller `View` structs, stable IDs, `Lazy` stacks, avoid `AnyView`"],
         ["Memory spikes on images", "Allocations", "downsample with `ImageIO` before display; don't decode full-res"],
         ["Slow launch", "App Launch template", "defer non-critical work off `didFinishLaunching`; fewer dynamic frameworks"],
         ["Growing memory", "Leaks + Memory Graph", "retain cycles in closures/delegates; unbounded caches"],
         ["Battery / thermal", "Energy Log, Points of Interest", "coalesce network calls, back off timers and BLE scans"],
         ["Slow build", "`-Xfrontend -warn-long-function-bodies=100`", "annotate types on big expressions; split modules"],
         ["Hitches after a change", "Signposts + XCTMetric", "add a performance test so it can't regress silently"]]),

    rules("Concurrency practices", "The Swift 6 era, in review-comment form.", [
        ("good", "`@MainActor` the view model, not individual methods — one boundary is easier to reason about."),
        ("good", "Keep `actor` methods short and side-effect free around `await`; state can change under you (reentrancy)."),
        ("good", "Store `Task` handles you must cancel, and cancel them in `onDisappear` / `deinit`."),
        ("good", "Prefer `async let` and `TaskGroup` to loose `Task { }` — structured work cannot leak."),
        ("good", "Turn on strict concurrency **per module** and migrate leaf modules first."),
        ("bad", "Never block: no `DispatchSemaphore`, no `.wait()`, no `Thread.sleep` in async code."),
        ("bad", "`@unchecked Sendable` without a real lock is a lie the compiler will believe and the runtime won't."),
        ("bad", "Don't reach for `Task.detached` to \"get off the main thread\" — a `nonisolated func` already is."),
    ]),

    rules("Accessibility, localization & privacy", "Cheap if done as you go; expensive as a retrofit.", [
        ("good", "Every interactive control needs a label: `.accessibilityLabel`, `.accessibilityValue`, `.accessibilityHint`."),
        ("good", "Support Dynamic Type — use text styles (`.body`, `.headline`), never fixed point sizes; test at AX5."),
        ("good", "Contrast, hit targets ≥ 44×44 pt, and `.accessibilityElement(children: .combine)` for compound rows."),
        ("good", "Use `String(localized:)` / String Catalogs, never string concatenation for sentences; format numbers and dates with `FormatStyle`."),
        ("good", "Test right-to-left with the RTL pseudolanguage scheme option, and pseudo-locale for truncation."),
        ("good", "Declare data use in the **privacy manifest** (`PrivacyInfo.xcprivacy`) and justify required-reason APIs."),
        ("neutral", "Ask for permissions *in context*, with a purpose string that says what the user gets — not at launch."),
    ]),

    code("Documentation that pays for itself", "DocC comments show up in Quick Help and in the generated docs.", r"""
/// Cancels an order and refunds the customer.
///
/// The order must still be in the ``OrderState/placed`` state; a delivered
/// order has to go through returns instead.
///
/// - Parameters:
///   - id: The identifier of the order to cancel.
///   - reason: Free text shown to the support team. Not user visible.
/// - Returns: The updated order, with `state == .cancelled`.
/// - Throws: ``OrderError/notCancellable`` if the order already shipped.
/// - Note: Idempotent — cancelling twice returns the same result.
public func cancel(orderID id: Order.ID, reason: String) async throws -> Order

// Comment WHY, never WHAT:
// The API returns 200 with an empty body when the token expired (BUG-4821),
// so an empty payload has to be treated as unauthenticated.
guard !data.isEmpty else { throw SyncError.unauthorized }

// MARK: - marks sections;  // TODO: needs an owner and a ticket.
"""),

    table("Project hygiene", "What a healthy Swift repo has.",
        ["Area", "Practice"],
        [["Formatting", "`swift-format` or SwiftFormat in a pre-commit hook — never argue about style in review"],
         ["Linting", "SwiftLint with the ruleset committed; warnings fail CI, not the reviewer's patience"],
         ["Build settings", "`.xcconfig` files per configuration; keep the `.pbxproj` diff small"],
         ["Warnings", "`SWIFT_TREAT_WARNINGS_AS_ERRORS` on CI; a warning nobody fixes is a warning everybody ignores"],
         ["Dependencies", "SPM, pinned with `Package.resolved` committed; audit before adding — every dependency is a liability"],
         ["Tests", "Xcode test plans; unit tests on every PR, UI tests nightly"],
         ["CI", "build + test + lint on PR; archive on merge to main; keep it under 10 minutes"],
         ["Releases", "semantic versioning, an automated changelog, and a tagged commit per release"],
         ["Crash reporting", "symbolicated crashes with breadcrumbs; triage weekly, not at release time"],
         ["Code owners", "`CODEOWNERS` per module so reviews route themselves"]]),

    rules("A review checklist you can run in five minutes", "", [
        ("modern", "**Correctness** — what happens on empty, nil, error, cancellation, and a slow network?"),
        ("modern", "**Concurrency** — who owns this state? Is the isolation stated or assumed?"),
        ("modern", "**Naming** — could I guess what this does from the call site alone?"),
        ("modern", "**Surface** — does this need to be `public`? Does the new API force future callers into a corner?"),
        ("modern", "**Tests** — is there one test that fails if the core behaviour regresses?"),
        ("modern", "**Size** — is this diff reviewable? Under ~400 lines gets real review; over that gets a rubber stamp."),
        ("modern", "**Deletion** — did this change leave anything behind that should have gone?"),
        ("neutral", "Review the design before the syntax. Comment on the shape first; formatting is the linter's job."),
    ]),
])
