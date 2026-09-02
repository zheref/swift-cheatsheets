"""SOLID, functional programming and Swift language essentials cheat sheets."""

from render import sheet, code, cmp, rules, table

G = "Design & Language"

SOLID = sheet("solid", "SOLID in Swift", G,
    "Five principles, one concrete Swift example each. Say the name, then the smell it prevents.", [

    rules("The one-line versions", "", [
        ("modern", "**S**ingle Responsibility — a type has one reason to change."),
        ("modern", "**O**pen/Closed — open for extension, closed for modification."),
        ("modern", "**L**iskov Substitution — a subtype must be usable anywhere its supertype is, without surprises."),
        ("modern", "**I**nterface Segregation — many small protocols beat one fat protocol."),
        ("modern", "**D**ependency Inversion — depend on abstractions, and let the caller supply them."),
        ("neutral", "In Swift, protocols + value types + closures do most of the work; you rarely need class hierarchies."),
    ]),

    cmp("S — Single Responsibility", "Smell: a class that talks to the network, parses, caches and formats.",
        [("Violates", "bad", r"""
final class UserManager {
  func fetchUser(id: String) async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: url(id))
    let user = try JSONDecoder().decode(User.self, from: data)
    UserDefaults.standard.set(data, forKey: id)     // persistence
    Analytics.log("user_fetched")                   // analytics
    return user
  }
  func displayName(_ u: User) -> String { ... }     // formatting
}
"""),
         ("Respects", "good", r"""
struct UserAPI {           // transport only
  func user(id: String) async throws -> User
}
struct UserCache {         // persistence only
  func save(_ user: User); func load(id: String) -> User?
}
struct UserFormatter {     // presentation only
  func displayName(_ u: User) -> String
}

// A thin coordinator composes them:
struct UserRepository {
  let api: UserAPI, cache: UserCache
  func user(id: String) async throws -> User {
    if let hit = cache.load(id: id) { return hit }
    let u = try await api.user(id: id); cache.save(u); return u
  }
}
""")]),

    cmp("O — Open/Closed", "Smell: adding a case means editing an existing switch in a shipped type.",
        [("Violates", "bad", r"""
struct DiscountCalculator {
  func discount(for kind: String, price: Decimal) -> Decimal {
    switch kind {
    case "student": return price * 0.1
    case "senior":  return price * 0.15
    // every new rule edits THIS function
    default: return 0
    }
  }
}
"""),
         ("Respects", "good", r"""
protocol DiscountRule {
  func discount(on price: Decimal) -> Decimal
}
struct StudentDiscount: DiscountRule {
  func discount(on p: Decimal) -> Decimal { p * 0.1 }
}
struct SeniorDiscount: DiscountRule {
  func discount(on p: Decimal) -> Decimal { p * 0.15 }
}

struct DiscountCalculator {
  let rules: [DiscountRule]                 // extend by ADDING a type
  func total(on p: Decimal) -> Decimal {
    rules.reduce(0) { $0 + $1.discount(on: p) }
  }
}
// Note: a closed enum + exhaustive switch is also fine when the set
// of cases is genuinely fixed - that's the trade-off to mention.
""")]),

    cmp("L — Liskov Substitution", "Smell: a subclass that throws, no-ops, or tightens preconditions.",
        [("Violates", "bad", r"""
class Rectangle {
  var width: Double = 0
  var height: Double = 0
  var area: Double { width * height }
}

class Square: Rectangle {
  override var width: Double {
    didSet { super.height = width }         // surprise side effect
  }
}

func resize(_ r: Rectangle) {
  r.width = 4; r.height = 5
  assert(r.area == 20)                      // fails for Square
}
"""),
         ("Respects", "good", r"""
protocol Shape { var area: Double { get } }

struct Rectangle: Shape {
  let width, height: Double
  var area: Double { width * height }
}
struct Square: Shape {
  let side: Double
  var area: Double { side * side }
}

func totalArea(_ shapes: [any Shape]) -> Double {
  shapes.reduce(0) { $0 + $1.area }         // every Shape behaves
}
""")]),

    cmp("I — Interface Segregation", "Smell: conformances full of `fatalError()` or empty methods.",
        [("Violates", "bad", r"""
protocol Worker {
  func fetch() async throws -> Data
  func upload(_ d: Data) async throws
  func deleteAll() async throws
  func exportCSV() -> URL
}

struct ReadOnlyClient: Worker {
  func fetch() async throws -> Data { ... }
  func upload(_ d: Data) async throws { fatalError("unsupported") }
  func deleteAll() async throws { }          // silently wrong
  func exportCSV() -> URL { fatalError() }
}
"""),
         ("Respects", "good", r"""
protocol Fetching  { func fetch() async throws -> Data }
protocol Uploading { func upload(_ d: Data) async throws }
protocol Purging   { func deleteAll() async throws }

struct ReadOnlyClient: Fetching {
  func fetch() async throws -> Data { ... }
}
struct FullClient: Fetching, Uploading, Purging { ... }

func sync(_ c: some Fetching & Uploading) async throws { ... }
""")]),

    cmp("D — Dependency Inversion", "Smell: `URLSession.shared` / `Date()` / singletons hard-coded inside logic.",
        [("Violates", "bad", r"""
final class CheckoutService {
  func pay(_ order: Order) async throws {
    let token = try await StripeSDK.shared.charge(order.total)
    Database.shared.save(token)
    Analytics.shared.log("paid")
  }
}
// Untestable: every test hits the real world.
"""),
         ("Respects", "good", r"""
struct CheckoutService {
  var charge: (Decimal) async throws -> Token   // closures ARE protocols
  var save: (Token) throws -> Void
  var log: (String) -> Void

  func pay(_ order: Order) async throws {
    let token = try await charge(order.total)
    try save(token)
    log("paid")
  }
}

// Production
CheckoutService(charge: StripeSDK.shared.charge,
                save: Database.shared.save,
                log: Analytics.shared.log)
// Test
CheckoutService(charge: { _ in .stub }, save: { _ in }, log: { _ in })
""")]),

    rules("Related principles they may also ask", "", [
        ("neutral", "**DRY** — but prefer duplication over the wrong abstraction."),
        ("neutral", "**YAGNI** — don't build the protocol until there are two implementations."),
        ("neutral", "**Composition over inheritance** — Swift protocols + generics + structs make this the default."),
        ("neutral", "**Law of Demeter** — `a.b.c.d()` is a coupling smell; ask for what you need."),
        ("neutral", "**Tell, don't ask** — send a message rather than querying state and deciding externally."),
        ("good", "TCA angle: reducers = SRP, `@Dependency` = DIP, `Scope`/`ifLet` = composition over inheritance."),
    ]),
])


