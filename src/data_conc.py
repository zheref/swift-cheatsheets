"""Swift concurrency cheat sheets: modern async/await, actors/Sendable, GCD comparison."""

from render import sheet, code, cmp, rules, table

G = "Concurrency"

CONC_CORE = sheet("conc-core", "Modern Swift Concurrency — Core", G,
    "async/await, structured tasks, groups, streams, cancellation.", [

    code("async / await basics", "`await` = a possible suspension point, not a thread hop guarantee.", r"""
func loadUser(id: Int) async throws -> User {
  let (data, response) = try await URLSession.shared.data(from: url(id))
  guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw APIError.badStatus }
  return try JSONDecoder().decode(User.self, from: data)
}

// Sequential: total time = a + b
let user = try await loadUser(id: 1)
let posts = try await loadPosts(for: user)

// Concurrent: total time = max(a, b)
async let user  = loadUser(id: 1)
async let stats = loadStats(id: 1)
let (u, s) = try await (user, stats)      // both awaited here
"""),

    rules("Structured vs unstructured", "Interviewers love this distinction.", [
        ("good", "**Structured**: `async let`, `TaskGroup`. Child tasks cannot outlive the scope; cancellation and errors propagate automatically."),
        ("legacy", "**Unstructured**: `Task { }` — inherits actor isolation + priority, but you must retain/cancel it yourself."),
        ("bad", "**Detached**: `Task.detached { }` — inherits *nothing*. Rarely the right answer; only for truly independent background work."),
        ("neutral", "Rule of thumb: use structured concurrency; `Task { }` only at the boundary between sync (e.g. a SwiftUI button) and async code."),
    ]),

    code("TaskGroup — dynamic fan-out", "Use when the number of child tasks is only known at runtime.", r"""
func thumbnails(for ids: [String]) async throws -> [String: UIImage] {
  try await withThrowingTaskGroup(of: (String, UIImage).self) { group in
    for id in ids {
      group.addTask { (id, try await fetchThumbnail(id)) }   // runs concurrently
    }
    var result: [String: UIImage] = [:]
    for try await (id, image) in group {                     // results in COMPLETION order
      result[id] = image
    }
    return result
  }
}

// Bounded concurrency (don't launch 10 000 tasks):
try await withThrowingTaskGroup(of: Void.self) { group in
  var it = ids.makeIterator()
  for _ in 0..<4 { if let id = it.next() { group.addTask { try await work(id) } } }
  while try await group.next() != nil {
    if let id = it.next() { group.addTask { try await work(id) } }
  }
}
"""),

    code("Cancellation", "Cooperative: nothing is killed, you must check.", r"""
Task.isCancelled                       // non-throwing check
try Task.checkCancellation()           // throws CancellationError

let task = Task {
  for chunk in chunks {
    try Task.checkCancellation()
    await process(chunk)
  }
}
task.cancel()                          // cancels task AND all its children
await task.value                       // await result (rethrows)

// Clean up when cancelled mid-flight:
await withTaskCancellationHandler {
  try await longRunningWork()
} onCancel: {
  connection.close()                   // runs immediately, sync, on any thread
}

// try await Task.sleep(...) throws CancellationError immediately on cancel.
"""),

    code("AsyncSequence & AsyncStream", "Bridge callbacks/delegates into async, and iterate over time.", r"""
// Consume
for try await line in url.lines { print(line) }
for await note in NotificationCenter.default.notifications(named: .didLogin) { ... }

// Produce — bridging a callback API
func locations() -> AsyncStream<CLLocation> {
  AsyncStream { continuation in
    let manager = LocationManager()
    manager.onUpdate = { continuation.yield($0) }
    continuation.onTermination = { _ in manager.stop() }
    manager.start()
  }
}

// Throwing variant + explicit finish
let stream = AsyncThrowingStream<Int, Error> { c in
  c.yield(1); c.yield(2); c.finish()
}

// Operators exist too:
for await x in stream.map { $0 * 2 }.filter({ $0 > 2 }).prefix(10) { ... }
"""),

    code("Bridging legacy callbacks", "Continuations: resume exactly once, or you crash / leak.", r"""
func load() async throws -> Data {
  try await withCheckedThrowingContinuation { continuation in
    legacyLoad { data, error in
      if let error { continuation.resume(throwing: error) }
      else { continuation.resume(returning: data!) }
    }
  }
}

// Cancellable version
func load() async throws -> Data {
  try await withTaskCancellationHandler {
    try await withCheckedThrowingContinuation { c in
      task = legacyLoad { ... }
    }
  } onCancel: { task?.cancel() }
}

// withUnsafeContinuation = same, no runtime checks. Use Checked while developing.
"""),

    table("Task API quick reference", "",
        ["API", "Inherits isolation?", "Inherits priority?", "Use for"],
        [["`async let`", "yes", "yes", "fixed number of parallel calls"],
         ["`withTaskGroup`", "yes", "yes", "dynamic fan-out / bounded parallelism"],
         ["`Task { }`", "yes", "yes", "sync → async boundary (button taps, `onAppear`)"],
         ["`Task.detached { }`", "**no**", "no", "background work unrelated to the caller"],
         ["`Task.yield()`", "—", "—", "give other tasks a turn in a long CPU loop"],
         ["`Task.sleep(for:)`", "—", "—", "delays (cancellable, never blocks a thread)"]]),

    code("MainActor hop", "Only touch UI on the main actor; the compiler enforces it in Swift 6.", r"""
@MainActor
final class ProfileViewModel: ObservableObject {
  @Published private(set) var user: User?

  func load() async {                     // inherits @MainActor
    let fetched = try? await api.user()   // api call suspends off the main actor
    self.user = fetched                   // back on main automatically
  }
}

// Explicit hop from a nonisolated context:
await MainActor.run { label.text = "done" }

// Already on main and need it synchronously (e.g. in a delegate callback):
MainActor.assumeIsolated { label.text = "done" }   // traps if not actually on main
"""),
])


