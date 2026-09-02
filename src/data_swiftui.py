"""SwiftUI cheat sheets: state & data flow, layout/views, and the UIKit comparison."""

from render import sheet, code, cmp, rules, table

G = "SwiftUI"

SWIFTUI_STATE = sheet("swiftui-state", "SwiftUI — State & Data Flow", G,
    "Pick the wrong wrapper and the view either never updates or resets constantly.", [

    table("Property wrapper decision table", "Left column is what you should reach for first.",
        ["Wrapper", "Owns the value?", "Use when"],
        [["`@State`", "yes", "view-local value type, or (iOS 17+) a view-owned `@Observable` object"],
         ["`@Binding`", "no", "child needs read/write access to a parent's state"],
         ["`@Observable` + `let`/`@State`", "depends", "reference-type model (iOS 17+). Replaces `ObservableObject`"],
         ["`@Bindable`", "no", "you need `$` bindings into an `@Observable` object you don't own"],
         ["`@Environment`", "no", "system values (`\\.dismiss`, `\\.colorScheme`) or injected `@Observable` models"],
         ["`@StateObject`", "yes", "**legacy** — view creates an `ObservableObject`; created once per view identity"],
         ["`@ObservedObject`", "no", "**legacy** — object passed in from outside"],
         ["`@EnvironmentObject`", "no", "**legacy** — `ObservableObject` from the environment"],
         ["`@AppStorage` / `@SceneStorage`", "yes", "UserDefaults / state restoration"],
         ["`@FocusState`", "yes", "keyboard focus for text fields"]]),

    cmp("Observation (iOS 17+) vs ObservableObject", "The single biggest modern-SwiftUI talking point.",
        [("Modern — @Observable", "modern", r"""
@Observable
final class Cart {
  var items: [Item] = []
  var isLoading = false
  var total: Decimal { items.reduce(0) { $0 + $1.price } }
}

struct CartView: View {
  @State private var cart = Cart()        // view owns it
  var body: some View {
    List(cart.items) { ... }
    ChildView(cart: cart)                 // plain let, no wrapper needed
  }
}

struct ChildView: View {
  @Bindable var cart: Cart                // only when you need $bindings
  var body: some View { Toggle("Gift", isOn: $cart.isGift) }
}

// Tracks per-property: a view only re-renders if it READ that property.
"""),
         ("Legacy — ObservableObject", "legacy", r"""
final class Cart: ObservableObject {
  @Published var items: [Item] = []
  @Published var isLoading = false
}

struct CartView: View {
  @StateObject private var cart = Cart()  // created ONCE
  var body: some View {
    List(cart.items) { ... }
    ChildView(cart: cart)
  }
}

struct ChildView: View {
  @ObservedObject var cart: Cart          // passed in; do NOT create here
  var body: some View { ... }
}

// objectWillChange fires for ANY @Published change -> whole view re-renders.
""")]),

    code("State ↔ Binding", "`$` gives you the projected value.", r"""
struct Parent: View {
  @State private var name = ""
  @State private var isOn = false

  var body: some View {
    VStack {
      Child(name: $name)                // pass a binding down
      Toggle("On", isOn: $isOn)
      Text(name)
    }
  }
}

struct Child: View {
  @Binding var name: String
  var body: some View { TextField("Name", text: $name) }
}

// Derived / computed binding
let upper = Binding(
  get: { name.uppercased() },
  set: { name = $0.lowercased() }
)
// Optional -> non-optional binding
Binding($optionalName) ?? .constant("")
"""),

    code("Environment injection", "iOS 17+ `@Observable` works with plain `@Environment`.", r"""
@Observable final class Session { var user: User? }

// Inject
ContentView()
  .environment(session)                  // @Observable
  .environmentObject(legacyStore)        // ObservableObject (legacy)

// Consume
struct ProfileView: View {
  @Environment(Session.self) private var session
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Text(session.user?.name ?? "Guest")
    Button("Close") { dismiss() }
  }
}

// Custom environment value (iOS 17+ macro)
extension EnvironmentValues {
  @Entry var accentTheme: Theme = .default
}
"""),

    rules("Identity & lifetime rules", "Where most SwiftUI bugs come from.", [
        ("bad", "`@State` initialisers run every `body` evaluation, but the value is kept — never rely on the initialiser running once for side effects."),
        ("bad", "Creating an `ObservableObject` with `@ObservedObject var vm = VM()` recreates it on every render. Use `@StateObject`."),
        ("bad", "Changing a view's **structural identity** (branch of `if`, position in a `ForEach`) destroys its `@State`."),
        ("good", "Give `ForEach` stable IDs (`Identifiable`), never array indices for mutable collections."),
        ("good", "`.id(value)` deliberately forces a fresh identity — useful to reset a subview."),
        ("good", "`.task(id:)` cancels and restarts when the id changes; it's tied to view lifetime."),
        ("neutral", "`onAppear`/`onDisappear` can fire multiple times (e.g. in `NavigationStack`); prefer `.task` for async work."),
    ]),

    code("Async work in a view", "", r"""
struct FeedView: View {
  @State private var items: [Item] = []
  @State private var phase: Phase = .loading

  var body: some View {
    List(items) { ItemRow($0) }
      .task {                              // auto-cancelled on disappear
        do { items = try await api.feed() ; phase = .loaded }
        catch { phase = .failed(error) }
      }
      .refreshable {                       // pull-to-refresh, async by design
        items = (try? await api.feed()) ?? items
      }
      .task(id: selectedCategory) { ... }  // restart when the id changes
  }
}
"""),
])