FP = sheet("fp", "Functional Programming in Swift", G,
    "Values, purity, and functions as data — with the standard-library tools that express them.", [

    rules("Core ideas", "", [
        ("modern", "**Pure function** — same input → same output, no observable side effects. Trivially testable and parallelisable."),
        ("modern", "**Immutability** — `let` by default; model changes as new values, not mutations."),
        ("modern", "**Value semantics** — `struct`/`enum` copy on assignment, so no shared-state races."),
        ("modern", "**First-class functions** — pass, return and store functions like any value."),
        ("modern", "**Declarative** — describe *what*, not the loop mechanics."),
        ("modern", "**Algebraic data types** — `struct` = AND (product), `enum` = OR (sum). Make illegal states unrepresentable."),
        ("neutral", "Swift is multi-paradigm: use FP where it clarifies (transforms, pipelines), not dogmatically."),
    ]),

    cmp("Imperative → declarative", "",
        [("Imperative", "legacy", r"""
var names: [String] = []
for user in users {
  if user.isActive && user.age >= 18 {
    names.append(user.name.uppercased())
  }
}
names.sort()

var total = 0
for o in orders { total += o.amount }
"""),
         ("Functional", "good", r"""
let names = users
  .filter { $0.isActive && $0.age >= 18 }
  .map { $0.name.uppercased() }
  .sorted()

let total = orders.reduce(0) { $0 + $1.amount }
// or: orders.map(\.amount).reduce(0, +)
""")]),

    table("Higher-order functions you must know cold", "",
        ["Function", "Signature idea", "Example"],
        [["`map`", "`[A] -> (A -> B) -> [B]`", "`[1,2,3].map { $0 * 2 }` → `[2,4,6]`"],
         ["`compactMap`", "drops nils", "`[\"1\",\"x\"].compactMap(Int.init)` → `[1]`"],
         ["`flatMap`", "flattens one level", "`[[1,2],[3]].flatMap { $0 }` → `[1,2,3]`"],
         ["`filter`", "keeps matches", "`nums.filter { $0.isMultiple(of: 2) }`"],
         ["`reduce`", "fold to one value", "`nums.reduce(0, +)`"],
         ["`reduce(into:)`", "fold without copying", "`words.reduce(into: [:]) { $0[$1, default: 0] += 1 }`"],
         ["`zip`", "pairwise", "`zip(names, scores).map { \"\\($0): \\($1)\" }`"],
         ["`sorted(by:)`", "custom order", "`items.sorted { $0.date > $1.date }`"],
         ["`allSatisfy` / `contains`", "predicates", "`nums.allSatisfy { $0 > 0 }`"],
         ["`prefix/drop(while:)`", "lazy slicing", "`nums.prefix(while: { $0 < 10 })`"],
         ["`chunked` / `split`", "partition", "`text.split(separator: \" \")`"]]),

    code("KeyPaths as functions", "Concise, and a favourite trick in interviews.", r"""
let names = users.map(\.name)                       // KeyPath as (User) -> String
let sorted = users.sorted(using: KeyPathComparator(\.createdAt))
let grouped = Dictionary(grouping: users, by: \.country)
let ids = Set(users.map(\.id))

// Generic helper built on a key path
func by<T, V: Comparable>(_ kp: KeyPath<T, V>) -> (T, T) -> Bool {
  { $0[keyPath: kp] < $1[keyPath: kp] }
}
users.sorted(by: by(\.age))
"""),

    code("Function composition & currying", "", r"""
infix operator >>>: AdditionPrecedence
func >>> <A, B, C>(f: @escaping (A) -> B, g: @escaping (B) -> C) -> (A) -> C {
  { a in g(f(a)) }
}

let trim: (String) -> String = { $0.trimmingCharacters(in: .whitespaces) }
let lower: (String) -> String = { $0.lowercased() }
let normalize = trim >>> lower

// Currying: turn a 2-arg function into a chain of 1-arg functions
func curry<A, B, C>(_ f: @escaping (A, B) -> C) -> (A) -> (B) -> C {
  { a in { b in f(a, b) } }
}
let add = curry(+)
let inc = add(1)                       // (Int) -> Int
[1, 2, 3].map(inc)                     // [2, 3, 4]
"""),

    code("Optional & Result as containers", "`map`/`flatMap` are not just for arrays.", r"""
// Optional chaining is flatMap
let length: Int? = name.map(\.count)                 // Optional<Int>
let user: User? = id.flatMap(repository.user(id:))   // avoids Optional<Optional<User>>

// Coalescing + guard for early exit
guard let email = form.email, email.contains("@") else { throw ValidationError.email }

// Result
let parsed = Result { try JSONDecoder().decode(User.self, from: data) }
  .map(\.name)
  .mapError(APIError.decoding)

switch parsed {
case .success(let name): print(name)
case .failure(let error): report(error)
}

try parsed.get()                         // back to throwing world
"""),

    code("Make illegal states unrepresentable", "The highest-value FP idea in day-to-day Swift.", r"""
// Bad: 4 booleans = 16 states, 12 of which are nonsense
struct ViewState {
  var isLoading = false
  var items: [Item] = []
  var error: Error?
}

// Good: exactly 4 possible states
enum ViewState {
  case idle
  case loading
  case loaded([Item])
  case failed(Error)
}

// Enums with associated values + exhaustive switch = compiler-checked logic
switch state {
case .idle:            EmptyView()
case .loading:         ProgressView()
case .loaded(let xs):  List(xs) { ItemRow($0) }
case .failed(let e):   ErrorView(error: e)
}
"""),

    code("Laziness, memoization & pure transforms", "", r"""
// Lazy: no intermediate arrays, work happens on demand
let firstBig = numbers.lazy
  .map(expensiveTransform)
  .first { $0 > 1_000 }

// Infinite sequence
let evens = sequence(first: 0) { $0 + 2 }.prefix(5)   // 0,2,4,6,8

// Memoize a pure function
func memoize<A: Hashable, B>(_ f: @escaping (A) -> B) -> (A) -> B {
  var cache: [A: B] = [:]
  return { a in
    if let hit = cache[a] { return hit }
    let value = f(a); cache[a] = value; return value
  }
}

// Pure update on a value type
func updating<T>(_ value: T, _ mutate: (inout T) -> Void) -> T {
  var copy = value; mutate(&copy); return copy
}
let renamed = updating(user) { $0.name = "Ada" }
"""),

    rules("Trade-offs to mention out loud", "", [
        ("good", "Pure functions are trivially unit-testable and thread-safe — a natural fit for Swift 6 `Sendable`."),
        ("good", "Value semantics remove whole classes of aliasing bugs; SwiftUI and TCA are built on it."),
        ("bad", "Copying large structs can cost; Swift's CoW helps, but measure (`isKnownUniquelyReferenced` for custom CoW)."),
        ("bad", "Deep operator chains can hurt readability and compile times — name intermediate steps."),
        ("neutral", "`inout` and `mutating` are the pragmatic escape hatch: local mutation, value semantics preserved."),
    ]),
])


