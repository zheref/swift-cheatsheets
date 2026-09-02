"""Core Bluetooth, Testing, Architecture and Modularization sheets."""

from render import sheet, code, cmp, rules, table, diagram
import diagrams as D

PLATFORM = "iOS Platform"
PRACTICE = "iOS Practice"

# ==========================================================================
# Core Bluetooth
# ==========================================================================

BLE = sheet("core-bluetooth", "Core Bluetooth (BLE)", PLATFORM,
    "Central role end to end, the GATT model, and the traps that fail interviews.", [

    diagram("The connection lifecycle",
            "Every BLE bug is a step done out of order. Left to right, then wrap to row two.",
            D.ble_lifecycle()),

    diagram("GATT object model",
            "Peripheral → Service → Characteristic → Descriptor. Everything else is detail.",
            D.ble_gatt()),

    rules("Vocabulary in 8 lines", "", [
        ("modern", "**Central** — scans, connects, consumes data (usually your iPhone). `CBCentralManager`."),
        ("modern", "**Peripheral** — advertises and serves data (the accessory). `CBPeripheralManager` if *you* are the accessory."),
        ("modern", "**GATT** — the attribute database exposed by the peripheral; **ATT** is the wire protocol underneath."),
        ("modern", "**Service** — a named group of characteristics, identified by a `CBUUID` (16-bit for adopted, 128-bit for custom)."),
        ("modern", "**Characteristic** — the actual value + its `properties` (read / write / notify / indicate)."),
        ("modern", "**Descriptor** — metadata about a characteristic; `0x2902` (CCCD) is the notify on/off switch."),
        ("neutral", "**Advertising packet** — ≤31 bytes; carries the local name and service UUIDs you can filter on."),
        ("neutral", "**MTU** — negotiated automatically; `maximumWriteValueLength(for:)` tells you the real payload size (often 20 or 182 bytes)."),
    ]),

    code("Central: setup, scan, connect", "The Info.plist key is `NSBluetoothAlwaysUsageDescription`.", r"""
import CoreBluetooth

final class BLEClient: NSObject {
  private var central: CBCentralManager!
  private var peripheral: CBPeripheral?          // MUST be retained or it deallocates
  private let hrService = CBUUID(string: "180D")
  private let hrMeasure = CBUUID(string: "2A37")

  override init() {
    super.init()
    // A nil queue means every callback arrives on the MAIN queue.
    central = CBCentralManager(delegate: self, queue: .main,
                               options: [CBCentralManagerOptionShowPowerAlertKey: true])
  }
}

extension BLEClient: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    switch c.state {
    case .poweredOn:     c.scanForPeripherals(withServices: [hrService])
    case .unauthorized:  showPermissionHelp()
    case .poweredOff:    showTurnOnBluetooth()
    default:             break        // .resetting, .unsupported, .unknown
    }
  }

  func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber) {
    guard RSSI.intValue > -70 else { return }          // ignore far-away devices
    c.stopScan()                                       // scanning drains the battery
    peripheral = p                                     // retain BEFORE connecting
    p.delegate = self
    c.connect(p, options: nil)                         // no timeout: cancel it yourself
  }

  func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
    p.discoverServices([hrService])
  }

  func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { retry() }

  func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    // error != nil means it dropped; nil means you called cancelPeripheralConnection.
    if error != nil { c.connect(p, options: nil) }     // iOS reconnects when it reappears
  }
}
"""),

    code("Peripheral delegate: discover, subscribe, parse", "", r"""
extension BLEClient: CBPeripheralDelegate {
  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil, let services = p.services else { return }
    for service in services {
      p.discoverCharacteristics([hrMeasure], for: service)
    }
  }

  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    for c in s.characteristics ?? [] {
      if c.properties.contains(.notify)  { p.setNotifyValue(true, for: c) }
      if c.properties.contains(.read)    { p.readValue(for: c) }
    }
  }

  // Fires for BOTH readValue(for:) and every notification.
  func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
    guard error == nil, let data = c.value else { return }
    switch c.uuid {
    case hrMeasure: bpm = Self.parseHeartRate(data)
    default: break
    }
  }

  func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
    // ONLY called for .withResponse writes.
  }

  func peripheralIsReady(toSendWriteWithoutResponse p: CBPeripheral) {
    drainWriteQueue()          // back-pressure signal for .withoutResponse writes
  }
}

// BLE is little-endian; the first byte is a flags bitfield.
static func parseHeartRate(_ data: Data) -> Int {
  let is16Bit = data[0] & 0x01 == 1
  return is16Bit ? Int(UInt16(data[1]) | UInt16(data[2]) << 8) : Int(data[1])
}
"""),

    cmp("Writing data", "Choosing the wrong write type is the most common accessory bug.",
        [("`.withResponse` — reliable", "good", r"""
p.writeValue(payload, for: control, type: .withResponse)

// - acknowledged by the peripheral
// - you get didWriteValueFor(error:)
// - ONE outstanding write at a time
// - slower: ~1 write per connection interval
"""),
         ("`.withoutResponse` — fast", "legacy", r"""
guard p.canSendWriteWithoutResponse else { queue.append(payload); return }
p.writeValue(payload, for: stream, type: .withoutResponse)

// - fire and forget, no callback, can be DROPPED
// - respect canSendWriteWithoutResponse +
//   peripheralIsReady(toSendWriteWithoutResponse:)
// - chunk to maximumWriteValueLength(for: .withoutResponse)
""")]),

    code("Modern wrapper: delegates → AsyncStream", "How to make Core Bluetooth testable and await-able.", r"""
protocol BluetoothClient: Sendable {
  func scan(services: [CBUUID]) -> AsyncStream<DiscoveredDevice>
  func connect(_ id: UUID) async throws
  func values(for characteristic: CBUUID) -> AsyncStream<Data>
  func write(_ data: Data, to characteristic: CBUUID) async throws
}

// Live implementation bridges each delegate callback:
private var discoveries: AsyncStream<DiscoveredDevice>.Continuation?

func scan(services: [CBUUID]) -> AsyncStream<DiscoveredDevice> {
  AsyncStream { continuation in
    discoveries = continuation
    continuation.onTermination = { [weak self] _ in self?.central.stopScan() }
    central.scanForPeripherals(withServices: services)
  }
}

// One-shot calls use a continuation, keyed so the delegate can resume it:
private var connectContinuations: [UUID: CheckedContinuation<Void, Error>] = [:]

func connect(_ id: UUID) async throws {
  try await withCheckedThrowingContinuation { c in
    connectContinuations[id] = c
    central.connect(peripheral(for: id))
  }
}
// In didConnect:   connectContinuations.removeValue(forKey: p.identifier)?.resume()
// In didFail:      ...?.resume(throwing: error)   // exactly once, always
"""),

    rules("Traps that fail interviews", "", [
        ("bad", "Not retaining the `CBPeripheral` — it deallocates and the connection silently dies."),
        ("bad", "Calling anything before `.poweredOn`. Queue your intent and act in `centralManagerDidUpdateState`."),
        ("bad", "Assuming `peripheral.identifier` is stable across devices — it is a per-device, per-app UUID, **not** the MAC address."),
        ("bad", "Forgetting that `didUpdateValueFor` serves both reads and notifications; switch on `characteristic.uuid`."),
        ("bad", "Scanning without a service filter, or never calling `stopScan()` — battery killer, and required for background scanning."),
        ("bad", "Writing more than `maximumWriteValueLength(for:)` — the data is silently truncated or the write fails."),
        ("bad", "Ignoring that iOS **caches the GATT database**; a firmware change may need a Bluetooth toggle or a Service Changed indication."),
        ("legacy", "`connect(_:)` has no timeout. Start your own `Task.sleep` race and call `cancelPeripheralConnection`."),
        ("good", "Serialize commands: BLE has one outstanding operation per connection — use an actor or a command queue."),
    ]),

    table("State & background reference", "",
        ["Topic", "What to say"],
        [["`CBManagerState`", "`.unknown` `.resetting` `.unsupported` `.unauthorized` `.poweredOff` `.poweredOn`"],
         ["Permission", "`NSBluetoothAlwaysUsageDescription` in Info.plist (iOS 13+)"],
         ["Background", "`UIBackgroundModes`: `bluetooth-central` and/or `bluetooth-peripheral`"],
         ["Background scanning", "service UUID filter is **mandatory**; slower duty cycle, no `CBCentralManagerScanOptionAllowDuplicates`"],
         ["State restoration", "`CBCentralManagerOptionRestoreIdentifierKey` + `willRestoreState:` to survive termination"],
         ["Reconnect", "`connect()` a known peripheral — iOS keeps a pending connection indefinitely"],
         ["Finding known devices", "`retrievePeripherals(withIdentifiers:)`, `retrieveConnectedPeripherals(withServices:)`"],
         ["Peripheral role", "`CBPeripheralManager` + `CBMutableService` / `CBMutableCharacteristic` + `startAdvertising`"],
         ["Throughput", "notify ≫ read; batch into the MTU; expect ~1–5 KB/s in practice"],
         ["Testing", "hide it behind a protocol; simulator has no Bluetooth radio"]]),
])


