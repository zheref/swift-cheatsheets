"""Extra sheets: Clean Code in Swift, and wiring Combine into SwiftUI."""

from render import sheet, code, cmp, rules, table

CLEAN = sheet("clean-code", "Clean Code in Swift", "Design & Language",
    "Naming, functions, comments, errors, tests — the reviewable habits, with Swift-flavoured examples.", [

    rules("The short version", "If you can only remember five things.", [
        ("modern", "**Names reveal intent.** A good name removes the need for a comment."),
        ("modern", "**Functions do one thing**, at one level of abstraction, and are small."),
        ("modern", "**Fewer arguments is better.** 0 > 1 > 2 > 3. Flags are a smell."),
        ("modern", "**No surprises.** A function's name should predict its side effects — ideally there are none."),
        ("modern", "**The boy scout rule.** Leave the code cleaner than you found it; refactor in small, safe steps."),
        ("neutral", "Clean code is optimised for *reading*. Code is read far more often than it is written."),
    ]),

    cmp("Naming", "Intention-revealing, pronounceable, searchable, no encodings.",
        [("Don't", "bad", r"""
var d: Int                     // elapsed time in days
var list1: [User]
var flag = false
let strName: String            // Hungarian notation
func proc(_ a: [User]) -> [User]

func getUserData() -> Data     // "data"? "info"? "manager"?
class UserInfoDataManagerHelper { }

if user.t == 2 { ... }         // magic number
"""),
         ("Do", "good", r"""
var elapsedDays: Int
var activeUsers: [User]
var isEligibleForRefund = false
let customerName: String
func removingBannedUsers(from users: [User]) -> [User]

func fetchUserProfile() async throws -> UserProfile
struct UserProfileRepository { }

enum AccountTier: Int { case free, plus, pro }
if user.tier == .pro { ... }

// Swift API Design Guidelines:
//   mutating -> imperative verb:  array.sort()
//   nonmutating -> -ed/-ing noun: array.sorted()
""")]),

    cmp("Functions: small, one level of abstraction", "Extract until you cannot extract anymore.",
        [("Before", "bad", r"""
func checkout(_ cart: Cart) throws -> Receipt {
  var total: Decimal = 0
  for item in cart.items {
    guard item.stock > 0 else { throw CheckoutError.outOfStock(item.id) }
    var price = item.price
    if item.isOnSale { price *= 0.8 }
    if cart.user.tier == .pro { price *= 0.9 }
    total += price * Decimal(item.quantity)
  }
  if total > 100 { total -= 5 }
  let tax = total * 0.21
  let charge = total + tax
  let token = try payments.charge(charge)
  analytics.log("checkout", ["total": charge])
  return Receipt(total: charge, tax: tax, token: token)
}
"""),
         ("After", "good", r"""
func checkout(_ cart: Cart) throws -> Receipt {
  try validateStock(cart)
  let subtotal = subtotal(for: cart)
  let discounted = applyOrderDiscounts(to: subtotal)
  let tax = taxAmount(on: discounted)
  let token = try payments.charge(discounted + tax)
  analytics.log(.checkout(total: discounted + tax))
  return Receipt(total: discounted + tax, tax: tax, token: token)
}

private func price(of item: CartItem, for tier: AccountTier) -> Decimal {
  item.price * item.saleMultiplier * tier.discountMultiplier
}
// Each helper sits at ONE level of abstraction, and each is unit-testable.
""")]),

    cmp("Arguments & flag parameters", "A boolean argument means the function does two things.",
        [("Don't", "bad", r"""
func render(_ user: User, _ compact: Bool, _ animated: Bool) { ... }
render(user, true, false)          // unreadable at the call site

func save(_ item: Item, validate: Bool = true) {
  if validate { ... }
  store.write(item)
}
"""),
         ("Do", "good", r"""
enum RowStyle { case compact, expanded }
func render(_ user: User, style: RowStyle, animation: Animation?) { ... }
render(user, style: .compact, animation: nil)

func save(_ item: Item) throws { try validate(item); store.write(item) }
func saveWithoutValidation(_ item: Item) { store.write(item) }

// >3 arguments? Introduce a parameter object.
struct SearchQuery { let text: String; let page: Int; let filters: [Filter] }
func search(_ query: SearchQuery) async throws -> [Result]
""")]),

    cmp("Comments", "Comments explain WHY. Code explains WHAT.",
        [("Noise", "bad", r"""
// increment the counter by one
counter += 1

// MARK: - Properties
var name: String        // the name

/*
func oldImplementation() {   // dead code, delete it
   ...
}
*/

// TODO: fix this (2019)
"""),
         ("Useful", "good", r"""
// The server returns 200 with an empty body when the token has
// expired (see BUG-4821); treat it as unauthenticated.
guard !data.isEmpty else { throw APIError.unauthenticated }

/// Returns the users who can be refunded.
/// - Note: Only orders under 30 days old are eligible.
func refundableUsers() -> [User]

// Prefer making it self-documenting instead of commenting:
let isRefundEligible = order.age < .days(30) && order.state == .delivered
""")]),

    cmp("Error handling over sentinel values", "",
        [("Don't", "bad", r"""
func loadUser(id: String) -> User? {
  guard let data = try? Data(contentsOf: url) else { return nil }
  return try? JSONDecoder().decode(User.self, from: data)
}
// Caller has no idea WHY it failed.

func parse(_ s: String) -> Int { Int(s) ?? -1 }   // magic sentinel

if result == nil { /* network? decoding? not found? */ }
"""),
         ("Do", "good", r"""
enum UserError: Error {
  case notFound(id: String)
  case decoding(underlying: Error)
}

func loadUser(id: String) async throws -> User {
  let data = try await api.data(for: id)
  do { return try JSONDecoder().decode(User.self, from: data) }
  catch { throw UserError.decoding(underlying: error) }
}

// Return empty collections, not nil.
func tags() -> [Tag] { stored ?? [] }
""")]),

    rules("Code smells checklist", "Say these names when reviewing code out loud.", [
        ("bad", "**Long function / god object** — many reasons to change, hard to name."),
        ("bad", "**Deep nesting** — invert conditions and use `guard` for early exit."),
        ("bad", "**Duplicated logic** — the third copy is when you extract."),
        ("bad", "**Primitive obsession** — `String` for an id/email; use a typed wrapper."),
        ("bad", "**Feature envy** — a method that mostly touches another type's data; move it."),
        ("bad", "**Shotgun surgery** — one change forces edits in ten files; the abstraction is wrong."),
        ("bad", "**Temporal coupling** — `configure()` must be called before `start()`; enforce it in the initialiser."),
        ("bad", "**Boolean blindness** — several `Bool`s that encode one state; use an `enum`."),
    ]),

    cmp("Guard clauses & the arrow anti-pattern", "",
        [("Nested", "bad", r"""
func handle(_ response: Response?) {
  if let response {
    if response.statusCode == 200 {
      if let body = response.body {
        if !body.isEmpty {
          process(body)
        }
      }
    }
  }
}
"""),
         ("Flat", "good", r"""
func handle(_ response: Response?) {
  guard let response else { return }
  guard response.statusCode == 200 else { return log(.badStatus) }
  guard let body = response.body, !body.isEmpty else { return }
  process(body)
}
// Happy path stays at the left margin.
""")]),

    code("Typed wrappers beat primitives", "Cheap in Swift, and the compiler catches whole bug classes.", r"""
struct UserID: Hashable, Codable, RawRepresentable { let rawValue: String }
struct Email: Hashable {
  let value: String
  init?(_ raw: String) {
    guard raw.contains("@") else { return nil }   // parse, don't validate later
    value = raw
  }
}

func message(from: UserID, to: UserID) { }
message(from: sender, to: recipient)     // can't accidentally swap with an order id

// Units
struct Meters: Numeric { ... }
let distance: Meters = 400
"""),

    rules("Clean tests (F.I.R.S.T.)", "", [
        ("good", "**Fast** — milliseconds. No network, no sleeps: inject a clock."),
        ("good", "**Independent** — order must not matter; no shared mutable state between tests."),
        ("good", "**Repeatable** — inject `Date`, `UUID`, randomness. No flakiness."),
        ("good", "**Self-validating** — a pass/fail assertion, never manual inspection of a log."),
        ("good", "**Timely** — written with (or before) the code."),
        ("neutral", "One logical assertion per test; name it `test_whenX_thenY`. Arrange / Act / Assert structure."),
    ]),

    code("Arrange–Act–Assert", "", r"""
@Test
func refund_isRejected_whenOrderIsOlderThan30Days() throws {
  // Arrange
  let order = Order.stub(placedAt: .distantPast, state: .delivered)
  let sut = RefundService(now: { .fixed })      // injected clock -> repeatable

  // Act
  let result = sut.eligibility(for: order)

  // Assert
  #expect(result == .rejected(reason: .expired))
}

// "sut" = system under test. Keep stubs in factory helpers so the
// test body shows only what is RELEVANT to this case.
"""),

    table("Uncle Bob rule → Swift idiom", "",
        ["Clean Code rule", "Swift way to satisfy it"],
        [["Avoid `null`", "`Optional` + `guard let`; return empty collections"],
         ["Don't return error codes", "`throws` + typed `Error` enums, or `Result`"],
         ["Prefer polymorphism to `switch`", "protocols, or an `enum` when the set is closed"],
         ["Encapsulate conditionals", "computed properties: `var isEligible: Bool`"],
         ["Avoid output arguments", "return values; `inout` only for local, obvious mutation"],
         ["Keep classes small (SRP)", "`struct` + protocol composition; extensions per concern"],
         ["Dependency injection", "initialiser injection, closures, `@Dependency` in TCA"],
         ["Separate construction from use", "factories, `Builder`, DI container / composition root"]]),
])


