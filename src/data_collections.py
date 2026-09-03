"""Collections: the protocol ladder, the concrete types, and the operation cookbook."""

from render import sheet, code, cmp, rules, table, diagram
import diagrams as D

G = "Design & Language"

TYPES = sheet("collections", "Collections — Types & Protocols", G,
    "Which container, which protocol rung, and what every operation costs.", [

    diagram("The protocol ladder",
            "Generic code should demand the weakest rung that still works.",
            D.collection_hierarchy()),

    diagram("Pick the container",
            "The need on the left decides the type; the cost on the right decides whether you got it right.",
            D.collection_picker()),

    table("Costs, per type", "The table interviewers and profilers both care about.",
        ["Type", "Lookup", "Insert", "Remove", "Ordered?", "Notes"],
        [["`Array`", "O(1) by index, O(n) by value", "O(1)* append, O(n) insert", "O(1)* last, O(n) other", "yes", "*amortised; contiguous storage"],
         ["`ContiguousArray`", "same", "same", "same", "yes", "skips ObjC bridging — for class elements"],
         ["`ArraySlice`", "O(1)", "—", "—", "yes", "shares the parent's buffer **and keeps it alive**"],
         ["`Set`", "O(1) avg", "O(1) avg", "O(1) avg", "no", "order varies between launches"],
         ["`Dictionary`", "O(1) avg", "O(1) avg", "O(1) avg", "no", "same; `Key: Hashable`"],
         ["`String`", "O(n) — no Int index", "O(1) append", "O(n)", "yes", "grapheme clusters; `count` is O(n)"],
         ["`Deque`", "O(1) by index", "O(1) **both ends**", "O(1) both ends", "yes", "swift-collections"],
         ["`OrderedSet`", "O(1) by element, O(1) by index", "O(1) append", "O(n) middle", "yes", "Set semantics + a RandomAccess view"],
         ["`OrderedDictionary`", "O(1)", "O(1) append", "O(n) middle", "yes", "stable iteration order"],
         ["`Heap`", "O(1) min/max only", "O(log n)", "O(log n)", "partial", "priority queue; no arbitrary lookup"],
         ["`BitSet`", "O(1)", "O(1)", "O(1)", "yes (numeric)", "1 bit per element; fast set algebra"],
         ["`TreeDictionary` / `TreeSet`", "O(log n)", "O(log n)", "O(log n)", "no", "persistent: copies share structure"]]),

    code("Array essentials", "", r"""
var xs = [1, 2, 3]
var zeros = Array(repeating: 0, count: 100)
var fromRange = Array(1...5)                  // [1,2,3,4,5]
var empty = [Int]()

xs.reserveCapacity(10_000)                    // one allocation instead of ~14 regrows
xs.append(4);  xs += [5, 6];  xs.append(contentsOf: 7...9)
xs.insert(0, at: 0)                           // O(n): shifts everything
xs.insert(contentsOf: [-2, -1], at: 0)

xs.removeLast()                               // O(1)
xs.popLast()                                  // O(1), returns Optional — never traps
xs.removeFirst()                              // O(n)!  use a Deque if you do this in a loop
xs.removeAll { $0 < 0 }                       // one pass, in place
xs.removeSubrange(0..<2)
xs.replaceSubrange(0..<2, with: [10, 20, 30]) // lengths need not match

xs.first;  xs.last                            // Optional — safe
xs[0]                                         // traps when empty
xs.indices                                    // Range<Int> for Array
xs.isEmpty                                    // ALWAYS this, never count == 0
"""),

    cmp("Slices: the trap and the fix", "A slice is a *view*, not a copy.",
        [("What surprises people", "bad", r"""
let xs = [10, 20, 30, 40, 50]
let tail = xs[2...]              // ArraySlice<Int>

tail.count       // 3
tail[0]          // 💥 traps — indices are the PARENT's
tail.startIndex  // 2
tail.first       // 30  ✓ safe

// A slice keeps the WHOLE parent buffer alive:
func firstLine(of huge: [UInt8]) -> ArraySlice<UInt8> {
  huge.prefix(80)                // holds all 500 MB alive
}
"""),
         ("What to do", "good", r"""
// Index relative to the slice, or offset from its start
tail[tail.startIndex]                       // 30
tail[tail.index(tail.startIndex, offsetBy: 1)]  // 40

// enumerated() gives OFFSETS, which is usually what you meant
for (offset, value) in tail.enumerated() { }

// zip(indices, self) when you need real indices
for (index, value) in zip(tail.indices, tail) { }

// Copy out to break the storage link
func firstLine(of huge: [UInt8]) -> [UInt8] {
  Array(huge.prefix(80))                     // now 80 bytes
}
""")]),

    code("Set & SetAlgebra", "", r"""
var tags: Set<String> = ["swift", "ios"]

tags.insert("ios")                    // (inserted: false, memberAfterInsert: "ios")
if tags.insert("macos").inserted { }  // the "was it new?" idiom
tags.remove("ios")                    // returns the removed element, or nil
tags.contains("swift")                // O(1)

let a: Set = [1, 2, 3], b: Set = [3, 4]
a.union(b)                 // [1,2,3,4]
a.intersection(b)          // [3]
a.subtracting(b)           // [1,2]
a.symmetricDifference(b)   // [1,2,4]
a.isSubset(of: b);  a.isSuperset(of: b);  a.isDisjoint(with: b)
// Mutating twins: formUnion, formIntersection, subtract, formSymmetricDifference

// Cheapest dedupe there is — but it loses order
let unique = Array(Set(items))

// Set order is NOT stable across launches (hash seeding). Sort before display:
let display = tags.sorted()

// OptionSet is SetAlgebra over a bitfield:
struct Permissions: OptionSet {
  let rawValue: Int
  static let read = Permissions(rawValue: 1 << 0)
  static let write = Permissions(rawValue: 1 << 1)
  static let all: Permissions = [.read, .write]
}
if perms.contains(.write) { }
"""),

    code("Dictionary essentials", "The `default:` subscript is the single most useful line here.", r"""
var counts: [String: Int] = [:]

counts["a", default: 0] += 1          // read-modify-write, no optional dance
counts["a"] = nil                     // removes the key
counts.updateValue(5, forKey: "b")    // returns the OLD value
counts.removeValue(forKey: "b")

// Build from pairs
Dictionary(uniqueKeysWithValues: zip(ids, names))          // traps on a duplicate key
Dictionary(pairs, uniquingKeysWith: { first, _ in first }) // pick a winner instead
Dictionary(grouping: users, by: \.country)                 // [String: [User]]

// Transform
counts.mapValues { $0 * 2 }                   // [String: Int]
counts.compactMapValues { $0 > 1 ? $0 : nil } // drops entries
counts.filter { $0.value > 1 }                // returns a Dictionary, not an array

// Merge
var settings = defaults
settings.merge(overrides) { _, new in new }   // last one wins
let merged = defaults.merging(overrides) { _, new in new }

// Iteration order is unspecified. Sort explicitly when it matters:
for (key, value) in counts.sorted(by: { $0.key < $1.key }) { }

counts.keys;  counts.values                   // lazy views, not arrays
Array(counts.keys)                            // materialise only if you must
"""),

    code("String is a collection — of graphemes", "", r"""
let s = "Cafe\u{301} 👍🏽"          // "Café 👍🏽"
s.count                              // 6 — user-perceived characters, O(n)
s.utf8.count                         // 13 — bytes
s.unicodeScalars.count               // 8

// No integer subscript. Indices are opaque and tied to THIS string.
let i = s.index(s.startIndex, offsetBy: 4)
s[i]                                 // " "
s[s.startIndex..<i]                  // "Café"  (a Substring — shares storage)
String(s.prefix(4))                  // copy out when you store it

s.hasPrefix("Ca");  s.hasSuffix("🏽")
s.split(separator: " ")              // [Substring]
s.components(separatedBy: ", ")      // [String] — Foundation
s.replacingOccurrences(of: "é", with: "e")
s.trimmingCharacters(in: .whitespacesAndNewlines)
s.lowercased();  s.uppercased()

if let range = s.range(of: "fé") { s[range] }         // Range<String.Index>
s.firstIndex(of: "é")

// Building strings in a loop: reserve, and append — never  result = result + x
var out = ""
out.reserveCapacity(1024)
for line in lines { out += line; out += "\n" }
"""),

    code("swift-collections: the four you'll actually use", "`.package(url: \"https://github.com/apple/swift-collections\", from: \"1.1.0\")`", r"""
import Collections

// Deque — a queue that isn't O(n) at the front
var queue: Deque<Task> = []
queue.append(task)          // back
queue.prepend(task)         // front
queue.popFirst()            // O(1)  <- the reason it exists
queue.popLast()             // O(1)

// OrderedSet — Set lookup, Array order
var recents: OrderedSet<String> = []
recents.append("swift")     // (inserted: Bool, index: Int)
recents.contains("swift")   // O(1)
recents[0]                  // O(1) — it has a RandomAccess view
recents.remove("swift")

// OrderedDictionary — stable iteration, still O(1)
var config: OrderedDictionary<String, String> = [:]
config["theme"] = "dark"
for (key, value) in config { }        // insertion order, every time

// Heap — the priority queue Swift's stdlib is missing
var heap = Heap<Int>()
heap.insert(5); heap.insert(1)
heap.min                    // O(1) peek
heap.popMin()               // O(log n)
heap.popMax()               // O(log n) — it's a min-MAX heap

// Also: BitSet, BitArray, TreeSet, TreeDictionary (persistent, cheap copies)
// And apple/swift-algorithms for chunks, windows, uniqued, product, combinations.
"""),

    code("Generic algorithms: constrain to the right rung", "", r"""
// Works on anything you can walk once — including infinite sequences
func firstTwo<S: Sequence>(of s: S) -> [S.Element] { Array(s.prefix(2)) }

// Needs count / indices / multiple passes
func middle<C: Collection>(of c: C) -> C.Element? {
  guard !c.isEmpty else { return nil }
  return c[c.index(c.startIndex, offsetBy: c.count / 2)]
}

// Needs O(1) index math — binary search would be O(n log n) without this
func binarySearch<C: RandomAccessCollection>(_ c: C, _ target: C.Element) -> C.Index?
  where C.Element: Comparable {
  var lo = c.startIndex, hi = c.endIndex
  while lo < hi {
    let mid = c.index(lo, offsetBy: c.distance(from: lo, to: hi) / 2)
    if c[mid] == target { return mid }
    if c[mid] < target { lo = c.index(after: mid) } else { hi = mid }
  }
  return nil
}

// Needs in-place element assignment (length fixed)
func swapEnds<C: MutableCollection>(_ c: inout C) where C: BidirectionalCollection {
  guard !c.isEmpty else { return }
  c.swapAt(c.startIndex, c.index(before: c.endIndex))
}

// Needs to grow/shrink
func padded<C: RangeReplaceableCollection>(_ c: C, to n: Int, with e: C.Element) -> C {
  var copy = c
  while copy.count < n { copy.append(e) }
  return copy
}

// Return `some Collection` / `[Element]`, not AnyCollection, unless you truly
// need type erasure at a module boundary.
"""),

    code("Rolling your own", "Conform to the smallest protocol that gives callers what they need.", r"""
// A Sequence: one pass, possibly infinite
struct Fibonacci: Sequence, IteratorProtocol {
  private var (a, b) = (0, 1)
  mutating func next() -> Int? {
    defer { (a, b) = (b, a + b) }
    return a
  }
  func makeIterator() -> Fibonacci { self }
}
Array(Fibonacci().prefix(8))          // [0,1,1,2,3,5,8,13]

// A Collection: implement 4 members and you inherit ~100 methods
struct Matrix<Element>: RandomAccessCollection {
  private var storage: [Element]
  let columns: Int

  var startIndex: Int { 0 }
  var endIndex: Int { storage.count }
  subscript(position: Int) -> Element { storage[position] }
  // index(after:) / index(before:) are free for Int indices

  subscript(row: Int, column: Int) -> Element { storage[row * columns + column] }
}
// Now you get: map, filter, first, count, sorted, reversed, max, indices...

// An AsyncSequence: the streaming equivalent
struct Ticks: AsyncSequence {
  typealias Element = Date
  func makeAsyncIterator() -> AsyncIterator { AsyncIterator() }
  struct AsyncIterator: AsyncIteratorProtocol {
    mutating func next() async throws -> Date? {
      try await Task.sleep(for: .seconds(1))
      return .now
    }
  }
}
"""),

    code("Performance levers", "", r"""
// 1. Reserve when you know the size — the single biggest easy win
var out: [Result] = []
out.reserveCapacity(inputs.count)

// 2. reduce(into:) instead of reduce — no copy per element
let counts = words.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }

// 3. keepingCapacity when you reuse a buffer in a loop
buffer.removeAll(keepingCapacity: true)

// 4. lazy to fuse a chain and skip intermediates
let firstBig = numbers.lazy.map(expensive).first { $0 > 1_000 }

// 5. Copy-on-write is per-buffer. This copies once, not n times:
var copy = original
copy.append(x)                  // the copy happens HERE, on first mutation

// 6. Custom CoW type
struct Buffer {
  private var storage: Storage
  mutating func mutate() {
    if !isKnownUniquelyReferenced(&storage) { storage = storage.copy() }
    storage.value += 1
  }
}

// 7. Drop to a raw buffer for numeric hot loops
let total = values.withUnsafeBufferPointer { buffer -> Double in
  var sum = 0.0
  for v in buffer { sum += v }
  return sum
}

// 8. Set/Dictionary beat Array.contains the moment you ask more than once
let banned = Set(bannedList)            // build once
items.filter { !banned.contains($0.id) }  // O(n), not O(n·m)
"""),

    rules("Collection pitfalls", "", [
        ("bad", "`Array.removeFirst()` / `insert(at: 0)` are **O(n)**. In a loop that's O(n²) — use a `Deque` or a head index."),
        ("bad", "`slice[0]` traps: a slice inherits the parent's indices. Use `slice.first` or `slice.startIndex`."),
        ("bad", "A slice keeps the parent's whole buffer alive. `Array(slice)` when you store it."),
        ("bad", "`enumerated()` yields **offsets, not indices**. On a slice or a `String` they're different things."),
        ("bad", "`Set` and `Dictionary` iteration order changes between launches. Never persist or diff it — `sorted()` first."),
        ("bad", "`hashValue` is not stable across launches or platforms. Never store it; use a real hash (SHA-256) if you need persistence."),
        ("bad", "`array.count == 0` instead of `isEmpty` — for `String` and lazy sequences `count` is O(n)."),
        ("bad", "`array.contains` inside a loop over another array is the classic accidental O(n²)."),
        ("neutral", "Mutating a value-type collection inside its own `for` loop iterates the *original copy* — no crash, but usually not what you meant. Collect the changes, then apply."),
        ("good", "`first(where:)` short-circuits; `filter { }.first` does not."),
        ("good", "`sort()` is **not stable**. Sort by a tuple including the original offset when ties must keep their order."),
    ]),
])