LANG = sheet("lang", "Swift Language Essentials", G,
    "Generics, protocols, memory and error handling — the fill-in-the-blank parts of a live exercise.", [

    code("Generics & constraints", "", r"""
func first<T: Equatable>(_ value: T, in items: [T]) -> Int? {
  items.firstIndex(of: value)
}

struct Stack<Element> {
  private var storage: [Element] = []
  mutating func push(_ e: Element) { storage.append(e) }
  mutating func pop() -> Element? { storage.popLast() }
  var isEmpty: Bool { storage.isEmpty }
}

extension Stack where Element: Comparable {       // conditional extension
  var max: Element? { storage.max() }
}
extension Stack: Equatable where Element: Equatable { }

// where clauses on associated types
func sum<S: Sequence>(_ s: S) -> Int where S.Element == Int {
  s.reduce(0, +)
}
"""),

    cmp("some vs any", "Opaque type vs existential — a very common question.",
        [("`some` — opaque, static", "good", r"""
func makeShape() -> some Shape { Circle() }
// - ONE concrete type, known to the compiler
// - no boxing, full specialisation, fast
// - caller can't see which type it is

func area(of s: some Shape) -> Double { s.area }
// sugar for: func area<S: Shape>(of s: S) -> Double
"""),
         ("`any` — existential, dynamic", "neutral", r"""
let shapes: [any Shape] = [Circle(), Square()]
// - heterogeneous storage
// - boxed, dynamic dispatch (slower)
// - needed for heterogeneous collections

func area(of s: any Shape) -> Double { s.area }
// Swift 5.7+ can open existentials automatically
""")]),

    code("Protocols with associated types & primary associated types", "", r"""
protocol Repository {
  associatedtype Item: Identifiable
  func all() async throws -> [Item]
  func save(_ item: Item) async throws
}

// Swift 5.7 primary associated types make PATs usable as `some`/`any`
protocol Storage<Value> {
  associatedtype Value
  func load() -> Value?
}
func use(_ s: some Storage<User>) { ... }
let boxed: any Storage<User> = KeychainStorage()

// Protocol with default implementation
extension Repository {
  func first() async throws -> Item? { try await all().first }
}
"""),

    code("Error handling", "", r"""
enum APIError: Error, Equatable {
  case badStatus(Int)
  case decoding(String)
}
extension APIError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .badStatus(let c): "Server returned \(c)"
    case .decoding(let m):  "Could not read the response: \(m)"
    }
  }
}

do { let u = try await api.user() }
catch let e as APIError { show(e) }
catch { report(error) }

try? await api.user()          // Optional result
try! JSONDecoder().decode(...) // crash on failure - tests/known-good only

// Typed throws (Swift 6)
func load() throws(APIError) -> User { ... }

defer { file.close() }         // runs on every exit path (LIFO)
"""),

    code("Memory & ARC", "", r"""
class Node {
  var next: Node?
  weak var parent: Node?          // weak: optional, becomes nil
  unowned let owner: Owner        // unowned: non-optional, crashes if accessed after dealloc
}

// Closure capture lists
button.onTap = { [weak self] in
  guard let self else { return }
  self.reload()
}
Task { [weak self] in await self?.load() }

// Escaping vs non-escaping
func run(_ body: () -> Void) { body() }                 // non-escaping (default)
func store(_ body: @escaping () -> Void) { self.h = body }

// Retain-cycle checklist: delegate (weak), closures capturing self,
// Combine .assign(to:on: self), timers with strong targets, NotificationCenter observers.
"""),

    code("Value vs reference semantics", "", r"""
struct Point { var x = 0 }          // value: copy on assign
final class Box { var x = 0 }       // reference: shared

var a = Point(); var b = a; b.x = 1   // a.x == 0
let p = Box(); let q = p; q.x = 1     // p.x == 1

// Copy-on-write for a custom buffer
struct Buffer {
  private var storage = Storage()
  mutating func mutate() {
    if !isKnownUniquelyReferenced(&storage) { storage = storage.copy() }
    storage.value += 1
  }
}
"""),

    code("Pattern matching & control flow", "The syntax you forget under pressure.", r"""
switch value {
case let .success(user) where user.isAdmin: grantAdmin(user)
case .success(let user):                    grant(user)
case .failure(APIError.badStatus(401)):     signOut()
case .failure:                              showRetry()
}

if case let .loaded(items) = state, !items.isEmpty { render(items) }
guard case .loading = state else { return }

for case let .some(x) in optionals { ... }
for (i, item) in items.enumerated() { ... }

let range = 1...10          // closed
0..<items.count             // half-open
if (0...100).contains(score) { ... }

// Result builders (how SwiftUI's DSL works)
@resultBuilder
enum StringBuilder {
  static func buildBlock(_ parts: String...) -> String { parts.joined(separator: " ") }
}
"""),

    table("Testing quick reference", "Swift Testing (Xcode 16+) alongside XCTest.",
        ["Need", "Swift Testing", "XCTest"],
        [["Test case", "`@Test func x() { }`", "`func testX() { }`"],
         ["Assertion", "`#expect(a == b)`", "`XCTAssertEqual(a, b)`"],
         ["Required assertion", "`try #require(optional)`", "`XCTUnwrap(optional)`"],
         ["Async", "`@Test func x() async throws`", "`func testX() async throws`"],
         ["Expected failure", "`#expect(throws: APIError.self) { }`", "`XCTAssertThrowsError`"],
         ["Parametrised", "`@Test(arguments: [1,2,3])`", "loop by hand"],
         ["Setup", "`init()` / `deinit` on the suite", "`setUp()` / `tearDown()`"],
         ["Waiting", "just `await`", "`XCTestExpectation` + `wait(for:)`"]]),
])