SWIFTUI_VIEWS = sheet("swiftui-views", "SwiftUI — Views, Layout & Animation", G,
    "Layout system, lists, modifiers, animation, performance.", [

    code("Layout containers", "SwiftUI layout = parent proposes a size, child chooses, parent places.", r"""
VStack(alignment: .leading, spacing: 8) { ... }
HStack(alignment: .firstTextBaseline) { ... }
ZStack(alignment: .bottomTrailing) { ... }

ScrollView { LazyVStack(pinnedViews: [.sectionHeaders]) { ... } }
ScrollView(.horizontal) { LazyHStack { ... } }

LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)]) { ... }

Grid {                                    // iOS 16+, true 2D alignment
  GridRow { Text("A"); Text("B") }
  GridRow { Text("C").gridCellColumns(2) }
}

ViewThatFits { WideLayout(); NarrowLayout() }
Spacer(); Divider()
"""),

    code("Sizing & alignment", "The order of modifiers matters — each one wraps the previous view.", r"""
Text("Hi")
  .padding(12)                 // pad first...
  .background(.blue)           // ...then background covers the padding
  .frame(maxWidth: .infinity, alignment: .leading)
  .frame(height: 44)
  .clipShape(.rect(cornerRadius: 12))

// .frame(width:height:) fixes a size
// .frame(maxWidth: .infinity) expands to fill the proposal
// .fixedSize() tells the child to use its ideal size (fixes truncated text)
// .layoutPriority(1) wins space in a stack

GeometryReader { proxy in                 // greedy: fills all offered space
  Circle().frame(width: proxy.size.width * 0.5)
}
"""),

    code("Lists & collections", "", r"""
List {
  Section("Today") {
    ForEach(items) { item in
      NavigationLink(value: item) { ItemRow(item: item) }
        .swipeActions { Button("Delete", role: .destructive) { delete(item) } }
    }
    .onDelete { indexSet in items.remove(atOffsets: indexSet) }
    .onMove { from, to in items.move(fromOffsets: from, toOffset: to) }
  }
}
.listStyle(.insetGrouped)
.searchable(text: $query, prompt: "Search")
.navigationDestination(for: Item.self) { ItemDetail(item: $0) }
.toolbar { ToolbarItem(placement: .topBarTrailing) { EditButton() } }

// Editable rows: bind directly into the collection (iOS 15+)
ForEach($items) { $item in TextField("Name", text: $item.name) }
"""),

    code("Navigation (vanilla SwiftUI)", "", r"""
NavigationStack(path: $path) {                    // path: [Route] or NavigationPath
  RootView()
    .navigationDestination(for: Route.self) { route in
      switch route {
      case .detail(let id): DetailView(id: id)
      case .settings:       SettingsView()
      }
    }
}
NavigationLink("Open", value: Route.detail(id))   // value-based, decoupled

path.append(Route.settings)      // programmatic push
path.removeLast()                // pop
path = NavigationPath()          // pop to root

NavigationSplitView { Sidebar() } detail: { Detail() }   // iPad / Mac
"""),

    code("Animation & transitions", "", r"""
// Implicit — animates any change to values this view depends on
Circle().scaleEffect(scale).animation(.spring(duration: 0.3), value: scale)

// Explicit — animate the state change itself
withAnimation(.easeInOut(duration: 0.25)) { isExpanded.toggle() }

// Transitions for insertion/removal
if isShown {
  Banner().transition(.move(edge: .top).combined(with: .opacity))
}

// Matched geometry (hero animations)
@Namespace private var ns
Image(...).matchedGeometryEffect(id: "hero", in: ns)

// Phase / keyframe animation (iOS 17+)
.phaseAnimator([1.0, 1.2]) { view, phase in view.scaleEffect(phase) }
.sensoryFeedback(.success, trigger: didSave)
"""),

    code("Reusable building blocks", "", r"""
// ViewModifier
struct CardStyle: ViewModifier {
  func body(content: Content) -> some View {
    content.padding(16)
      .background(.background.secondary, in: .rect(cornerRadius: 14))
      .shadow(radius: 2, y: 1)
  }
}
extension View { func card() -> some View { modifier(CardStyle()) } }

// @ViewBuilder for conditional content
@ViewBuilder
func statusView(_ s: Status) -> some View {
  switch s {
  case .loading: ProgressView()
  case .error(let e): Text(e.localizedDescription).foregroundStyle(.red)
  case .loaded(let items): List(items) { ItemRow($0) }
  }
}

// Generic container
struct Card<Content: View>: View {
  @ViewBuilder let content: () -> Content
  var body: some View { VStack { content() }.card() }
}

// PreferenceKey: child -> parent communication
struct HeightKey: PreferenceKey {
  static var defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}
"""),

    rules("Performance rules", "", [
        ("good", "Keep `body` cheap and pure — it can run many times per frame."),
        ("good", "Split big views into small `View` structs so re-render scope stays tiny."),
        ("good", "Use `Lazy*` stacks/grids for long content; `List` already recycles."),
        ("bad", "Avoid `AnyView` — it erases identity and defeats the diffing engine."),
        ("bad", "Avoid heavy work or `Date()` inside `body`."),
        ("bad", "`GeometryReader` in a stack collapses siblings; prefer `.containerRelativeFrame` or `onGeometryChange` (iOS 18)."),
        ("neutral", "`Equatable` conformance + `.equatable()` can short-circuit expensive diffs."),
        ("neutral", "Instruments → *SwiftUI* template shows view body counts and cause-of-update."),
    ]),
])


