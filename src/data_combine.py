"""Combine cheat sheets + the Combine vs async/await pattern cookbook (timers included)."""

from render import sheet, code, cmp, rules, table

G = "Combine"

COMBINE_CORE = sheet("combine-core", "Combine — Core", G,
    "Publisher -> Operator -> Subscriber. Output + Failure are part of the type.", [

    rules("Mental model", "", [
        ("modern", "`Publisher<Output, Failure>` emits 0…n values then **either** `.finished` **or** `.failure` — never both, never after."),
        ("modern", "`Subscriber` requests demand (backpressure). `sink`/`assign` request `.unlimited`."),
        ("modern", "A pipeline is inert until subscribed, and dies when its `AnyCancellable` deallocates."),
        ("neutral", "`Failure == Never` means the compiler knows it can't fail — required by `assign(to:on:)`."),
        ("neutral", "`.eraseToAnyPublisher()` hides the huge generic type at API boundaries."),
    ]),

    code("Creating publishers", "", r"""
Just(42)                                   // one value, then finish. Failure == Never
Empty<Int, Never>()                        // finish immediately
Fail<Int, MyError>(error: .boom)           // fail immediately
[1, 2, 3].publisher                        // Sequence
Future<Int, Error> { promise in            // single async result, EAGER
  api.load { promise(.success($0)) }
}
Deferred { Future { ... } }                // make Future lazy (one call per subscriber)

URLSession.shared.dataTaskPublisher(for: url)
Timer.publish(every: 1, on: .main, in: .common).autoconnect()
NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
$searchText                                // @Published projected value
"""),

    code("Subjects — imperative bridge into Combine", "", r"""
let events = PassthroughSubject<Event, Never>()      // no memory of last value
let state  = CurrentValueSubject<State, Never>(.idle) // replays current value on subscribe

events.send(.tapped)
state.send(.loading)
state.value = .loaded          // CurrentValueSubject only
events.send(completion: .finished)

// @Published is a CurrentValueSubject in disguise
final class VM: ObservableObject {
  @Published var query = ""
  @Published private(set) var results: [Item] = []
}
"""),

    table("Operators you actually need", "",
        ["Category", "Operators"],
        [["Transform", "`map` `tryMap` `compactMap` `flatMap` `scan` `reduce` `replaceNil` `setFailureType`"],
         ["Filter", "`filter` `removeDuplicates` `first(where:)` `dropFirst` `prefix` `ignoreOutput`"],
         ["Combine", "`combineLatest` `zip` `merge` `switchToLatest` `Publishers.MergeMany`"],
         ["Timing", "`debounce` `throttle` `delay` `timeout` `measureInterval`"],
         ["Errors", "`catch` `tryCatch` `retry` `replaceError` `mapError` `assertNoFailure`"],
         ["Scheduling", "`receive(on:)` `subscribe(on:)`"],
         ["Sharing", "`share()` `multicast` `makeConnectable()`"],
         ["Side effects", "`handleEvents(receiveOutput:receiveCompletion:)` (debugging), `print()`"],
         ["Sinks", "`sink` `assign(to:on:)` `assign(to: &$published)`"]]),

    cmp("flatMap vs switchToLatest vs combineLatest vs zip", "The most-asked Combine question.",
        [("flatMap / switchToLatest", "neutral", r"""
// flatMap: keeps ALL inner publishers alive
$query.flatMap { api.search($0) }        // stale results can arrive late

// switchToLatest: cancels the previous inner publisher
$query
  .map { api.search($0) }
  .switchToLatest()                      // correct for search-as-you-type

// flatMap(maxPublishers: .max(1)) = serial
"""),
         ("combineLatest / zip / merge", "neutral", r"""
// combineLatest: emits on ANY input change, using latest of each
Publishers.CombineLatest($email, $password)
  .map { !$0.isEmpty && $1.count >= 8 }
  .assign(to: &$isValid)

// zip: pairs by index, waits for both. 1+1 -> 1 emission
Publishers.Zip(uploadA, uploadB)

// merge: interleaves, same Output type
Publishers.Merge($fromCache, $fromNetwork)
""")]),

    code("Networking pipeline", "The canonical whiteboard answer.", r"""
func search(_ query: String) -> AnyPublisher<[Repo], APIError> {
  var components = URLComponents(string: "https://api.github.com/search/repositories")!
  components.queryItems = [.init(name: "q", value: query)]

  return URLSession.shared.dataTaskPublisher(for: components.url!)
    .tryMap { data, response in
      guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
        throw APIError.badStatus
      }
      return data
    }
    .decode(type: SearchResponse.self, decoder: JSONDecoder())
    .map(\.items)
    .mapError { $0 as? APIError ?? .underlying($0) }
    .receive(on: DispatchQueue.main)
    .eraseToAnyPublisher()
}

// Wiring it up
$query
  .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
  .removeDuplicates()
  .filter { $0.count > 2 }
  .map { [search] q in search(q).catch { _ in Just([]) } }
  .switchToLatest()
  .assign(to: &$repos)
"""),

    code("Subscribing & lifetime", "", r"""
private var cancellables = Set<AnyCancellable>()

publisher
  .sink(
    receiveCompletion: { completion in
      if case let .failure(error) = completion { self.show(error) }
    },
    receiveValue: { value in self.items = value }
  )
  .store(in: &cancellables)

// Failure == Never shortcuts
publisher.sink { self.items = $0 }.store(in: &cancellables)
publisher.assign(to: \.text, on: label).store(in: &cancellables)
publisher.assign(to: &$items)              // @Published target, no cancellable needed

// assign(to:on:) retains `on` -> use [weak self] in sink instead of assign(to:on: self)
"""),

    cmp("Combine ↔ async/await bridging", "You will be asked how to migrate.",
        [("Publisher → async", "modern", r"""
for await value in publisher.values { ... }

// single value
let user = try await publisher
  .first()
  .values
  .first(where: { _ in true })

// or the common helper:
extension Publisher {
  var firstValue: Output {
    get async throws {
      for try await v in values { return v }
      throw CancellationError()
    }
  }
}
"""),
         ("async → Publisher", "modern", r"""
func publisher<T>(_ op: @escaping () async throws -> T)
  -> AnyPublisher<T, Error> {
  Deferred {
    Future { promise in
      Task {
        do { promise(.success(try await op())) }
        catch { promise(.failure(error)) }
      }
    }
  }
  .eraseToAnyPublisher()
}
""")]),

    rules("Combine gotchas", "", [
        ("bad", "`Future` is eager — it runs at creation, not at subscription. Wrap in `Deferred`."),
        ("bad", "Forgetting `.store(in:)` → pipeline cancelled immediately, nothing happens."),
        ("bad", "`assign(to:\\.x, on: self)` creates a retain cycle. Use `sink { [weak self] }`."),
        ("bad", "`subscribe(on:)` affects the *subscription*, `receive(on:)` affects delivery downstream of it."),
        ("bad", "An error terminates the stream forever. Use `catch`/`replaceError` **inside** a `flatMap` to keep the outer stream alive."),
        ("legacy", "Combine has no built-in backpressure control in `sink` — it requests unlimited demand."),
    ]),
])