# ==========================================================================
# Testing
# ==========================================================================

TESTING = sheet("testing", "Testing Approaches on iOS", PRACTICE,
    "What to test, at which layer, with which tool — and how to keep it fast.", [

    diagram("The pyramid, iOS edition",
            "Ratios are a heuristic, not a law — but be ready to defend the shape.",
            D.test_pyramid()),

    diagram("Test doubles",
            "Say the right name and show the Swift version: a struct of closures does all five.",
            D.test_doubles()),

    table("Tooling matrix", "",
        ["Tool", "Layer", "Use it for"],
        [["Swift Testing (`@Test`, `#expect`)", "unit", "default for new code: parallel, parameterised, clear failures"],
         ["XCTest", "unit / integration", "existing suites, performance tests, `XCTestExpectation`"],
         ["XCUITest", "UI / E2E", "black-box journeys; `app.launchArguments` to inject a stub environment"],
         ["`URLProtocol` subclass", "integration", "deterministic networking without a server"],
         ["swift-snapshot-testing", "UI", "pixel/text snapshots of views, layouts, and even JSON"],
         ["ViewInspector", "UI", "unit-testing SwiftUI view trees without rendering"],
         ["TCA `TestStore`", "unit", "exhaustive state + effect assertions"],
         ["`XCTMetric` / `measure { }`", "performance", "guard against regressions in hot paths"],
         ["`addTeardownBlock` + `weak`", "unit", "memory-leak assertions"],
         ["Xcode test plans", "all", "per-configuration runs, sanitizers, code coverage, retry-on-failure"]]),

    code("Design for testability: inject the seam", "The single most valuable answer to \"how would you test this?\"", r"""
// 1. Wrap the untestable thing in a value you can substitute.
struct WeatherClient: Sendable {
  var current: @Sendable (String) async throws -> Weather
}

extension WeatherClient {
  static let live = Self { city in
    let (data, _) = try await URLSession.shared.data(from: .weather(city))
    return try JSONDecoder().decode(Weather.self, from: data)
  }
  static func stub(_ weather: Weather) -> Self { Self { _ in weather } }
  static let failing = Self { _ in throw URLError(.notConnectedToInternet) }
}

// 2. The system under test only knows the seam.
@MainActor @Observable
final class WeatherViewModel {
  private let client: WeatherClient
  private(set) var state: ViewState = .idle
  init(client: WeatherClient = .live) { self.client = client }

  func load(_ city: String) async {
    state = .loading
    do    { state = .loaded(try await client.current(city)) }
    catch { state = .failed(error) }
  }
}

// 3. Tests are now trivial, fast and deterministic.
@Test func showsFailure_whenTheNetworkIsDown() async {
  let sut = WeatherViewModel(client: .failing)
  await sut.load("Bogotá")
  #expect(sut.state.isFailed)
}
"""),

    cmp("Swift Testing vs XCTest", "Know both; new projects default to Swift Testing.",
        [("Swift Testing (Xcode 16+)", "modern", r"""
import Testing

@Suite("Cart")
struct CartTests {
  let sut = Cart()                       // fresh per test, runs in parallel

  @Test("adds an item")
  func add() {
    sut.add(.mock)
    #expect(sut.items.count == 1)
  }

  @Test(arguments: [0, -1, -99])
  func rejectsNonPositive(_ qty: Int) {
    #expect(throws: CartError.self) { try sut.add(.mock, qty: qty) }
  }

  @Test func unwraps() throws {
    let item = try #require(sut.items.first)
    #expect(item.price > 0)
  }

  @Test(.disabled("flaky on CI"), .tags(.network))
  func slow() async { }
}
"""),
         ("XCTest", "legacy", r"""
import XCTest

final class CartTests: XCTestCase {
  var sut: Cart!
  override func setUp() { super.setUp(); sut = Cart() }
  override func tearDown() { sut = nil; super.tearDown() }

  func test_add_appendsItem() {
    sut.add(.mock)
    XCTAssertEqual(sut.items.count, 1)
  }

  func test_throwsOnZeroQuantity() {
    XCTAssertThrowsError(try sut.add(.mock, qty: 0))
  }

  func test_asyncLoad() async throws {
    let item = try XCTUnwrap(sut.items.first)
    XCTAssertGreaterThan(item.price, 0)
  }
}
""")]),

    code("Deterministic networking with URLProtocol", "No server, no waiting, no flakes.", r"""
final class StubURLProtocol: URLProtocol {
  nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for r: URLRequest) -> URLRequest { r }

  override func startLoading() {
    guard let handler = Self.handler else { return }
    do {
      let (response, data) = try handler(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }
  override func stopLoading() { }
}

// In the test
let config = URLSessionConfiguration.ephemeral
config.protocolClasses = [StubURLProtocol.self]
let session = URLSession(configuration: config)

StubURLProtocol.handler = { request in
  #expect(request.url?.path == "/v1/weather")
  return (HTTPURLResponse(url: request.url!, statusCode: 200,
                          httpVersion: nil, headerFields: nil)!,
          Data(#"{"temp": 21}"#.utf8))
}
"""),

    code("Async, UI and leak tests", "", r"""
// Async without expectations
@Test func loadsFeed() async throws {
  let items = try await sut.loadFeed()
  #expect(items.count == 3)
}

// XCTest expectation (callback APIs, notifications)
func test_notifiesOnSave() {
  let exp = expectation(description: "saved")
  sut.onSave = { exp.fulfill() }
  sut.save()
  wait(for: [exp], timeout: 1.0)
}

// UI test with an injected stub backend
func test_checkoutJourney() {
  let app = XCUIApplication()
  app.launchArguments = ["-UITest", "-StubScenario", "happyPath"]
  app.launch()
  app.buttons["addToCart"].tap()
  app.buttons["checkout"].tap()
  XCTAssertTrue(app.staticTexts["Order confirmed"].waitForExistence(timeout: 5))
}

// Memory-leak assertion, reusable in every test
func assertNoLeak(_ instance: AnyObject, file: StaticString = #filePath, line: UInt = #line) {
  addTeardownBlock { [weak instance] in
    XCTAssertNil(instance, "Potential retain cycle", file: file, line: line)
  }
}
"""),

    rules("Principles worth stating out loud", "", [
        ("good", "Test **behaviour through the public API**, not private implementation — otherwise every refactor breaks the suite."),
        ("good", "Inject `Date`, `UUID`, randomness, the clock and the network. Anything else is a flake waiting to happen."),
        ("good", "One reason to fail per test; the name should read as a specification: `test_whenOffline_showsCachedResults`."),
        ("good", "Prefer **fakes over mocks**: an in-memory repository survives refactors, a strict mock does not."),
        ("good", "Snapshot tests are great for design systems, painful for whole screens — scope them tightly."),
        ("bad", "Sleeping in tests (`Thread.sleep`, `wait(for:timeout:5)`) — use a `TestClock` or an injected scheduler."),
        ("bad", "Shared singletons/`UserDefaults.standard` between tests — parallel execution will find you."),
        ("bad", "Chasing 100% coverage; coverage is a smoke detector, not a goal."),
        ("neutral", "TDD in an interview: state the cycle (red → green → refactor) and *actually* write the failing test first if asked."),
    ]),
])