CONC_ACTORS = sheet("conc-actors", "Actors, Sendable & Isolation", G,
    "The Swift 6 data-race safety model, and how to talk about it.", [

    code("actor = reference type with a serial executor", "Mutable state protected by the compiler.", r"""
actor ImageCache {
  private var cache: [URL: UIImage] = [:]        // isolated: only reachable via await

  func image(for url: URL) -> UIImage? { cache[url] }     // implicitly async from outside

  func insert(_ image: UIImage, for url: URL) { cache[url] = image }

  nonisolated let name: String = "images"        // immutable -> no isolation needed
  nonisolated func describe() -> String { "Cache(\(name))" }
}

let cache = ImageCache()
await cache.insert(image, for: url)              // cross-actor call = await
let img = await cache.image(for: url)
"""),

    code("Actor reentrancy — the classic trap", "Every `await` inside an actor is a chance for other calls to interleave.", r"""
actor Downloader {
  private var cache: [URL: Data] = [:]
  private var inFlight: [URL: Task<Data, Error>] = [:]

  // BUG: two callers can both see an empty cache and both download.
  func badFetch(_ url: URL) async throws -> Data {
    if let hit = cache[url] { return hit }
    let data = try await URLSession.shared.data(from: url).0   // <-- suspension!
    cache[url] = data
    return data
  }

  // FIX: store the *task*, not just the result, before suspending.
  func fetch(_ url: URL) async throws -> Data {
    if let hit = cache[url] { return hit }
    if let running = inFlight[url] { return try await running.value }
    let task = Task { try await URLSession.shared.data(from: url).0 }
    inFlight[url] = task
    defer { inFlight[url] = nil }
    let data = try await task.value
    cache[url] = data
    return data
  }
}
"""),

    rules("Sendable in one screen", "What can safely cross an isolation boundary.", [
        ("good", "`struct`/`enum` of `Sendable` members → implicit `Sendable` (if not `public`; `public` needs explicit conformance)."),
        ("good", "`final class` with only `let` `Sendable` properties → can be `Sendable`."),
        ("good", "`actor` types are always `Sendable`."),
        ("bad", "Non-final classes and classes with `var` state are **not** `Sendable`."),
        ("legacy", "`@unchecked Sendable` = \"I promise I lock correctly.\" Only with a real mutex/queue inside."),
        ("modern", "`@Sendable` on closures: no capture of non-Sendable state, no mutable captures."),
        ("modern", "`sending` parameters (SE-0430) transfer ownership across isolation without needing `Sendable`."),
    ]),

    cmp("Sendable conformance", "",
        [("Do", "good", r"""
struct User: Sendable {
  let id: UUID
  let name: String
}

final class Counter: @unchecked Sendable {
  private let lock = NSLock()
  private var _value = 0
  var value: Int { lock.withLock { _value } }
  func increment() { lock.withLock { _value += 1 } }
}

@MainActor final class ViewModel { var items: [User] = [] }
// MainActor isolation makes it safe to share.
"""),
         ("Don't", "bad", r"""
final class Counter: @unchecked Sendable {
  var value = 0                 // no lock -> a lie to the compiler
}

class Model: Sendable { }       // non-final: subclass can add mutable state

// Capturing mutable local state in a @Sendable closure
var total = 0
Task { total += 1 }             // error / race
""")]),

    code("Global actors & custom isolation", "`@MainActor` is just the built-in global actor.", r"""
@globalActor
actor DatabaseActor {
  static let shared = DatabaseActor()
}

@DatabaseActor
final class Store {
  private var rows: [Row] = []          // all members isolated to DatabaseActor
  func insert(_ r: Row) { rows.append(r) }
}

@DatabaseActor func migrate() async { ... }

// Opting a member out
@MainActor
final class VM {
  nonisolated let id = UUID()
  nonisolated func pureHelper(_ x: Int) -> Int { x * 2 }
}
"""),

    code("Isolated & sending parameters", "Advanced but very quotable in an interview.", r"""
// Run code *in* someone else's isolation domain
func mutate(_ cache: isolated ImageCache, url: URL) {
  cache.evict(url)                        // no await needed: we're isolated to it
}

// Transfer a non-Sendable value across a boundary (compiler proves no other refs)
func handOff(_ model: sending NonSendableModel) async {
  await actor.consume(model)
}

// #isolation gives the caller's isolation to a generic API
func run(isolation: isolated (any Actor)? = #isolation, _ body: () async -> Void) async {
  await body()
}
"""),

    table("Isolation quick decisions", "",
        ["Situation", "Answer"],
        [["UI / view model state", "`@MainActor` on the type"],
         ["Shared mutable cache or connection pool", "`actor`"],
         ["Pure value passed between tasks", "`struct` + `Sendable`"],
         ["Legacy class you can't change", "wrap in an `actor`, or `@unchecked Sendable` + lock"],
         ["One-off background computation", "`Task.detached` or `await` a `nonisolated` func"],
         ["Callback API from a C/ObjC lib", "`AsyncStream` or continuation, marked `@Sendable`"]]),
])