PATTERNS = sheet("async-patterns", "Timers & Async Patterns — Combine vs async/await", G,
    "Every periodic / concurrent case side by side. Grab and adapt.", [

    cmp("Repeating timer", "",
        [("Combine", "neutral", r"""
Timer.publish(every: 1, on: .main, in: .common)
  .autoconnect()                       // ConnectablePublisher!
  .scan(0) { n, _ in n + 1 }
  .sink { self.seconds = $0 }
  .store(in: &cancellables)

// stop:
cancellables.removeAll()
"""),
         ("async/await", "modern", r"""
timerTask = Task { @MainActor in
  var n = 0
  while !Task.isCancelled {
    try? await Task.sleep(for: .seconds(1))
    n += 1
    self.seconds = n
  }
}
// stop:
timerTask?.cancel()

// swift-async-algorithms:
for await _ in AsyncTimerSequence(interval: .seconds(1),
                                  clock: .continuous) { ... }
""")]),

    cmp("One-shot delay", "",
        [("Combine", "neutral", r"""
Just(())
  .delay(for: .seconds(2), scheduler: RunLoop.main)
  .sink { self.showToast = false }
  .store(in: &cancellables)
"""),
         ("async/await", "modern", r"""
Task {
  try await Task.sleep(for: .seconds(2))
  showToast = false
}
// cancellable, never blocks a thread
""")]),

    cmp("Countdown / polling until a condition", "",
        [("Combine", "neutral", r"""
Timer.publish(every: 1, on: .main, in: .common)
  .autoconnect()
  .scan(10) { n, _ in n - 1 }
  .prefix(while: { $0 >= 0 })          // completes at 0
  .sink(receiveCompletion: { _ in self.finish() },
        receiveValue: { self.remaining = $0 })
  .store(in: &cancellables)
"""),
         ("async/await", "modern", r"""
func countdown(from n: Int) async {
  for i in stride(from: n, through: 0, by: -1) {
    remaining = i
    guard i > 0 else { break }
    try? await Task.sleep(for: .seconds(1))
  }
  finish()
}

// Polling with backoff
while !Task.isCancelled {
  if try await job.isDone() { break }
  try await Task.sleep(for: .seconds(2))
}
""")]),

    cmp("Timeout on an operation", "",
        [("Combine", "neutral", r"""
request
  .timeout(.seconds(5), scheduler: DispatchQueue.main,
           customError: { APIError.timedOut })
  .sink(...)
  .store(in: &cancellables)
"""),
         ("async/await", "modern", r"""
func withTimeout<T: Sendable>(
  _ seconds: Double,
  _ op: @escaping @Sendable () async throws -> T
) async throws -> T {
  try await withThrowingTaskGroup(of: T.self) { group in
    group.addTask { try await op() }
    group.addTask {
      try await Task.sleep(for: .seconds(seconds))
      throw TimeoutError()
    }
    let first = try await group.next()!
    group.cancelAll()                    // cancel the loser
    return first
  }
}
""")]),

    cmp("Debounced search-as-you-type", "Classic live-coding exercise.",
        [("Combine", "neutral", r"""
final class SearchVM: ObservableObject {
  @Published var query = ""
  @Published private(set) var results: [Item] = []
  private var bag = Set<AnyCancellable>()

  init(api: API) {
    $query
      .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
      .removeDuplicates()
      .map { q in
        api.search(q).replaceError(with: [])
      }
      .switchToLatest()
      .receive(on: RunLoop.main)
      .assign(to: &$results)
  }
}
"""),
         ("async/await (Observation)", "modern", r"""
@MainActor @Observable
final class SearchVM {
  var query = "" { didSet { schedule() } }
  private(set) var results: [Item] = []
  private var task: Task<Void, Never>?

  private func schedule() {
    task?.cancel()
    task = Task {
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
      results = (try? await api.search(query)) ?? []
    }
  }
}

// SwiftUI-native alternative:
.task(id: query) {
  try? await Task.sleep(for: .milliseconds(300))
  results = await api.search(query)
}
""")]),

    cmp("Merge two sources of truth (cache + network)", "",
        [("Combine", "neutral", r"""
Publishers.Merge(
  cache.publisher.setFailureType(to: Error.self),
  network.publisher
)
.receive(on: DispatchQueue.main)
.sink(...)
.store(in: &cancellables)
"""),
         ("async/await", "modern", r"""
// AsyncStream that yields cache first, then network
AsyncThrowingStream { continuation in
  Task {
    if let cached = await cache.load() { continuation.yield(cached) }
    do {
      continuation.yield(try await network.load())
      continuation.finish()
    } catch { continuation.finish(throwing: error) }
  }
}
""")]),

    cmp("Serial vs parallel execution of N jobs", "",
        [("Combine", "neutral", r"""
// Parallel
Publishers.MergeMany(jobs).collect()

// Serial (one at a time)
jobs.publisher
  .flatMap(maxPublishers: .max(1)) { $0 }
  .collect()
"""),
         ("async/await", "modern", r"""
// Parallel
await withTaskGroup(of: Result.self) { g in
  for j in jobs { g.addTask { await j() } }
  return await g.reduce(into: []) { $0.append($1) }
}

// Serial
var out: [Result] = []
for j in jobs { out.append(await j()) }
""")]),

    code("Observing UIKit/system events", "Both worlds, same event.", r"""
// Combine
NotificationCenter.default
  .publisher(for: UIResponder.keyboardWillShowNotification)
  .compactMap { $0.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect }
  .map(\.height)
  .assign(to: &$keyboardHeight)

// async/await
for await note in NotificationCenter.default.notifications(
      named: UIResponder.keyboardWillShowNotification) {
  guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
  else { continue }
  keyboardHeight = frame.height
}
"""),

    rules("Which do I reach for?", "", [
        ("modern", "**async/await** — request/response, sequential logic, anything new, anything you must unit test simply."),
        ("neutral", "**Combine** — `@Published` glue in UIKit/pre-Observation SwiftUI, complex multi-source operator chains, `debounce`/`throttle` for free."),
        ("legacy", "**GCD** — only when interoperating with old code, or for `DispatchSource`-level primitives."),
        ("good", "You can mix: expose `AsyncStream` from a Combine pipeline via `.values`, or wrap an async call in `Deferred { Future { } }`."),
    ]),
])
