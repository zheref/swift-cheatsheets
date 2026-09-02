"""The Composable Architecture cheat sheets (TCA 1.x, @Reducer / @ObservableState era)."""

from render import sheet, code, cmp, rules, table

G = "Composable Architecture"

TCA_CORE = sheet("tca-core", "TCA — Core Loop", G,
    "State - Action - Reducer - Store - Effect. Everything else is composition.", [

    rules("The 5 nouns", "Memorise this; every TCA answer starts here.", [
        ("modern", "**State** — a value type holding everything the feature needs to render."),
        ("modern", "**Action** — an enum of *everything that can happen* (user intent + system results)."),
        ("modern", "**Reducer** — `(inout State, Action) -> Effect<Action>`. Pure, synchronous, testable."),
        ("modern", "**Store** — runtime that holds state, runs the reducer, executes effects."),
        ("modern", "**Effect** — the *only* place async / side effects live. Feeds actions back in."),
        ("neutral", "Golden rule: reducers never do async work; effects never mutate state."),
    ]),

    code("Minimal feature", "The skeleton you should be able to type from memory.", r"""
import ComposableArchitecture

@Reducer
struct Counter {
  @ObservableState
  struct State: Equatable {
    var count = 0
    var fact: String?
    var isLoading = false
  }

  enum Action {
    case incrementTapped
    case decrementTapped
    case factButtonTapped
    case factResponse(Result<String, Error>)
  }

  @Dependency(\.numberFact) var numberFact

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .incrementTapped:
        state.count += 1
        return .none

      case .decrementTapped:
        state.count -= 1
        return .none

      case .factButtonTapped:
        state.isLoading = true
        return .run { [count = state.count] send in
          await send(.factResponse(Result { try await numberFact.fetch(count) }))
        }

      case let .factResponse(.success(fact)):
        state.isLoading = false
        state.fact = fact
        return .none

      case .factResponse(.failure):
        state.isLoading = false
        return .none
      }
    }
  }
}
"""),

    code("The view + entry point", "`StoreOf<F>` is `Store<F.State, F.Action>`.", r"""
struct CounterView: View {
  let store: StoreOf<Counter>          // @Bindable var store  when you need bindings

  var body: some View {
    Form {
      // With @ObservableState you read state directly - no WithViewStore needed.
      Text("\(store.count)")
      Button("-") { store.send(.decrementTapped) }
      Button("+") { store.send(.incrementTapped) }
      if store.isLoading { ProgressView() }
      if let fact = store.fact { Text(fact) }
    }
  }
}

// App entry
@main
struct MyApp: App {
  static let store = Store(initialState: Counter.State()) {
    Counter()
      ._printChanges()               // debug: logs every action + state diff
  }
  var body: some Scene {
    WindowGroup { CounterView(store: Self.store) }
  }
}
"""),

    cmp("Action naming", "Actions describe *facts*, not commands to the store.",
        [("Do — user intent + results", "good", r"""
enum Action {
  case onAppear
  case saveButtonTapped
  case emailChanged(String)
  case userResponse(Result<User, Error>)
  case timerTicked
}
"""),
         ("Don't — imperative / logic-y", "bad", r"""
enum Action {
  case setLoadingTrue        // that's state, not an event
  case fetchUserAndSave      // two things
  case reloadEverything      // what happened?
  case doTheThing(() -> Void)// not Equatable, untestable
}
""")]),

    code("Effects cheat list", "Everything `Effect` gives you.", r"""
return .none                                   // no side effect

return .send(.otherAction)                     // synchronous follow-up (avoid for logic sharing)

return .run { send in                          // async work
  let value = try await api.load()
  await send(.loaded(value))
} catch: { error, send in
  await send(.failed(error))
}

return .merge(.run { ... }, .run { ... })      // run in parallel
return .concatenate(.run { ... }, .run { ... })// run in order

return .run { _ in await analytics.log("x") }  // fire-and-forget

// Cancellation
enum CancelID { case search, timer }
return .run { ... }.cancellable(id: CancelID.search, cancelInFlight: true)
return .cancel(id: CancelID.search)
"""),

    code("Debounce & long-running effects", "Debounced search + a timer effect started/stopped by actions.", r"""
@Dependency(\.continuousClock) var clock

case let .queryChanged(q):
  state.query = q
  return .run { send in
    try await clock.sleep(for: .milliseconds(300))    // debounce
    await send(.searchResponse(try await api.search(q)))
  }
  .cancellable(id: CancelID.search, cancelInFlight: true)

case .startTimerTapped:
  return .run { send in
    for await _ in clock.timer(interval: .seconds(1)) {
      await send(.timerTicked)
    }
  }
  .cancellable(id: CancelID.timer)

case .stopTimerTapped:
  return .cancel(id: CancelID.timer)
"""),

    code("Bindings (two-way SwiftUI state)", "`BindableAction` + `BindingReducer` + `@Bindable`.", r"""
@Reducer
struct Settings {
  @ObservableState
  struct State: Equatable {
    var displayName = ""
    var notificationsOn = false
  }

  enum Action: BindableAction {
    case binding(BindingAction<State>)
    case saveTapped
  }

  var body: some ReducerOf<Self> {
    BindingReducer()                       // must come before your Reduce
    Reduce { state, action in
      switch action {
      case .binding(\.notificationsOn):    // react to one specific binding
        return .run { _ in await push.sync() }
      case .binding, .saveTapped:
        return .none
      }
    }
  }
}

struct SettingsView: View {
  @Bindable var store: StoreOf<Settings>
  var body: some View {
    Form {
      TextField("Name", text: $store.displayName)
      Toggle("Notifications", isOn: $store.notificationsOn)
    }
  }
}
"""),

    code("Shared state (across features)", "`@Shared` replaces passing the same value up and down the tree.", r"""
// In-memory, app-scoped
extension SharedKey where Self == InMemoryKey<Int> {
  static var streak: Self { .inMemory("streak") }
}

@ObservableState
struct State: Equatable {
  @Shared(.appStorage("hasOnboarded")) var hasOnboarded = false
  @Shared(.streak) var streak = 0
}

// Mutating shared state inside a reducer:
state.$streak.withLock { $0 += 1 }
"""),
])