OPS = sheet("collection-ops", "Collections — Operation Cookbook", G,
    "\"I want to ___\" mapped to the exact call. Chain these instead of writing loops.", [

    table("I want to…", "The lookup table. Package ops are marked.",
        ["Goal", "Call"],
        [["transform every element", "`map { }` · `mapValues { }` for dictionaries"],
         ["transform and drop nils", "`compactMap { }`"],
         ["flatten one level", "`flatMap { }` · `joined()` · `joined(separator:)`"],
         ["fold to a single value", "`reduce(0, +)` · `reduce(into: [:]) { }` (no copies)"],
         ["keep matching elements", "`filter { }`"],
         ["find the first match", "`first(where:)` · `firstIndex(where:)` (short-circuits)"],
         ["find the last match", "`last(where:)` · `lastIndex(where:)`"],
         ["does any / do all match", "`contains(where:)` · `allSatisfy { }`"],
         ["count matches", "`count(where:)` (Swift 6) · `filter { }.count`"],
         ["biggest / smallest by field", "`max(by:)` · `min(by:)` · `max { $0.x < $1.x }`"],
         ["sort", "`sorted()` · `sorted(by:)` · `sorted(using: KeyPathComparator(\\.date))`"],
         ["reverse / shuffle / rotate", "`reversed()` · `shuffled()` · `rotate(toStartAt:)`*"],
         ["group by a key", "`Dictionary(grouping:by:)`"],
         ["take / drop from the ends", "`prefix(n)` `suffix(n)` `dropFirst(n)` `dropLast(n)` `prefix(while:)`"],
         ["split on a separator", "`split(separator:)` · `split(whereSeparator:)`"],
         ["fixed-size chunks", "`chunks(ofCount: 3)`* · `stride` + `Array(slice)`"],
         ["sliding windows", "`windows(ofCount: 3)`*"],
         ["consecutive pairs", "`adjacentPairs()`* · `zip(xs, xs.dropFirst())`"],
         ["remove duplicates", "`Set(xs)` (unordered) · `uniqued()`* (keeps order)"],
         ["walk two collections together", "`zip(a, b)` · `Publishers.Zip` for streams"],
         ["cartesian product / combinations", "`product(a, b)`* · `combinations(ofCount:)`* · `permutations()`*"],
         ["index and element together", "`enumerated()` (offsets) · `zip(xs.indices, xs)` (indices)"],
         ["mutate in place", "`removeAll(where:)` · `swapAt` · `replaceSubrange` · loop over `indices`"],
         ["diff two collections", "`new.difference(from: old)` → `CollectionDifference`"],
         ["defer the work", "`.lazy.map { }.filter { }.first { }`"]]),

    code("Transform & fold", "", r"""
let names = users.map(\.name)                       // key path as a function
let ages = users.map { $0.age }
let ids = rows.compactMap { Int($0.id) }            // drops the unparseable
let allTags = posts.flatMap(\.tags)                 // [[Tag]] -> [Tag]
let sentence = words.joined(separator: " ")

let total = orders.reduce(0) { $0 + $1.amount }
let sum = orders.map(\.amount).reduce(0, +)         // clearer, one extra array

// reduce(into:) — mutates an inout accumulator, so no copy per element
let byCountry = users.reduce(into: [String: [User]]()) { acc, user in
  acc[user.country, default: []].append(user)
}
let counts = text.reduce(into: [Character: Int]()) { $0[$1, default: 0] += 1 }

// Running totals
let runningTotal = amounts.reduce(into: [Decimal]()) { $0.append(($0.last ?? 0) + $1) }

// Dictionaries
prices.mapValues { $0 * 1.21 }
prices.compactMapValues { $0 > 0 ? $0 : nil }
"""),

    code("Search & test", "", r"""
users.first { $0.isAdmin }                  // Optional<User>, stops at the first hit
users.firstIndex { $0.id == target }        // Optional<Index>
users.last { $0.isActive }
users.contains { $0.age < 18 }              // any
users.allSatisfy { $0.email.contains("@") } // all
users.count { $0.isActive }                 // Swift 6; else filter { }.count

users.max { $0.score < $1.score }           // by a field
users.min(by: { $0.date < $1.date })
amounts.max();  amounts.min()               // Comparable elements

// Binary search on sorted data: lower bound via partitioningIndex (swift-algorithms)
let insertAt = sorted.partitioningIndex { $0 >= newValue }

// Short-circuit matters: this stops early…
if users.contains(where: \.isAdmin) { }
// …this walks everything and allocates
if !users.filter(\.isAdmin).isEmpty { }
"""),

    code("Sort & order", "", r"""
items.sorted()                                      // Comparable
items.sorted(by: >)                                 // descending
items.sorted { $0.date > $1.date }                  // by a field

// Multi-key sort with a tuple
items.sorted { ($0.priority, $0.title) < ($1.priority, $1.title) }

// Foundation comparators — composable and reversible
items.sorted(using: KeyPathComparator(\.date, order: .reverse))
items.sorted(using: [KeyPathComparator(\.group),
                     KeyPathComparator(\.name)])

// sort() is NOT stable. Make it stable by including the original offset:
let stable = items.enumerated()
  .sorted { ($0.element.priority, $0.offset) < ($1.element.priority, $1.offset) }
  .map(\.element)

// In place (MutableCollection)
items.sort { $0.name < $1.name }
items.reverse()
items.shuffle()
let pivot = items.partition { $0.isDone }   // false's first, returns the boundary index

// Sorted top-K without sorting everything: O(n log k)
let top5 = scores.max(count: 5)             // swift-algorithms
"""),

    code("Group, aggregate, index", "", r"""
// Group
let byCountry = Dictionary(grouping: users, by: \.country)     // [String: [User]]
let byInitial = Dictionary(grouping: names) { $0.first! }

// Index by a unique key (build a lookup table once)
let byID = Dictionary(uniqueKeysWithValues: users.map { ($0.id, $0) })
let safeByID = Dictionary(users.map { ($0.id, $0) }) { first, _ in first }
let keyed = users.keyed(by: \.id)                              // swift-algorithms

// Aggregate per group
let totalPerCountry = orders.reduce(into: [String: Decimal]()) {
  $0[$1.country, default: 0] += $1.amount
}

// Count occurrences, then rank
let ranked = Dictionary(grouping: events, by: \.type)
  .mapValues(\.count)
  .sorted { $0.value > $1.value }

// Sectioned list for SwiftUI
struct Section: Identifiable { let id: String; let items: [User] }
let sections = Dictionary(grouping: users, by: \.country)
  .map { Section(id: $0.key, items: $0.value.sorted { $0.name < $1.name }) }
  .sorted { $0.id < $1.id }
"""),

    code("Slice, chunk, window", "", r"""
xs.prefix(3);  xs.suffix(3)
xs.dropFirst();  xs.dropLast(2)
xs.prefix(while: { $0 < 10 });  xs.drop(while: { $0 < 10 })
xs[2...];  xs[..<5];  xs[1..<4]                 // all ArraySlice — no copy

"a,b,,c".split(separator: ",")                                  // 3 — empties dropped
"a,b,,c".split(separator: ",", omittingEmptySubsequences: false) // 4

// Fixed chunks — swift-algorithms
for page in items.chunks(ofCount: 50) { try await upload(Array(page)) }

// Without the package
let chunks = stride(from: 0, to: items.count, by: 50).map {
  Array(items[$0 ..< min($0 + 50, items.count)])
}

// Sliding windows and pairs
for window in temperatures.windows(ofCount: 3) {                // [a,b,c], [b,c,d]…
  moving.append(window.reduce(0, +) / 3)
}
for (previous, current) in readings.adjacentPairs() {           // deltas
  deltas.append(current - previous)
}
// No package:  zip(readings, readings.dropFirst())

// Split on a changing key
let runs = items.chunked { $0.category == $1.category }         // swift-algorithms
"""),

    code("Combine & dedupe", "", r"""
// Zip stops at the shorter one
for (name, score) in zip(names, scores) { }
let pairs = Array(zip(ids, names))

// Concatenate
let all = a + b
let flat = [[1, 2], [3]].joined()               // lazy FlattenSequence
Array([[1, 2], [3]].joined())                   // [1,2,3]

// Dedupe, order lost
let unique = Array(Set(items))

// Dedupe, order kept — no package
var seen = Set<Item.ID>()
let ordered = items.filter { seen.insert($0.id).inserted }

// Dedupe, order kept — swift-algorithms
let ordered2 = items.uniqued(on: \.id)

// Set algebra over model objects
let added = Set(new.map(\.id)).subtracting(Set(old.map(\.id)))

// Interleave / intersperse
Array([1, 2, 3].interspersed(with: 0))          // [1,0,2,0,3]
"""),

    code("Diffing for UI updates", "Let the stdlib compute the minimal change set.", r"""
// CollectionDifference — the basis of animated table/collection updates
let diff = newItems.difference(from: oldItems)     // Element: Equatable

for change in diff {
  switch change {
  case let .insert(offset, element, _): rows.insert(element, at: offset)
  case let .remove(offset, _, _):       rows.remove(at: offset)
  }
}

// Or apply it wholesale
if let updated = oldItems.applying(diff) { rows = updated }

// Detect moves instead of remove+insert (nicer animations)
let moves = newItems.difference(from: oldItems).inferringMoves()

// UIKit
dataSource.apply(snapshot, animatingDifferences: true)

// SwiftUI does this for you — your job is just STABLE IDS
ForEach(items) { item in Row(item) }     // items: Identifiable
"""),

    code("Mutate in place", "", r"""
// Filter in place, one pass, no new array
items.removeAll { $0.isExpired }

// Mutate every element — you need indices, not the elements
for index in items.indices { items[index].isRead = true }

// …or map to new values
items = items.map { var copy = $0; copy.isRead = true; return copy }

// …or a mutating helper on the element
extension MutableCollection {
  mutating func mutateEach(_ body: (inout Element) -> Void) {
    for index in indices { body(&self[index]) }
  }
}
items.mutateEach { $0.isRead = true }

// inout parameters keep value semantics while allowing local mutation
func normalize(_ values: inout [Double]) {
  guard let maximum = values.max(), maximum > 0 else { return }
  for i in values.indices { values[i] /= maximum }
}

// Dictionaries: modify through the subscript, don't read-modify-write
counts["key", default: 0] += 1
users[id]?.name = "Ada"                    // no-op if the key is missing
"""),

    code("Lazy pipelines", "Same syntax, no intermediate arrays.", r"""
// Eager: builds TWO full arrays, runs expensive() on every element
let first = items.map(expensive).filter(\.isValid).first

// Lazy: runs expensive() until the first valid element, allocates nothing
let first = items.lazy.map(expensive).first(where: \.isValid)

// Infinite sequences are only possible lazily
let powers = sequence(first: 1) { $0 * 2 }        // 1,2,4,8…
Array(powers.prefix(10))

let evens = (1...).lazy.filter { $0.isMultiple(of: 2) }
Array(evens.prefix(5))                            // [2,4,6,8,10]

// Careful: a lazy chain is re-evaluated on every traversal
let lazyView = items.lazy.map(expensive)
_ = lazyView.count       // runs expensive() n times
_ = Array(lazyView)      // runs it n times AGAIN
// Materialise once if you'll use it twice.
"""),

    code("Small extensions worth having", "", r"""
extension Collection {
  /// Non-trapping index access.
  subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
  var nonEmpty: Self? { isEmpty ? nil : self }
}

extension Sequence {
  func sorted<V: Comparable>(by keyPath: KeyPath<Element, V>,
                             _ order: (V, V) -> Bool = (<)) -> [Element] {
    sorted { order($0[keyPath: keyPath], $1[keyPath: keyPath]) }
  }
  func grouped<K: Hashable>(by keyPath: KeyPath<Element, K>) -> [K: [Element]] {
    Dictionary(grouping: self) { $0[keyPath: keyPath] }
  }
  func sum<V: AdditiveArithmetic>(of keyPath: KeyPath<Element, V>) -> V {
    reduce(.zero) { $0 + $1[keyPath: keyPath] }
  }
}

extension Array {
  func chunked(into size: Int) -> [[Element]] {
    stride(from: 0, to: count, by: size).map {
      Array(self[$0 ..< Swift.min($0 + size, count)])
    }
  }
}

users[safe: 5]                       // nil instead of a crash
orders.sum(of: \.amount)
users.grouped(by: \.country)
users.sorted(by: \.name)
"""),

    rules("Choosing the operation", "", [
        ("good", "Reach for `first(where:)`, `contains(where:)`, `allSatisfy` — they short-circuit. `filter { }.first` doesn't."),
        ("good", "Use `reduce(into:)` whenever the accumulator is a collection; plain `reduce` copies it every step."),
        ("good", "Build a `Set` or a `Dictionary` **once** outside the loop instead of calling `contains` inside it."),
        ("good", "Key paths (`map(\\.name)`, `grouped(by: \\.id)`) read better than closures and can't capture the wrong thing."),
        ("good", "`lazy` pays off when the chain is long, the work per element is expensive, or you only need the first few results."),
        ("neutral", "Prefer one clear chain over a clever one. If you need a comment to explain the chain, write the loop."),
        ("neutral", "`swift-algorithms` and `swift-collections` are first-party, dependency-free and small — adding them is not a design decision you'll regret."),
        ("bad", "Don't chain more than about three operators without naming an intermediate value; compile times and readability both suffer."),
    ]),
])