# ==========================================================================
# Architecture
# ==========================================================================

ARCH = sheet("architecture", "Architectural Approaches", PRACTICE,
    "Draw the data flow, name the trade-off, and justify the choice for the team's size.", [

    diagram("Four data flows",
            "If you can draw these on a whiteboard you can answer almost any architecture question.",
            D.arch_flows()),

    diagram("Clean Architecture layers",
            "The only rule that matters: dependencies point inward. Everything else is naming.",
            D.arch_clean()),

    table("Comparison", "",
        ["Pattern", "Strength", "Weakness", "Testability", "Best for"],
        [["MVC (Apple)", "trivial to start, zero ceremony", "Massive View Controller", "low", "prototypes, tiny screens"],
         ["MVP", "passive view, explicit contract", "protocol boilerplate", "high", "UIKit teams migrating off MVC"],
         ["MVVM", "bindings, works natively with SwiftUI", "says nothing about navigation or side effects", "high", "most SwiftUI apps"],
         ["VIPER", "strict boundaries, router for navigation", "5 files per screen", "very high", "large UIKit codebases, many teams"],
         ["Clean / Onion", "domain independent of frameworks", "mapping layers everywhere", "very high", "long-lived, multi-platform domains"],
         ["Redux / TCA", "one state, replayable, exhaustive tests", "learning curve, ceremony for small screens", "very high", "complex state, deep navigation"],
         ["Coordinator", "removes navigation from view controllers", "an extra object graph to own", "high", "any UIKit app, pairs with MVVM"]]),

    code("MVVM done properly", "The view is dumb, the view model is pure logic, the model is injected.", r"""
@MainActor @Observable
final class ProfileViewModel {
  enum State: Equatable { case idle, loading, loaded(User), failed(String) }

  private(set) var state: State = .idle
  private let repository: UserRepositing        // a protocol -> injectable
  private let analytics: (String) -> Void

  init(repository: UserRepositing, analytics: @escaping (String) -> Void = { _ in }) {
    self.repository = repository
    self.analytics = analytics
  }

  func onAppear() async {
    state = .loading
    do {
      state = .loaded(try await repository.currentUser())
      analytics("profile_loaded")
    } catch {
      state = .failed(error.localizedDescription)
    }
  }
}

struct ProfileView: View {
  @State private var vm: ProfileViewModel
  var body: some View {
    Group {
      switch vm.state {
      case .idle, .loading: ProgressView()
      case .loaded(let u):  ProfileDetail(user: u)
      case .failed(let m):  ErrorView(message: m) { Task { await vm.onAppear() } }
      }
    }
    .task { await vm.onAppear() }
  }
}
"""),

    code("Repository + Use Case (the Clean core)", "Protocols live in the domain; implementations live outside.", r"""
// ---- Domain (no UIKit, no URLSession, no CoreData) ----
struct Order: Equatable, Sendable { let id: UUID; let total: Decimal; var state: State }

protocol OrderRepositing: Sendable {                 // declared BY the domain
  func order(id: UUID) async throws -> Order
  func save(_ order: Order) async throws
}

struct CancelOrder: Sendable {                       // a use case = one verb
  let repository: OrderRepositing
  let now: @Sendable () -> Date

  func callAsFunction(id: UUID) async throws -> Order {
    var order = try await repository.order(id: id)
    guard order.state == .placed else { throw OrderError.notCancellable }
    order.state = .cancelled(at: now())
    try await repository.save(order)
    return order
  }
}

// ---- Data layer (outer ring) satisfies the protocol ----
struct RemoteOrderRepository: OrderRepositing {
  let api: APIClient
  func order(id: UUID) async throws -> Order { try await api.get("/orders/\(id)").toDomain() }
  func save(_ order: Order) async throws { try await api.put("/orders", order.toDTO()) }
}

// ---- Test ----
let sut = CancelOrder(repository: InMemoryOrderRepository(.placed), now: { .fixed })
#expect(try await sut(id: id).state == .cancelled(at: .fixed))
"""),

    code("Coordinator pattern (UIKit navigation)", "Takes navigation out of the view controller.", r"""
protocol Coordinator: AnyObject {
  var children: [Coordinator] { get set }
  func start()
}

final class CheckoutCoordinator: Coordinator {
  var children: [Coordinator] = []
  private let navigation: UINavigationController
  private let onFinish: () -> Void

  init(navigation: UINavigationController, onFinish: @escaping () -> Void) {
    self.navigation = navigation
    self.onFinish = onFinish
  }

  func start() {
    let vm = CartViewModel(onCheckout: { [weak self] in self?.showPayment() })
    navigation.pushViewController(CartViewController(viewModel: vm), animated: true)
  }

  private func showPayment() {
    let vc = PaymentViewController(onSuccess: { [weak self] in
      self?.navigation.popToRootViewController(animated: true)
      self?.onFinish()
    })
    navigation.pushViewController(vc, animated: true)
  }
}
// SwiftUI equivalent: a Router @Observable object holding `var path: [Route]`.
"""),

    code("Unidirectional flow without a library", "Shows you understand *why* TCA looks the way it does.", r"""
@MainActor @Observable
final class Store<State, Action> {
  private(set) var state: State
  private let reduce: (inout State, Action) -> Effect<Action>

  init(initial: State, reduce: @escaping (inout State, Action) -> Effect<Action>) {
    self.state = initial
    self.reduce = reduce
  }

  func send(_ action: Action) {
    let effect = reduce(&state, action)          // pure, synchronous
    Task { for await next in effect.actions { send(next) } }   // side effects re-enter
  }
}

enum CounterAction { case increment, factResponse(String) }

let reducer: (inout CounterState, CounterAction) -> Effect<CounterAction> = { state, action in
  switch action {
  case .increment:
    state.count += 1
    return .run { [n = state.count] in .factResponse(await api.fact(n)) }
  case .factResponse(let fact):
    state.fact = fact
    return .none
  }
}
"""),

    rules("How to answer \"which architecture would you use?\"", "", [
        ("good", "Start with the **constraints**: team size, app lifetime, testing bar, SwiftUI vs UIKit, how much shared state there is."),
        ("good", "Name the invariants you want: one source of truth, no logic in views, navigation as data, framework-free domain."),
        ("good", "Then pick the lightest pattern that gives them — usually MVVM + repositories for SwiftUI, TCA when state is genuinely complex."),
        ("neutral", "Say what you'd **not** do: no architecture astronautics on a 5-screen app; no VIPER for a prototype."),
        ("neutral", "Mention the seams that matter more than the acronym: DI, a testable domain, and navigation modelled as state."),
        ("bad", "Avoid answering with a single acronym and no trade-off — that is the actual failure mode."),
    ]),
])