TCA_COMPOSE = sheet("tca-compose", "TCA — Composition, Dependencies, Testing", G,
    "How small features become a big app, and how you prove it works.", [

    code("Scope: parent embeds child", "One `Scope` per child domain, then the parent's own `Reduce`.", r"""
@Reducer
struct AppFeature {
  @ObservableState
  struct State: Equatable {
    var counter = Counter.State()
    var profile = Profile.State()
  }
  enum Action {
    case counter(Counter.Action)
    case profile(Profile.Action)
  }

  var body: some ReducerOf<Self> {
    Scope(state: \.counter, action: \.counter) { Counter() }
    Scope(state: \.profile, action: \.profile) { Profile() }

    Reduce { state, action in
      switch action {
      case .counter(.incrementTapped):        // parent can observe child actions
        state.profile.score += 1
        return .none
      case .counter, .profile:
        return .none
      }
    }
  }
}

// View side
CounterView(store: store.scope(state: \.counter, action: \.counter))
"""),

    code("Optional & collection children", "`ifLet` for optional state, `forEach` for identified collections.", r"""
@ObservableState
struct State: Equatable {
  var editor: Editor.State?                        // optional child
  var rows: IdentifiedArrayOf<Row.State> = []      // collection of children
}
enum Action {
  case editor(Editor.Action)
  case rows(IdentifiedActionOf<Row>)
}

var body: some ReducerOf<Self> {
  Reduce { ... }
    .ifLet(\.editor, action: \.editor) { Editor() }
    .forEach(\.rows, action: \.rows) { Row() }
}

// View
ForEach(store.scope(state: \.rows, action: \.rows)) { rowStore in
  RowView(store: rowStore)
}
"""),

    code("Child → parent communication", "Prefer a `delegate` action over the parent snooping on internals.", r"""
@Reducer
struct Row {
  enum Action {
    case deleteTapped
    case delegate(Delegate)                  // public API of the child
    enum Delegate: Equatable { case didRequestDelete(Row.State.ID) }
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .deleteTapped:
        return .send(.delegate(.didRequestDelete(state.id)))
      case .delegate:
        return .none                          // parent handles it
      }
    }
  }
}

// Parent
case let .rows(.element(id: _, action: .delegate(.didRequestDelete(id)))):
  state.rows.remove(id: id)
  return .none
"""),

    code("Dependency client", "Struct-of-closures, not a protocol. Swappable, `Sendable`, no subclassing.", r"""
@DependencyClient
struct NumberFactClient {
  var fetch: @Sendable (Int) async throws -> String
}

extension NumberFactClient: DependencyKey {
  static let liveValue = Self { number in
    let url = URL(string: "http://numbersapi.com/\(number)")!
    let (data, _) = try await URLSession.shared.data(from: url)
    return String(decoding: data, as: UTF8.self)
  }
  static let previewValue = Self { "\($0) is a preview number." }
  static let testValue = Self()               // unimplemented -> test fails if called
}

extension DependencyValues {
  var numberFact: NumberFactClient {
    get { self[NumberFactClient.self] }
    set { self[NumberFactClient.self] = newValue }
  }
}
"""),

    rules("Built-in dependencies worth knowing", "Never reach for the global versions inside a reducer.", [
        ("bad", "`Date()` → use `@Dependency(\\.date.now)`"),
        ("bad", "`UUID()` → use `@Dependency(\\.uuid)` (`.incrementing` in tests)"),
        ("bad", "`Task.sleep` / `Timer` → use `@Dependency(\\.continuousClock)` + `TestClock`"),
        ("bad", "`Int.random(in:)` → use `@Dependency(\\.withRandomNumberGenerator)`"),
        ("neutral", "`@Dependency(\\.mainQueue)` for scheduler-based code, `\\.openURL`, `\\.dismiss`"),
        ("good", "Override for a subtree: `.dependency(\\.uuid, .incrementing)` on a reducer, or `withDependencies { } operation: { }`"),
    ]),

    code("TestStore — exhaustive testing", "Every state mutation and every received action must be asserted.", r"""
@Test
func incrementAndFetchFact() async {
  let store = await TestStore(initialState: Counter.State()) {
    Counter()
  } withDependencies: {
    $0.numberFact.fetch = { "\($0) is a good number." }
  }

  await store.send(.incrementTapped) {
    $0.count = 1                        // assert the *diff* only
  }

  await store.send(.factButtonTapped) {
    $0.isLoading = true
  }

  await store.receive(\.factResponse.success) {
    $0.isLoading = false
    $0.fact = "1 is a good number."
  }
}
"""),

    code("Testing time-based effects", "`TestClock` makes debounce/timers instant and deterministic.", r"""
let clock = TestClock()
let store = await TestStore(initialState: Search.State()) {
  Search()
} withDependencies: {
  $0.continuousClock = clock
  $0.apiClient.search = { _ in ["swift"] }
}

await store.send(.queryChanged("sw")) { $0.query = "sw" }
await clock.advance(by: .milliseconds(300))
await store.receive(\.searchResponse) { $0.results = ["swift"] }

// Non-exhaustive style (integration tests):
store.exhaustivity = .off(showSkippedAssertions: true)
"""),

    table("Common TCA pitfalls", "The things interviewers poke at.",
        ["Symptom", "Cause", "Fix"],
        [["\"Unhandled action received\"", "Effect emitted an action you didn't assert",
          "`await store.receive(\\.case)` or finish/cancel the effect"],
         ["Test hangs", "Long-running effect never ends", "`.cancellable(id:)` + `await store.send(.stop)`, or `store.finish()`"],
         ["State not updating in view", "Missing `@ObservableState` or store not scoped", "Add the macro; scope with key paths"],
         ["Effect keeps old state", "Captured `state` after mutation", "Capture explicitly: `.run { [x = state.x] send in ... }`"],
         ["Duplicate network calls", "No cancellation on re-entry", "`cancelInFlight: true`"],
         ["`Store` deinit warnings", "Child store outlived parent state", "Use `ifLet`/`forEach` scoping, not manual stores"]]),
])


