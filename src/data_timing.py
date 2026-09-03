"""Timing operators: what each one means in Combine, and the safe async/await equivalent."""

from render import sheet, code, cmp, rules, table, diagram
import diagrams as D

G = "Combine"

TIMING = sheet("timing", "Timing Operators — Combine vs Swift Concurrency", G,
    "debounce, throttle, delay, collect, timeout: what each one drops, and how to rebuild it safely with tasks and clocks.", [

    diagram("Six operators, one input",
            "Read down the column: at 200 ms every operator has made a different decision.",
            D.timing_marbles()),

    rules("The conceptual split", "This is the part people get wrong — the operators are the easy bit.", [
        ("neutral", "**Push vs pull.** A Combine publisher *pushes* whenever it likes; an `AsyncSequence` is *pulled* by its consumer. So Combine needs `buffer`/`debounce` to protect a slow consumer, while `for await` naturally applies backpressure — the producer waits for you."),
        ("neutral", "**Who owns the timer.** In Combine the operator owns it, invisibly, and is torn down with the `AnyCancellable`. In async code *you* own a `Task` — if you don't store and cancel it, it leaks or fires after the screen is gone."),
        ("neutral", "**Scheduler vs clock.** Combine takes a `Scheduler` (where *and* when work runs). Concurrency splits those: the **clock** decides *when* (`ContinuousClock`, `SuspendingClock`) and the **actor** decides *where*."),
        ("neutral", "**Cancellation.** `AnyCancellable.cancel()` tears the chain down synchronously. `Task.cancel()` is *cooperative* — a sleep throws, but your own loop must check `Task.isCancelled`."),
        ("neutral", "**Failure ends everything.** A Combine error terminates the stream permanently; there is no \"resume\". A thrown error ends one `for try await` loop — you can just start another."),
        ("neutral", "**Hot vs cold.** `Timer.publish` is a `ConnectablePublisher` (nothing until `.autoconnect()` or `.connect()`). An `AsyncStream` starts producing when its closure runs, whether or not anyone iterates — so bound its buffer."),
        ("good", "Practical rule: use Combine's operators when you're already in a Combine pipeline. In new code, model time with an injected `Clock` and own your `Task`s."),
    ]),

    table("Operator → meaning → async equivalent", "",
        ["Combine", "Semantics", "Drops values?", "Concurrency equivalent"],
        [["`debounce(for:scheduler:)`", "emit only after N of silence; keeps the **last** of a burst", "yes, most of them", "`AsyncSequence.debounce(for:)`* or a cancel-and-restart `Task`"],
         ["`throttle(for:scheduler:latest:)`", "at most one per window; `latest` picks first vs last", "yes", "`.throttle(for:latest:)`* or a last-emit timestamp on an actor"],
         ["`delay(for:tolerance:scheduler:)`", "shift every value later in time", "no", "`try await Task.sleep(for:)` before yielding"],
         ["`timeout(_:scheduler:customError:)`", "fail if no value arrives within N", "terminates", "`TaskGroup` race: work vs `Task.sleep`, then `cancelAll()`"],
         ["`collect(.byTime(s, n))`", "buffer a window into an array", "no (batches)", "`.chunks(ofCount:or:)`* or a manual buffer + deadline"],
         ["`collect(.byTimeOrCount(s, n, c))`", "flush on time **or** on size", "no", "same, with both conditions"],
         ["`measureInterval(using:)`", "emit the gap between upstream values", "no", "subtract two `clock.now` instants"],
         ["`Timer.publish(every:on:in:)`", "repeating ticks on a RunLoop", "n/a", "`AsyncTimerSequence`* or a `clock.sleep(until:)` loop"],
         ["`Publishers.Debounce` + `removeDuplicates`", "the search-as-you-type pair", "yes", "`.debounce().removeDuplicates()`*"],
         ["`.receive(on:)`", "deliver downstream on that scheduler", "no", "`@MainActor` / `await` on an actor"],
         ["`.subscribe(on:)`", "start the subscription there", "no", "`Task.detached` or a `nonisolated` func"]]),

    cmp("debounce — \"tell me when they stop typing\"", "Cancel-and-restart. The last value of a burst wins.",
        [("Combine", "neutral", r"""
$query
  .debounce(for: .milliseconds(300),
            scheduler: RunLoop.main)
  .removeDuplicates()
  .sink { [weak self] text in
    self?.search(text)
  }
  .store(in: &cancellables)

// The operator owns the timer. Cancelling the
// AnyCancellable cancels the pending emission.
"""),
         ("Swift Concurrency", "modern", r"""
@MainActor @Observable
final class SearchModel {
  var query = "" { didSet { schedule() } }
  private(set) var results: [Item] = []
  private var pending: Task<Void, Never>?

  private func schedule() {
    pending?.cancel()                  // restart the clock
    pending = Task { [query] in
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
      results = await search(query)
    }
  }

  func stop() { pending?.cancel() }    // call from onDisappear
}

// Safe because: one owner, one stored handle, and
// the whole thing is @MainActor — no shared mutable
// state crossing isolation domains.

// With swift-async-algorithms, no bookkeeping at all:
for await text in queries.debounce(for: .milliseconds(300)) {
  results = await search(text)
}
""")]),

    cmp("throttle — \"at most N per second\"", "Rate limiting. Note the two flavours.",
        [("Combine", "neutral", r"""
// latest: false -> the FIRST value of each window
scrollOffset
  .throttle(for: .milliseconds(200),
            scheduler: DispatchQueue.main,
            latest: false)
  .sink { recordScroll($0) }
  .store(in: &cancellables)

// latest: true -> the LAST value of each window
// (what you want for "show me the current value")
sensorReadings
  .throttle(for: .seconds(1),
            scheduler: DispatchQueue.main,
            latest: true)
  .assign(to: &$displayValue)
"""),
         ("Swift Concurrency", "modern", r"""
/// Leading-edge throttle. The actor makes the
/// timestamp check atomic - two callers can never
/// both pass the gate.
actor Throttle {
  private var last: ContinuousClock.Instant?
  private let interval: Duration

  init(interval: Duration) { self.interval = interval }

  func allow(now: ContinuousClock.Instant = .now) -> Bool {
    if let last, now - last < interval { return false }
    last = now
    return true
  }
}

let gate = Throttle(interval: .milliseconds(200))
if await gate.allow() { recordScroll(offset) }

// Trailing edge ("latest") = a debounce with a
// maximum wait, or simply:
for await value in readings.throttle(for: .seconds(1),
                                     latest: true) { ... }
""")]),

    cmp("delay & timeout", "One shifts, the other gives up.",
        [("Combine", "neutral", r"""
// delay: everything, later. Nothing is dropped.
Just(())
  .delay(for: .seconds(2), scheduler: RunLoop.main)
  .sink { self.showToast = false }
  .store(in: &cancellables)

// timeout: no value within N -> the stream FAILS
request
  .timeout(.seconds(5),
           scheduler: DispatchQueue.global(),
           customError: { APIError.timedOut })
  .sink(receiveCompletion: ..., receiveValue: ...)
  .store(in: &cancellables)

// tolerance lets the system coalesce timers:
.delay(for: .seconds(60),
       tolerance: .seconds(5),
       scheduler: RunLoop.main)
"""),
         ("Swift Concurrency", "modern", r"""
// delay
try await Task.sleep(for: .seconds(2))
showToast = false

// tolerance saves battery on long sleeps
try await Task.sleep(for: .seconds(60),
                     tolerance: .seconds(5))

// timeout: race the work against a sleep, then
// cancel the loser. Structured, so nothing leaks.
func withTimeout<T: Sendable>(
  _ limit: Duration,
  _ operation: @escaping @Sendable () async throws -> T
) async throws -> T {
  try await withThrowingTaskGroup(of: T.self) { group in
    group.addTask { try await operation() }
    group.addTask {
      try await Task.sleep(for: limit)
      throw TimeoutError()
    }
    let winner = try await group.next()!
    group.cancelAll()            // <- do not forget this
    return winner
  }
}

let user = try await withTimeout(.seconds(5)) {
  try await api.user()
}
""")]),

    cmp("collect(byTime:) — batching", "",
        [("Combine", "neutral", r"""
// Flush every 2 seconds
events
  .collect(.byTime(DispatchQueue.global(), .seconds(2)))
  .sink { batch in upload(batch) }
  .store(in: &cancellables)

// Flush every 2 seconds OR at 50 items,
// whichever comes first
events
  .collect(.byTimeOrCount(DispatchQueue.global(),
                          .seconds(2), 50))
  .sink { batch in upload(batch) }
  .store(in: &cancellables)

// collect() with no strategy waits for COMPLETION -
// on an endless publisher it buffers for ever.
"""),
         ("Swift Concurrency", "modern", r"""
// swift-async-algorithms
for await batch in events.chunks(
  ofCount: 50,
  or: .repeating(every: .seconds(2))
) {
  await upload(Array(batch))
}

// By hand, deadline-based so a slow trickle still
// flushes on time:
var buffer: [Event] = []
var deadline = ContinuousClock.now
  .advanced(by: .seconds(2))

for await event in events {
  buffer.append(event)
  if buffer.count >= 50 || .now >= deadline {
    await upload(buffer)
    buffer.removeAll(keepingCapacity: true)
    deadline = .now.advanced(by: .seconds(2))
  }
}
if !buffer.isEmpty { await upload(buffer) }
""")]),

    code("Repeating timers, without drift", "Sleeping for the interval accumulates every millisecond of overhead.", r"""
// WRONG: each iteration is interval + however long tick() took.
// After an hour you've drifted seconds.
while !Task.isCancelled {
  try await Task.sleep(for: .seconds(1))
  await tick()
}

// RIGHT: advance an absolute deadline, so the work's cost is absorbed.
func run() async throws {
  let clock = ContinuousClock()
  var next = clock.now
  while !Task.isCancelled {
    next = next.advanced(by: .seconds(1))
    try await clock.sleep(until: next, tolerance: .milliseconds(50))
    await tick()                       // late ticks don't shift the schedule
  }
}

// swift-async-algorithms does it for you
for await instant in AsyncTimerSequence(interval: .seconds(1), clock: .continuous) {
  await tick()
}

// Combine equivalent - the operator handles the schedule, you handle the lifetime
Timer.publish(every: 1, on: .main, in: .common)
  .autoconnect()                       // ConnectablePublisher: nothing happens without this
  .sink { _ in tick() }
  .store(in: &cancellables)
"""),

    cmp("Clocks and schedulers: pick deliberately", "The wrong one is a bug that only shows up in the field.",
        [("Combine schedulers", "legacy", r"""
DispatchQueue.main       // always delivers; use for UI
RunLoop.main             // PAUSES during scroll tracking
                         // and in modal run-loop modes
DispatchQueue.global(qos: .utility)
OperationQueue()         // has maxConcurrentOperationCount
ImmediateScheduler.shared // synchronous - great in tests

// Classic bug: RunLoop.main from a background thread.
// There is no run loop running there, so nothing fires.
somePublisher
  .subscribe(on: DispatchQueue.global())
  .debounce(for: .seconds(1), scheduler: RunLoop.main) // ok
  .receive(on: DispatchQueue.main)

// debounce on RunLoop.main will not fire while the
// user is dragging a scroll view. For search that's
// often desirable; for a progress readout it isn't.
"""),
         ("Concurrency clocks", "modern", r"""
ContinuousClock()   // monotonic, KEEPS COUNTING while
                    // the device is asleep. The default
                    // for Task.sleep(for:).
SuspendingClock()   // pauses while the machine sleeps -
                    // use for "5 s of CPU-time work"
Date / Calendar     // wall clock: can jump backwards
                    // (NTP, user edits). Never for durations.

// Deadlines are values you can pass around
let deadline = ContinuousClock.now.advanced(by: .seconds(30))
try await clock.sleep(until: deadline)

// Measure
let elapsed = try await ContinuousClock().measure {
  try await work()
}

// Where the work runs is a separate decision:
await MainActor.run { label.text = "done" }
""")]),

    code("Make time injectable — and your tests instant", "", r"""
// Depend on the `Clock` protocol, never on Task.sleep directly.
struct Poller<C: Clock> {
  let clock: C
  let interval: C.Duration

  func run(_ body: @Sendable () async -> Void) async throws {
    var next = clock.now
    while !Task.isCancelled {
      next = next.advanced(by: interval)
      try await clock.sleep(until: next, tolerance: nil)
      await body()
    }
  }
}

// Production
let poller = Poller(clock: ContinuousClock(), interval: .seconds(30))

// Tests: pointfreeco/swift-clocks — time only moves when you say so
@Test func pollsEverySecond() async throws {
  let clock = TestClock()
  var ticks = 0
  let task = Task { try await Poller(clock: clock, interval: .seconds(1))
                        .run { ticks += 1 } }
  await clock.advance(by: .seconds(3))
  #expect(ticks == 3)
  task.cancel()
}

// TCA gives you this as a dependency out of the box:
@Dependency(\.continuousClock) var clock

// Combine equivalent: inject the scheduler type
final class Model<S: Scheduler> {
  init(scheduler: S) { ... }        // ImmediateScheduler or a TestScheduler in tests
}
"""),

    code("Owning the Task safely", "Most async-timing bugs are lifetime bugs, not timing bugs.", r"""
// The state that a timer touches must live in ONE isolation domain.
@MainActor
final class TickerViewModel {
  private(set) var seconds = 0
  private var task: Task<Void, Never>?      // only ever touched on the main actor

  func start() {
    task?.cancel()                          // idempotent: no double timers
    task = Task { [weak self] in            // weak: don't keep the screen alive
      let clock = ContinuousClock()
      var next = clock.now
      while !Task.isCancelled {
        next = next.advanced(by: .seconds(1))
        try? await clock.sleep(until: next, tolerance: .milliseconds(50))
        guard let self, !Task.isCancelled else { return }
        self.seconds += 1                   // already on the main actor
      }
    }
  }

  func stop() { task?.cancel(); task = nil }
  deinit { task?.cancel() }
}

// In SwiftUI, prefer the framework's ownership - it cancels on disappear for you:
.task { await model.runTicker() }           // tied to the view's lifetime
.task(id: query) { await debouncedSearch() } // restarts when `query` changes

// Never Task.detached for a timer: it inherits no isolation and no cancellation,
// so it outlives the screen and races whatever it touches.
"""),

    rules("Safety checklist for async timing", "", [
        ("good", "Store every long-lived `Task` and cancel it in `stop()` / `onDisappear` / `deinit`."),
        ("good", "Cancel before restarting (`task?.cancel()` then reassign) — otherwise you accumulate timers."),
        ("good", "Re-check `Task.isCancelled` **after** every `await`; a sleep that throws is not the same as a loop that stops."),
        ("good", "Keep the mutated state and the `Task` handle in the same isolation domain (`@MainActor` or one `actor`)."),
        ("good", "Use absolute deadlines (`clock.sleep(until:)`) for anything periodic, so the work's cost doesn't accumulate as drift."),
        ("good", "Pass a `tolerance` on long sleeps so the OS can coalesce wakeups — it's real battery."),
        ("good", "Inject the `Clock`. A test that sleeps for real is a test that will flake in CI."),
        ("bad", "Don't use `Date()` differences to measure elapsed time — the wall clock can move backwards."),
        ("bad", "Don't `Task.detached` a timer, and don't spawn one per row/cell/view update."),
        ("bad", "Don't hold a strong `self` in a repeating task — the screen can never deallocate."),
        ("bad", "Don't `Thread.sleep` or busy-wait in async code; it blocks a cooperative thread that other tasks need."),
        ("neutral", "In Combine, the mirror-image rules are: always `.store(in:)`, always `.autoconnect()` a `Timer`, and know whether your scheduler is `RunLoop.main` (pauses) or `DispatchQueue.main` (doesn't)."),
    ]),
])