SWIFTUI_UIKIT = sheet("swiftui-uikit", "SwiftUI vs UIKit", G,
    "Translate any UIKit answer into SwiftUI and back.", [

    table("Concept mapping", "",
        ["UIKit", "SwiftUI"],
        [["`UIViewController`", "`View` struct (no controller object)"],
         ["`viewDidLoad`", "`.task { }` / `.onAppear { }` (fires each appearance)"],
         ["`viewWillAppear`", "`.onAppear`"],
         ["`deinit` / `viewDidDisappear`", "`.onDisappear`, or `.task` auto-cancel"],
         ["`UITableView` + data source", "`List` / `ForEach`"],
         ["`UICollectionView` + compositional layout", "`LazyVGrid` / `Grid`"],
         ["`UIStackView`", "`VStack` / `HStack`"],
         ["Auto Layout constraints", "layout modifiers (`frame`, `padding`, `alignment`)"],
         ["`UINavigationController`", "`NavigationStack`"],
         ["`UISplitViewController`", "`NavigationSplitView`"],
         ["`present(_:animated:)`", "`.sheet` / `.fullScreenCover`"],
         ["`UIAlertController`", "`.alert` / `.confirmationDialog`"],
         ["Target-action / `IBAction`", "`Button { }` closure"],
         ["Delegate & data source protocols", "closures + declarative data"],
         ["`NotificationCenter` for state", "`@Observable` / `@Environment`"],
         ["`UIView.animate`", "`withAnimation` / `.animation(_:value:)`"],
         ["`reloadData()`", "state change → automatic diff"],
         ["`prepareForSegue`", "pass values into the destination `View`'s init"],
         ["`UIRefreshControl`", "`.refreshable { }`"],
         ["`UISearchController`", "`.searchable(text:)`"]]),

    cmp("A list screen, both ways", "",
        [("UIKit", "legacy", r"""
final class ItemsVC: UITableViewController {
  private var items: [Item] = [] {
    didSet { tableView.reloadData() }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    tableView.register(Cell.self, forCellReuseIdentifier: "c")
    Task { items = (try? await api.items()) ?? [] }
  }

  override func tableView(_ t: UITableView,
                          numberOfRowsInSection s: Int) -> Int { items.count }

  override func tableView(_ t: UITableView,
                          cellForRowAt ip: IndexPath) -> UITableViewCell {
    let cell = t.dequeueReusableCell(withIdentifier: "c", for: ip)
    cell.textLabel?.text = items[ip.row].name
    return cell
  }

  override func tableView(_ t: UITableView, didSelectRowAt ip: IndexPath) {
    navigationController?.pushViewController(
      DetailVC(item: items[ip.row]), animated: true)
  }
}
"""),
         ("SwiftUI", "modern", r"""
struct ItemsView: View {
  @State private var items: [Item] = []

  var body: some View {
    NavigationStack {
      List(items) { item in
        NavigationLink(item.name, value: item)
      }
      .navigationDestination(for: Item.self) { DetailView(item: $0) }
      .task { items = (try? await api.items()) ?? [] }
    }
  }
}
""")]),

    code("Embedding UIKit in SwiftUI", "`UIViewRepresentable` — know the 3 members + Coordinator.", r"""
struct TextViewRepresentable: UIViewRepresentable {
  @Binding var text: String

  func makeUIView(context: Context) -> UITextView {
    let tv = UITextView()
    tv.delegate = context.coordinator
    return tv
  }

  func updateUIView(_ tv: UITextView, context: Context) {
    if tv.text != text { tv.text = text }      // guard against feedback loops
  }

  func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

  final class Coordinator: NSObject, UITextViewDelegate {
    let text: Binding<String>
    init(text: Binding<String>) { self.text = text }
    func textViewDidChange(_ tv: UITextView) { text.wrappedValue = tv.text }
  }
}

// Also: UIViewControllerRepresentable (same shape, makeUIViewController/updateUIViewController)
"""),

    code("Embedding SwiftUI in UIKit", "", r"""
let host = UIHostingController(rootView: ProfileView(user: user))

// As a child view controller
addChild(host)
host.view.translatesAutoresizingMaskIntoConstraints = false
view.addSubview(host.view)
NSLayoutConstraint.activate([
  host.view.topAnchor.constraint(equalTo: view.topAnchor),
  host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
  host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
  host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
])
host.didMove(toParent: self)

// As a cell (iOS 16+)
cell.contentConfiguration = UIHostingConfiguration { RowView(item: item) }
"""),

    rules("Interview talking points", "", [
        ("modern", "SwiftUI is **declarative + state-driven**: you describe *what* the UI is for a given state; the framework diffs and applies changes."),
        ("modern", "Views are cheap value types recreated constantly; the persistent thing is the view *identity* and its attached state."),
        ("legacy", "UIKit is **imperative + reference-based**: you mutate a long-lived view object tree and must keep it in sync by hand."),
        ("neutral", "SwiftUI's weak spots: fine-grained scroll control, complex text editing, deep customisation → drop down via `Representable`."),
        ("neutral", "UIKit's diffable data source (`NSDiffableDataSourceSnapshot`) is the imperative world catching up to SwiftUI's diffing."),
        ("good", "Both can coexist screen-by-screen; migration is usually leaf-first."),
    ]),
])