TCA_NAV = sheet("tca-nav", "TCA + SwiftUI — Navigation & UI", G,
    "Tree-based (@Presents) for sheets/alerts, stack-based (StackState) for push navigation.", [

    rules("Pick your navigation style", "", [
        ("modern", "**Tree-based** — `@Presents var destination: Destination.State?`. Best for sheets, popovers, alerts, one-off drill-ins."),
        ("modern", "**Stack-based** — `var path = StackState<Path.State>()`. Best for arbitrarily deep push navigation."),
        ("neutral", "Both make navigation *state-driven*: set state → screen appears. Deep links become `State` construction."),
        ("good", "`@Presents` gives you free dismissal handling: SwiftUI setting the binding to nil sends `.dismiss`."),
    ]),

    code("Tree-based: sheet / popover / fullScreenCover", "One enum reducer for all destinations of a screen.", r"""
@Reducer
struct Inventory {
  @Reducer
  enum Destination {                       // @Reducer on an enum = destination reducer
    case addItem(ItemForm)
    case detail(ItemDetail)
  }

  @ObservableState
  struct State: Equatable {
    @Presents var destination: Destination.State?
    var items: IdentifiedArrayOf<Item> = []
  }

  enum Action {
    case addTapped
    case itemTapped(Item.ID)
    case destination(PresentationAction<Destination.Action>)
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .addTapped:
        state.destination = .addItem(ItemForm.State())
        return .none

      case let .itemTapped(id):
        guard let item = state.items[id: id] else { return .none }
        state.destination = .detail(ItemDetail.State(item: item))
        return .none

      // Listen to a child action across the presentation boundary:
      case let .destination(.presented(.addItem(.delegate(.saved(item))))):
        state.items.append(item)
        state.destination = nil            // programmatic dismiss
        return .none

      case .destination:
        return .none
      }
    }
    .ifLet(\.$destination, action: \.destination)
  }
}
"""),

    code("Tree-based: the view side", "`$store.scope` turns optional child state into a SwiftUI item binding.", r"""
struct InventoryView: View {
  @Bindable var store: StoreOf<Inventory>

  var body: some View {
    List {
      ForEach(store.items) { item in
        Button(item.name) { store.send(.itemTapped(item.id)) }
      }
    }
    .toolbar { Button("Add") { store.send(.addTapped) } }

    .sheet(item: $store.scope(state: \.destination?.addItem,
                              action: \.destination.addItem)) { formStore in
      NavigationStack { ItemFormView(store: formStore) }
    }

    .navigationDestination(item: $store.scope(state: \.destination?.detail,
                                              action: \.destination.detail)) { detailStore in
      ItemDetailView(store: detailStore)
    }
    // also: .popover(item:), .fullScreenCover(item:)
  }
}
"""),

    code("Alerts & confirmation dialogs", "`AlertState` keeps alerts testable — no view code decides anything.", r"""
@ObservableState
struct State: Equatable {
  @Presents var alert: AlertState<Action.Alert>?
}

enum Action {
  case deleteTapped
  case alert(PresentationAction<Alert>)
  @CasePathable enum Alert: Equatable { case confirmDelete }
}

case .deleteTapped:
  state.alert = AlertState {
    TextState("Delete this item?")
  } actions: {
    ButtonState(role: .destructive, action: .confirmDelete) { TextState("Delete") }
    ButtonState(role: .cancel) { TextState("Cancel") }
  } message: {
    TextState("This cannot be undone.")
  }
  return .none

case .alert(.presented(.confirmDelete)):
  state.items.remove(id: state.selectedID)
  return .none

case .alert:
  return .none

// reducer:  .ifLet(\.$alert, action: \.alert)
// view:     .alert($store.scope(state: \.alert, action: \.alert))
"""),

    code("Stack-based navigation", "`StackState` + `NavigationStack(path:)`. Deep links = appending to the path.", r"""
@Reducer
struct AppFeature {
  @Reducer
  enum Path {
    case detail(Detail)
    case settings(Settings)
  }

  @ObservableState
  struct State: Equatable {
    var path = StackState<Path.State>()
    var root = Root.State()
  }

  enum Action {
    case root(Root.Action)
    case path(StackActionOf<Path>)
  }

  var body: some ReducerOf<Self> {
    Scope(state: \.root, action: \.root) { Root() }
    Reduce { state, action in
      switch action {
      // React to an action from *any* Detail screen on the stack:
      case let .path(.element(id: id, action: .detail(.doneTapped))):
        state.path.pop(from: id)
        return .none
      case .root, .path:
        return .none
      }
    }
    .forEach(\.path, action: \.path)
  }
}
"""),

    code("Stack-based: the view side", "`NavigationLink(state:)` replaces `NavigationLink(destination:)`.", r"""
struct AppView: View {
  @Bindable var store: StoreOf<AppFeature>

  var body: some View {
    NavigationStack(path: $store.scope(state: \.path, action: \.path)) {
      RootView(store: store.scope(state: \.root, action: \.root))
    } destination: { store in
      switch store.case {                       // exhaustive over Path
      case let .detail(store):   DetailView(store: store)
      case let .settings(store): SettingsView(store: store)
      }
    }
  }
}

// Inside RootView — push by *state*, not by view:
NavigationLink(state: AppFeature.Path.State.detail(Detail.State(id: item.id))) {
  Text(item.name)
}

// Programmatic push / pop / deep link:
state.path.append(.detail(Detail.State(id: id)))
state.path.removeLast()
state.path = StackState([.settings(Settings.State())])
"""),

    code("Dismissing yourself (child-initiated)", "`@Dependency(\\.dismiss)` — the child doesn't need to know its parent.", r"""
@Reducer
struct ItemForm {
  @Dependency(\.dismiss) var dismiss

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .cancelTapped:
        return .run { _ in await self.dismiss() }   // must be in .run, not sync
      ...
      }
    }
  }
}
"""),

    cmp("Navigation: vanilla SwiftUI vs TCA", "Same idea — state drives navigation — but TCA moves the state into the reducer.",
        [("Vanilla SwiftUI", "legacy", r"""
struct ListView: View {
  @State private var selected: Item?
  @State private var showingAdd = false

  var body: some View {
    List(items) { item in
      Button(item.name) { selected = item }
    }
    .sheet(item: $selected) { DetailView(item: $0) }
    .sheet(isPresented: $showingAdd) { AddView() }
  }
}
"""),
         ("TCA", "modern", r"""
struct ListView: View {
  @Bindable var store: StoreOf<Feature>

  var body: some View {
    List(store.items) { item in
      Button(item.name) { store.send(.itemTapped(item.id)) }
    }
    .sheet(item: $store.scope(state: \.destination?.detail,
                              action: \.destination.detail),
           content: DetailView.init(store:))
  }
}
// Navigation is now testable + deep-linkable.
""")]),

    table("Modifier → TCA scope mapping", "Cheat table for the live exercise.",
        ["SwiftUI", "TCA form"],
        [["`.sheet(isPresented:)`", "`.sheet(item: $store.scope(state: \\.destination?.x, action: \\.destination.x))`"],
         ["`.sheet(item:)`", "same as above (identity comes from the store)"],
         ["`.alert(isPresented:)`", "`.alert($store.scope(state: \\.alert, action: \\.alert))`"],
         ["`.confirmationDialog`", "`.confirmationDialog($store.scope(state: \\.dialog, action: \\.dialog))`"],
         ["`NavigationStack(path:)`", "`NavigationStack(path: $store.scope(state: \\.path, action: \\.path))`"],
         ["`NavigationLink(value:)`", "`NavigationLink(state: Path.State.detail(...))`"],
         ["`@Environment(\\.dismiss)`", "`@Dependency(\\.dismiss)` inside the reducer"]]),
])

SHEETS = [TCA_CORE, TCA_COMPOSE, TCA_NAV]