SWIFTUI_COMBINE = sheet("swiftui-combine", "SwiftUI + Combine — Wiring Them Together", "Combine",
    "Where Combine plugs into a SwiftUI view, and what replaced it in the Observation era.", [

    rules("The connection points", "There are only a handful. Know all of them.", [
        ("modern", "`ObservableObject` + `@Published` — the object *is* a publisher; SwiftUI subscribes to `objectWillChange`."),
        ("modern", "`.onReceive(publisher) { value in }` — subscribe to any publisher for the view's lifetime."),
        ("modern", "`assign(to: &$published)` — pipe a publisher straight into a `@Published` property (no cancellable needed)."),
        ("modern", "`objectWillChange.send()` — manual notification when you don't use `@Published`."),
        ("modern", "`.task { for await x in publisher.values { } }` — bridge Combine into structured concurrency."),
        ("legacy", "With `@Observable` (iOS 17+) there is no `objectWillChange` and no `@Published`; Combine becomes an *input* only."),
    ]),

    code("The classic ViewModel", "Combine-powered `ObservableObject`, driving a SwiftUI view.", r"""
@MainActor
final class SearchViewModel: ObservableObject {
  @Published var query = ""                       // input from the view
  @Published private(set) var results: [Repo] = []
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?

  private var cancellables = Set<AnyCancellable>()

  init(api: API = .live) {
    $query
      .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
      .removeDuplicates()
      .filter { $0.count >= 2 }
      .handleEvents(receiveOutput: { [weak self] _ in self?.isLoading = true })
      .map { q in
        api.search(q)
          .catch { _ in Just<[Repo]>([]) }        // keep the OUTER stream alive
      }
      .switchToLatest()                            // cancels the previous request
      .receive(on: RunLoop.main)
      .handleEvents(receiveOutput: { [weak self] _ in self?.isLoading = false })
      .assign(to: &$results)                       // no cancellable to store
  }
}

struct SearchView: View {
  @StateObject private var vm = SearchViewModel()

  var body: some View {
    List(vm.results) { RepoRow($0) }
      .searchable(text: $vm.query)                 // two-way binding into @Published
      .overlay { if vm.isLoading { ProgressView() } }
  }
}
"""),

    code("Derived / validated state", "`CombineLatest` is the idiomatic form-validation answer.", r"""
final class SignUpViewModel: ObservableObject {
  @Published var email = ""
  @Published var password = ""
  @Published var confirmation = ""
  @Published private(set) var isValid = false
  @Published private(set) var passwordHint: String?

  private var bag = Set<AnyCancellable>()

  init() {
    let validEmail = $email.map { $0.contains("@") && $0.count > 5 }
    let validPassword = Publishers.CombineLatest($password, $confirmation)
      .map { pwd, confirm in pwd.count >= 8 && pwd == confirm }

    Publishers.CombineLatest(validEmail, validPassword)
      .map { $0 && $1 }
      .removeDuplicates()
      .assign(to: &$isValid)

    $password
      .map { $0.count >= 8 ? nil : "At least 8 characters" }
      .assign(to: &$passwordHint)
  }
}

// View
Button("Create account") { vm.submit() }
  .disabled(!vm.isValid)
"""),

    cmp("onReceive vs a ViewModel pipeline", "Use `onReceive` for system publishers; use the VM for business logic.",
        [("onReceive — view-local", "good", r"""
struct ClockView: View {
  @State private var now = Date()
  private let timer = Timer
    .publish(every: 1, on: .main, in: .common)
    .autoconnect()

  var body: some View {
    Text(now, format: .dateTime.hour().minute().second())
      .onReceive(timer) { now = $0 }
  }
}

// Also great for system notifications:
.onReceive(NotificationCenter.default.publisher(
    for: UIApplication.willEnterForegroundNotification)) { _ in
  Task { await vm.refresh() }
}
"""),
         ("Don't put logic here", "bad", r"""
struct FeedView: View {
  @State private var items: [Item] = []

  var body: some View {
    List(items) { ... }
      .onReceive(api.feed()
        .retry(3)
        .replaceError(with: [])
        .receive(on: RunLoop.main)) { items = $0 }
  }
}
// The publisher is REBUILT on every body evaluation ->
// resubscribes, refires, and is impossible to unit test.
""")]),

    code("Manual objectWillChange", "When your state isn't in `@Published` properties.", r"""
final class Document: ObservableObject {
  private(set) var text: String = "" {
    willSet { objectWillChange.send() }    // must fire BEFORE the change
  }

  func append(_ s: String) { text += s }
}

// Republishing a child object's changes to the parent
final class Parent: ObservableObject {
  @Published var child = Child()
  private var bag = Set<AnyCancellable>()

  init() {
    child.objectWillChange
      .sink { [weak self] in self?.objectWillChange.send() }
      .store(in: &bag)                     // nested ObservableObjects are NOT automatic
  }
}
"""),

    cmp("Combine VM vs @Observable VM", "Same screen, before and after iOS 17.",
        [("Combine / ObservableObject", "legacy", r"""
@MainActor
final class CartVM: ObservableObject {
  @Published private(set) var items: [Item] = []
  @Published private(set) var total: Decimal = 0
  private var bag = Set<AnyCancellable>()

  init() {
    $items
      .map { $0.reduce(0) { $0 + $1.price } }
      .assign(to: &$total)
  }
}

struct CartView: View {
  @StateObject private var vm = CartVM()
  var body: some View { Text("\(vm.total)") }
}
// Whole view re-renders when ANY @Published changes.
"""),
         ("Observation (iOS 17+)", "modern", r"""
@MainActor @Observable
final class CartVM {
  private(set) var items: [Item] = []
  var total: Decimal {                       // just a computed property
    items.reduce(0) { $0 + $1.price }
  }
  func load() async { items = await api.cart() }
}

struct CartView: View {
  @State private var vm = CartVM()
  var body: some View {
    Text("\(vm.total)").task { await vm.load() }
  }
}
// Re-renders only the views that actually READ `total`.
""")]),

    code("Bridging both ways inside a view", "Combine in, async out — and vice versa.", r"""
// Combine publisher -> async iteration, scoped to the view's lifetime
.task {
  for await location in locationManager.publisher.values {
    region = MKCoordinateRegion(center: location.coordinate, span: span)
  }
}

// @Observable model that still consumes a legacy Combine API
@Observable
final class LocationModel {
  private(set) var last: CLLocation?
  @ObservationIgnored private var bag = Set<AnyCancellable>()

  init(service: LegacyLocationService) {
    service.publisher
      .receive(on: RunLoop.main)
      .sink { [weak self] in self?.last = $0 }   // plain assignment triggers Observation
      .store(in: &bag)
  }
}
"""),

    rules("SwiftUI + Combine pitfalls", "", [
        ("bad", "Building a publisher inside `body` / `onReceive(...)` — it is recreated every render. Build it in `init` or store it in a `let`."),
        ("bad", "`@ObservedObject var vm = VM()` — recreated on each render. Use `@StateObject` (or `@State` with `@Observable`)."),
        ("bad", "Forgetting `.receive(on: RunLoop.main)` before touching UI state (or mark the VM `@MainActor`)."),
        ("bad", "An error reaching the outer publisher kills the stream permanently — `catch` inside the `flatMap`/`map`+`switchToLatest`."),
        ("bad", "`assign(to: \\.x, on: self)` retains `self`. Prefer `assign(to: &$published)` or `sink { [weak self] }`."),
        ("bad", "Nested `ObservableObject`s don't propagate; forward `objectWillChange` manually or flatten the model."),
        ("good", "`DispatchQueue.main` vs `RunLoop.main`: `RunLoop.main` pauses during scroll tracking (often what you want for search); `DispatchQueue.main` always delivers."),
        ("neutral", "New code: prefer `@Observable` + `async/await`; keep Combine for `debounce`/`throttle`/multi-source merges and legacy APIs."),
    ]),

    table("SwiftUI ← publisher connection cheat table", "",
        ["Goal", "Code"],
        [["React to a publisher in a view", "`.onReceive(pub) { value in ... }`"],
         ["Drive a `@Published` from a publisher", "`pub.assign(to: &$property)`"],
         ["Drive any property, manual lifetime", "`pub.sink { [weak self] ... }.store(in: &bag)`"],
         ["Two-way binding to a VM property", "`$vm.query` (needs `@Published var`, non-private setter)"],
         ["Timer in a view", "`Timer.publish(...).autoconnect()` + `.onReceive`"],
         ["System notification", "`NotificationCenter.default.publisher(for:)` + `.onReceive`"],
         ["Scene phase / lifecycle", "`@Environment(\\.scenePhase)` + `.onChange(of:)`"],
         ["Publisher → async", "`for await v in pub.values` inside `.task { }`"],
         ["Force a refresh without `@Published`", "`objectWillChange.send()`"]]),
])