CONC_DOS = sheet("conc-dos", "Swift 6 Concurrency — Do's & Don'ts", G,
    "Migration traps, and how modern code meets legacy GCD/Combine code.", [

    cmp("Never block a thread waiting on async", "The cooperative thread pool has ~one thread per core. Blocking one can deadlock the app.",
        [("Don't", "bad", r"""
func value() -> Int {
  let sem = DispatchSemaphore(value: 0)
  var result = 0
  Task {
    result = await compute()
    sem.signal()
  }
  sem.wait()          // deadlock risk, priority inversion
  return result
}

DispatchQueue.main.sync { ... }   // from async code: hangs
"""),
         ("Do", "good", r"""
func value() async -> Int {
  await compute()
}

// At a sync boundary you cannot change, hop instead of block:
Task { @MainActor in
  let v = await compute()
  self.label.text = "\(v)"
}
""")]),

    cmp("Don't use queues for mutual exclusion in new code", "",
        [("Legacy", "legacy", r"""
final class Store {
  private let q = DispatchQueue(label: "store")
  private var items: [Item] = []

  func add(_ i: Item) { q.async { self.items.append(i) } }
  func all(_ done: @escaping ([Item]) -> Void) {
    q.async { done(self.items) }
  }
}
"""),
         ("Modern", "modern", r"""
actor Store {
  private var items: [Item] = []
  func add(_ i: Item) { items.append(i) }
  func all() -> [Item] { items }
}

let store = Store()
await store.add(item)
let items = await store.all()
""")]),

    cmp("@MainActor over DispatchQueue.main", "",
        [("Legacy", "legacy", r"""
URLSession.shared.dataTask(with: url) { data, _, error in
  DispatchQueue.main.async {
    self.items = decode(data)
    self.tableView.reloadData()
  }
}.resume()
"""),
         ("Modern", "modern", r"""
@MainActor
func reload() async throws {
  let (data, _) = try await URLSession.shared.data(from: url)
  items = try decode(data)      // already on main; compiler-checked
}
""")]),

    rules("Do", "", [
        ("good", "Mark model types `Sendable` and keep them value types."),
        ("good", "Put `@MainActor` on view models / anything touching UIKit or SwiftUI state."),
        ("good", "Use `nonisolated` for pure helpers so callers don't need `await`."),
        ("good", "Prefer `async let` / `TaskGroup` over manually spawned `Task`s."),
        ("good", "Store `Task` handles you need to cancel (and cancel in `deinit` / `onDisappear`)."),
        ("good", "Use `Task.sleep`, `ContinuousClock`, or an injected clock instead of `Thread.sleep`/`Timer`."),
        ("good", "Turn on `SWIFT_STRICT_CONCURRENCY = complete` per-module and migrate incrementally."),
        ("good", "Use `@preconcurrency import` to silence a legacy module while you migrate."),
    ]),

    rules("Don't", "", [
        ("bad", "Don't use `DispatchSemaphore`/`DispatchGroup.wait()` to make async look sync."),
        ("bad", "Don't sprinkle `Task { }` inside loops — that's unstructured and unbounded."),
        ("bad", "Don't use `Task.detached` just to \"get off the main thread\"; a `nonisolated async func` already does."),
        ("bad", "Don't add `@unchecked Sendable` to silence errors without a real lock."),
        ("bad", "Don't assume state is unchanged across an `await` inside an actor (reentrancy)."),
        ("bad", "Don't capture `self` strongly in a long-lived `Task` on a view controller."),
        ("bad", "Don't resume a continuation twice (crash) or zero times (leak + hang)."),
        ("bad", "Don't rely on `Thread.current` — a task can resume on any thread."),
    ]),

    code("Making a legacy delegate Swift 6 safe", "Common migration exercise.", r"""
// The delegate protocol is not isolated; the callback arrives on an unknown thread.
final class Scanner: NSObject, ScannerDelegate {
  private let continuation: AsyncStream<Code>.Continuation
  let codes: AsyncStream<Code>

  override init() {
    var c: AsyncStream<Code>.Continuation!
    codes = AsyncStream { c = $0 }
    continuation = c
    super.init()
  }

  nonisolated func scanner(_ s: RawScanner, didFind code: Code) {
    continuation.yield(code)          // Continuation is Sendable -> safe from any thread
  }
}

// Consumer stays on the main actor:
@MainActor
func observe(_ scanner: Scanner) async {
  for await code in scanner.codes { self.lastCode = code }
}
"""),

    table("Common Swift 6 errors → fix", "",
        ["Compiler says", "Meaning", "Fix"],
        [["Capture of non-Sendable type in `@Sendable` closure", "You're sharing a class across domains",
          "make it a `struct`, an `actor`, or pass `sending`"],
         ["Main actor-isolated property can not be referenced from a nonisolated context", "Sync access to UI state",
          "`await MainActor.run { }` or make the caller `@MainActor`"],
         ["Sending value risks causing data races", "Value could still be referenced by the sender",
          "make it `Sendable`, or don't touch it after sending"],
         ["Static property is not concurrency-safe", "Mutable global",
          "`let` + `Sendable`, `@MainActor static var`, or `nonisolated(unsafe)` as a stopgap"],
         ["Call to actor-isolated method in a synchronous nonisolated context", "Missing `await`",
          "make the caller `async`, or wrap in `Task { }`"],
         ["Non-sendable type exiting main actor-isolated context", "Returning a class from `@MainActor` code",
          "return a `Sendable` snapshot instead"]]),
])