# ==========================================================================
# Modularization
# ==========================================================================

MODULES = sheet("modularization", "Modularization Approaches", PRACTICE,
    "Split by feature, invert with interfaces, keep the graph acyclic — and watch build times fall.", [

    diagram("A module graph that scales",
            "Four layers, arrows only ever point down. This is the picture to draw.",
            D.mod_layers()),

    diagram("Interface modules + strategy comparison",
            "How to break a dependency between two features without a shared 'Common' blob.",
            D.mod_interface()),

    rules("Why modularize at all", "Have concrete reasons ready; \"cleanliness\" is not one.", [
        ("good", "**Build times** — only the changed module and its dependents recompile."),
        ("good", "**Enforced boundaries** — `internal` is invisible across modules, so architecture becomes compiler-checked."),
        ("good", "**Parallel teams** — clear ownership, fewer merge conflicts in one giant project file."),
        ("good", "**Faster feedback** — run one module's tests, or launch a tiny preview app for one feature."),
        ("good", "**Reuse** — share a design system or networking layer with an extension, watch app, or second product."),
        ("bad", "Cost: more setup, dependency-injection plumbing, resource/bundle handling, and versioning discipline."),
    ]),

    code("Package.swift for a feature module", "One package can hold many targets — start there before many packages.", r"""
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Modules",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "FeatureCheckout", targets: ["FeatureCheckout"]),
    .library(name: "CatalogInterface", targets: ["CatalogInterface"]),
  ],
  dependencies: [
    .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.15.0")
  ],
  targets: [
    .target(name: "CatalogInterface"),                       // protocols + models only

    .target(name: "FeatureCheckout",
            dependencies: [
              "CatalogInterface", "DomainKit", "DesignSystem",
              .product(name: "ComposableArchitecture", package: "swift-composable-architecture")
            ],
            resources: [.process("Resources")],
            swiftSettings: [.swiftLanguageMode(.v6)]),

    .target(name: "CatalogLive", dependencies: ["CatalogInterface", "CoreNetworking"]),

    .testTarget(name: "FeatureCheckoutTests",
                dependencies: ["FeatureCheckout", "CatalogMock", "CoreTesting"]),
  ]
)
"""),

    code("Interface module + composition root", "Dependency inversion at module scale.", r"""
// ---------- CatalogInterface (tiny, stable, no heavy imports) ----------
public protocol CatalogService: Sendable {
  func products(matching query: String) async throws -> [Product]
}
public struct Product: Identifiable, Sendable, Equatable { public let id: UUID; public let name: String }

// ---------- FeatureCheckout: imports the INTERFACE only ----------
import CatalogInterface

public struct CheckoutView: View {
  private let catalog: any CatalogService          // never knows the concrete type
  public init(catalog: any CatalogService) { self.catalog = catalog }
}

// ---------- CatalogLive: the heavy implementation ----------
import CatalogInterface
public struct LiveCatalog: CatalogService { ... }

// ---------- App: the ONLY place that sees both ----------
import FeatureCheckout
import CatalogLive

@main struct MyApp: App {
  var body: some Scene {
    WindowGroup { CheckoutView(catalog: LiveCatalog(client: .live)) }
  }
}
// Tests & previews inject CatalogMock instead - no rebuild of CatalogLive.
"""),

    code("Access control is the enforcement mechanism", "", r"""
public struct PaymentSheet: View {        // visible to other modules
  public init(...) { }                    // public types need an explicit public init!
  internal let engine: Engine             // module-only (the default)
  private var attempts = 0                // file/type-only
  fileprivate func log() { }
}

open class Themable { }                   // subclassable outside the module
package func sharedHelper() { }           // Swift 5.9: visible to the same package only

@_exported import CatalogInterface        // re-export so consumers get it for free
                                          // (convenient, but leaks your dependency graph)

// Rule of thumb: default to internal, promote to public deliberately.
// The public surface IS the module's contract - review it like an API.
"""),

    table("Choosing a strategy", "",
        ["Strategy", "Looks like", "Use when"],
        [["Single app target", "everything in the app", "solo dev, prototype, < ~20 screens"],
         ["Layer-based", "`UI`, `Domain`, `Data`", "small team wanting rules without much plumbing"],
         ["Feature-based", "`FeatureCart`, `FeatureSearch`", "multiple squads; the common default"],
         ["Feature + interface modules", "`XInterface` / `XLive` / `XMock`", "big codebase where build time and previews matter"],
         ["Local SPM packages", "one `Package.swift`, many targets", "start here — cheapest, fully Xcode-native"],
         ["Separate repos + versions", "one package per repo", "genuine reuse across products; adds release overhead"],
         ["Tuist / XcodeGen", "generated projects", "many modules and you're tired of `.xcodeproj` conflicts"]]),

    rules("Pitfalls", "", [
        ("bad", "A **`Common`/`Utils`/`Shared` module** everything depends on — it becomes the new monolith and rebuilds constantly."),
        ("bad", "**Cyclic dependencies** — SPM refuses them; the fix is an interface module or moving the shared type down a layer."),
        ("bad", "**Over-modularization** — 80 micro-modules cost more in linking and DI wiring than they save."),
        ("bad", "Feature A importing Feature B. Features should be siblings that only meet in the app or via an interface module."),
        ("bad", "Forgetting `Bundle.module` for resources, or localizing strings in the wrong bundle."),
        ("legacy", "Mixing dynamic and static linking carelessly — too many dynamic frameworks slows app launch."),
        ("good", "Give every module a test target and, ideally, a runnable preview/demo app."),
        ("good", "Enforce the graph in CI (a dependency-lint step) — documentation alone never holds."),
    ]),
])