THREADING = sheet("threading", "Multithreading — GCD vs Combine vs async/await", G,
    "Same 12 problems, three eras of solution. Read across the row.", [

    cmp("Run work off the main thread, then update UI", "",
        [("GCD (legacy)", "legacy", r"""
DispatchQueue.global(qos: .userInitiated).async {
  let result = expensive()
  DispatchQueue.main.async {
    self.label.text = result
  }
}
"""),
         ("Combine", "neutral", r"""
Just(input)
  .subscribe(on: DispatchQueue.global())
  .map(expensive)
  .receive(on: DispatchQueue.main)
  .sink { self.label.text = $0 }
  .store(in: &cancellables)
"""),
         ("async/await", "modern", r"""
Task { @MainActor in
  let result = await Task.detached(priority: .userInitiated) {
    expensive()
  }.value
  label.text = result
}
""")]),

    cmp("Wait for N parallel jobs", "",
        [("DispatchGroup", "legacy", r"""
let group = DispatchGroup()
var images: [UIImage] = []
let lock = NSLock()

for url in urls {
  group.enter()
  download(url) { image in
    lock.withLock { images.append(image) }
    group.leave()
  }
}
group.notify(queue: .main) { render(images) }
"""),
         ("Combine", "neutral", r"""
Publishers.MergeMany(urls.map(downloadPublisher))
  .collect()
  .receive(on: DispatchQueue.main)
  .sink { render($0) }
  .store(in: &cancellables)

// or Publishers.Zip / .zip for pairwise
"""),
         ("TaskGroup", "modern", r"""
let images = try await withThrowingTaskGroup(of: UIImage.self) { group in
  for url in urls { group.addTask { try await download(url) } }
  var out: [UIImage] = []
  for try await img in group { out.append(img) }
  return out
}
render(images)          // ordering is completion order
""")]),

    cmp("Serialize access to shared mutable state", "",
        [("Serial queue / lock", "legacy", r"""
let queue = DispatchQueue(label: "counter")
var count = 0
queue.sync { count += 1 }

// or a barrier on a concurrent queue (readers-writer)
let rw = DispatchQueue(label: "rw", attributes: .concurrent)
rw.async(flags: .barrier) { count += 1 }
rw.sync { _ = count }
"""),
         ("Combine", "neutral", r"""
// Combine has no mutual exclusion primitive.
// You still need a lock/queue, or confine all
// mutation to one scheduler:
subject
  .receive(on: serialQueue)
  .sink { count += $0 }
  .store(in: &cancellables)
"""),
         ("Actor", "modern", r"""
actor Counter {
  private var value = 0
  func increment() { value += 1 }
  func current() -> Int { value }
}
await counter.increment()
""")]),

    cmp("Cancel in-flight work", "",
        [("GCD", "legacy", r"""
let item = DispatchWorkItem { heavyWork() }
DispatchQueue.global().async(execute: item)
item.cancel()               // only prevents *start*, can't interrupt

URLSessionTask.cancel()     // for networking
"""),
         ("Combine", "neutral", r"""
let c = publisher.sink { ... }
c.cancel()                  // cancels the whole chain

// automatic when the AnyCancellable deallocates
cancellables.removeAll()
"""),
         ("Structured", "modern", r"""
let task = Task { try await work() }
task.cancel()               // propagates to children

// cooperative check inside:
try Task.checkCancellation()
if Task.isCancelled { return }
""")]),

    cmp("Delay / debounce / throttle", "",
        [("GCD", "legacy", r"""
DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { ... }

// manual debounce
var work: DispatchWorkItem?
func search(_ q: String) {
  work?.cancel()
  let w = DispatchWorkItem { performSearch(q) }
  work = w
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: w)
}
"""),
         ("Combine", "neutral", r"""
$query
  .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
  .removeDuplicates()
  .sink { performSearch($0) }
  .store(in: &cancellables)

$scroll.throttle(for: .seconds(1),
                 scheduler: RunLoop.main,
                 latest: true)
"""),
         ("async/await", "modern", r"""
var searchTask: Task<Void, Never>?

func search(_ q: String) {
  searchTask?.cancel()
  searchTask = Task {
    try? await Task.sleep(for: .milliseconds(300))
    guard !Task.isCancelled else { return }
    await performSearch(q)
  }
}
""")]),

    cmp("Retry with backoff", "",
        [("GCD", "legacy", r"""
func attempt(_ n: Int) {
  request { result in
    switch result {
    case .success(let v): done(v)
    case .failure where n > 0:
      DispatchQueue.global().asyncAfter(
        deadline: .now() + pow(2, Double(3 - n))) {
        attempt(n - 1)
      }
    case .failure(let e): fail(e)
    }
  }
}
"""),
         ("Combine", "neutral", r"""
requestPublisher
  .retry(3)                       // immediate retries
  .catch { _ in Just(.cached) }
  .eraseToAnyPublisher()

// backoff needs delay + retry composition:
.catch { _ in
  Just(()).delay(for: .seconds(2), scheduler: q)
    .flatMap { requestPublisher }
}
"""),
         ("async/await", "modern", r"""
func withRetry<T>(_ max: Int = 3,
                  _ op: () async throws -> T) async throws -> T {
  for attempt in 0..<max {
    do { return try await op() }
    catch {
      if attempt == max - 1 { throw error }
      try await Task.sleep(for: .seconds(pow(2, Double(attempt))))
    }
  }
  fatalError("unreachable")
}
""")]),

    table("Concept translation table", "",
        ["Need", "GCD", "Combine", "Concurrency"],
        [["Background execution", "`DispatchQueue.global().async`", "`.subscribe(on:)`", "`await` a nonisolated func / `Task.detached`"],
         ["Main-thread delivery", "`DispatchQueue.main.async`", "`.receive(on: DispatchQueue.main)`", "`@MainActor`"],
         ["Fan-out + join", "`DispatchGroup`", "`MergeMany` + `collect`", "`TaskGroup` / `async let`"],
         ["Mutual exclusion", "serial queue, `NSLock`, barrier", "— (use a lock)", "`actor`"],
         ["Cancellation", "`DispatchWorkItem.cancel()`", "`AnyCancellable.cancel()`", "`Task.cancel()` (cooperative)"],
         ["Timer", "`DispatchSourceTimer`", "`Timer.publish`", "`AsyncTimerSequence` / `clock.timer`"],
         ["Stream of values", "callbacks", "`Publisher`", "`AsyncSequence`"],
         ["Priority", "QoS on the queue", "scheduler choice", "`TaskPriority` (inherited)"],
         ["Deadlock risk", "high (`sync` on same queue)", "low", "low (never block)"]]),

    rules("Talking points", "Short answers that show depth.", [
        ("neutral", "GCD threads *block*; Swift concurrency tasks *suspend* and free the thread. That's why blocking a cooperative thread is so bad."),
        ("neutral", "`await` does not guarantee a thread change; it guarantees the correct **isolation domain**."),
        ("neutral", "Thread explosion: 1000 `DispatchQueue.global().async` calls can spawn ~64+ threads. `TaskGroup` is bounded by the core count."),
        ("neutral", "Priority inversion: GCD needs manual QoS care; Swift concurrency escalates priority automatically for actor/task dependencies."),
        ("neutral", "Combine is still the right answer for UIKit-era reactive pipelines and for `@Published`; new code usually prefers `AsyncSequence` + `Observation`."),
    ]),
])
