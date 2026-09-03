"""Algorithmic patterns: classic data-structure problems, and streaming/time-series."""

from render import sheet, code, cmp, rules, table, diagram
import diagrams as D

G = "Algorithms"

ALGOS = sheet("algorithms", "Algorithmic Patterns & Complexity", G,
    "Eighteen patterns, the trigger phrase that reveals each one, and Swift you can type from memory.", [

    diagram("Pattern picker",
            "Match the sentence in the problem statement to the row, then write the template.",
            D.algo_picker()),

    diagram("Complexity, and what it costs",
            "Know where the cliff is: n log n is fine at a million, n² is not.",
            D.bigo_curves()),

    table("Swift standard library complexity", "The numbers interviewers expect you to know.",
        ["Operation", "Cost", "Note"],
        [["`array[i]`", "O(1)", "random access, contiguous storage"],
         ["`array.append`", "O(1) amortised", "O(n) on the occasional grow — `reserveCapacity(n)` to avoid"],
         ["`array.insert(at:)` / `remove(at:)`", "O(n)", "shifts every later element"],
         ["`array.contains`", "O(n)", "use a `Set` if you ask more than once"],
         ["`dict[key]`, `set.insert`", "O(1) average", "O(n) worst case; needs a good `Hashable`"],
         ["`sort()` / `sorted()`", "O(n log n)", "introsort; **not** stable (use `enumerated()` as a tiebreak)"],
         ["`min()` / `max()` / `reduce`", "O(n)", "single pass"],
         ["`string.count`", "O(n)", "grapheme clusters — cache it in a loop"],
         ["`string[i]`", "—", "no integer subscript; `Index` walking is O(n)"],
         ["`Array(set)` / `Set(array)`", "O(n)", "the cheapest dedupe, loses order"],
         ["`Deque` push/pop both ends", "O(1)", "`swift-collections`; `Array.removeFirst()` is O(n)"],
         ["`Heap.insert` / `popMin`", "O(log n)", "`swift-collections`; Swift has no built-in heap"]]),

    code("Two pointers", "Sorted input, pairs, or in-place compaction. O(n) time, O(1) space.", r"""
// Pair summing to a target in a SORTED array
func twoSum(_ a: [Int], _ target: Int) -> (Int, Int)? {
  var lo = 0, hi = a.count - 1
  while lo < hi {
    let sum = a[lo] + a[hi]
    if sum == target { return (lo, hi) }
    sum < target ? (lo += 1) : (hi -= 1)
  }
  return nil
}

// In-place removal, the "slow writer / fast reader" variant
func removeDuplicates(_ a: inout [Int]) -> Int {
  guard !a.isEmpty else { return 0 }
  var write = 1
  for read in 1..<a.count where a[read] != a[write - 1] {
    a[write] = a[read]
    write += 1
  }
  return write
}

// Three-sum = sort, then fix one index and two-pointer the rest -> O(n^2)
"""),

    code("Sliding window", "Contiguous subarray/substring. Grow right, shrink left. O(n).", r"""
// Fixed size: max sum of any k consecutive elements
func maxSum(_ a: [Int], k: Int) -> Int {
  var window = a.prefix(k).reduce(0, +)
  var best = window
  for i in k..<a.count {
    window += a[i] - a[i - k]      // slide, don't recompute
    best = max(best, window)
  }
  return best
}

// Variable size: longest substring with no repeated character
func longestUnique(_ s: String) -> Int {
  var lastSeen: [Character: Int] = [:]
  var start = 0, best = 0
  for (i, ch) in Array(s).enumerated() {
    if let seen = lastSeen[ch], seen >= start { start = seen + 1 }
    lastSeen[ch] = i
    best = max(best, i - start + 1)
  }
  return best
}
"""),

    code("Binary search", "Sorted data, or any monotonic predicate. O(log n).", r"""
func binarySearch(_ a: [Int], _ target: Int) -> Int? {
  var lo = 0, hi = a.count - 1
  while lo <= hi {
    let mid = lo + (hi - lo) / 2          // avoids overflow
    if a[mid] == target { return mid }
    if a[mid] < target { lo = mid + 1 } else { hi = mid - 1 }
  }
  return nil
}

// Lower bound: first index where a[i] >= target  (the more useful variant)
func lowerBound(_ a: [Int], _ target: Int) -> Int {
  var lo = 0, hi = a.count
  while lo < hi {
    let mid = (lo + hi) / 2
    if a[mid] < target { lo = mid + 1 } else { hi = mid }
  }
  return lo
}

// "Binary search the ANSWER": minimise a value subject to a monotonic check
func minCapacity(_ check: (Int) -> Bool, in range: ClosedRange<Int>) -> Int {
  var lo = range.lowerBound, hi = range.upperBound
  while lo < hi {
    let mid = (lo + hi) / 2
    if check(mid) { hi = mid } else { lo = mid + 1 }
  }
  return lo
}
"""),

    code("Hash map: counting, grouping, memory of the past", "The default first idea. O(n) time, O(n) space.", r"""
// Two-sum, unsorted: remember what you've seen
func twoSum(_ a: [Int], _ target: Int) -> (Int, Int)? {
  var seen: [Int: Int] = [:]                       // value -> index
  for (i, v) in a.enumerated() {
    if let j = seen[target - v] { return (j, i) }
    seen[v] = i
  }
  return nil
}

// Frequency map - reduce(into:) avoids copying the dictionary each step
let counts = text.reduce(into: [Character: Int]()) { $0[$1, default: 0] += 1 }

// Group anagrams: build a canonical key
let groups = Dictionary(grouping: words) { String($0.sorted()) }

// First non-repeating character
let first = text.first { counts[$0] == 1 }
"""),

    code("Prefix sums & difference arrays", "Range queries in O(1) after O(n) prep.", r"""
// prefix[i] = sum of the first i elements
let prefix = nums.reduce(into: [0]) { $0.append($0.last! + $1) }
func rangeSum(_ l: Int, _ r: Int) -> Int { prefix[r + 1] - prefix[l] }

// Count subarrays summing to k: prefix sums + a hash map. O(n)
func subarraysSumming(to k: Int, in nums: [Int]) -> Int {
  var seen: [Int: Int] = [0: 1]        // prefix value -> how many times
  var running = 0, total = 0
  for n in nums {
    running += n
    total += seen[running - k, default: 0]
    seen[running, default: 0] += 1
  }
  return total
}

// Difference array: apply many range increments in O(1) each
var diff = [Int](repeating: 0, count: n + 1)
func addRange(_ l: Int, _ r: Int, _ v: Int) { diff[l] += v; diff[r + 1] -= v }
let final = diff.dropLast().reduce(into: [Int]()) { $0.append(($0.last ?? 0) + $1) }
"""),

    code("Sort then sweep: intervals", "Sorting first turns a hard problem into a linear scan. O(n log n).", r"""
struct Interval { var start: Int; var end: Int }

func merge(_ intervals: [Interval]) -> [Interval] {
  let sorted = intervals.sorted { $0.start < $1.start }
  var result: [Interval] = []
  for i in sorted {
    if var last = result.last, i.start <= last.end {
      last.end = max(last.end, i.end)        // overlap -> extend
      result[result.count - 1] = last
    } else {
      result.append(i)
    }
  }
  return result
}

// Minimum meeting rooms = max concurrent overlap.
// Sweep line: +1 at every start, -1 at every end, walk in time order.
func minRooms(_ intervals: [Interval]) -> Int {
  let events = intervals.flatMap { [($0.start, 1), ($0.end, -1)] }
    .sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }   // end before start on ties
  var current = 0, best = 0
  for (_, delta) in events { current += delta; best = max(best, current) }
  return best
}
"""),

    code("Stack & monotonic stack", "Matching, spans, and \"next greater\". O(n).", r"""
func isBalanced(_ s: String) -> Bool {
  let pairs: [Character: Character] = [")": "(", "]": "[", "}": "{"]
  var stack: [Character] = []
  for ch in s {
    if let open = pairs[ch] {
      guard stack.popLast() == open else { return false }
    } else {
      stack.append(ch)
    }
  }
  return stack.isEmpty
}

// Monotonic decreasing stack: index of the next greater element
func nextGreater(_ a: [Int]) -> [Int] {
  var result = [Int](repeating: -1, count: a.count)
  var stack: [Int] = []                       // indices, values decreasing
  for i in a.indices {
    while let top = stack.last, a[top] < a[i] {
      result[top] = i                         // a[i] is the answer for that index
      stack.removeLast()
    }
    stack.append(i)
  }
  return result
}
// Same skeleton solves: daily temperatures, largest rectangle in a histogram,
// trapping rain water, stock span.
"""),

    code("Heap & top-K", "When you need the k best out of n, not the whole order. O(n log k).", r"""
import Collections                        // swift-collections

// k largest without sorting everything
func kLargest(_ nums: [Int], _ k: Int) -> [Int] {
  var heap = Heap<Int>()                  // min-heap side used as the gate
  for n in nums {
    heap.insert(n)
    if heap.count > k { _ = heap.popMin() }
  }
  return heap.unordered.sorted(by: >)
}

// No dependency? A sorted insert into a bounded array is fine for small k:
func topK(_ nums: [Int], _ k: Int) -> [Int] {
  var best: [Int] = []
  for n in nums {
    let idx = best.firstIndex { $0 < n } ?? best.count
    best.insert(n, at: idx)
    if best.count > k { best.removeLast() }
  }
  return best
}

// Streaming median = a max-heap of the low half + a min-heap of the high half,
// rebalanced so their sizes differ by at most one.
"""),

    code("Fast & slow pointers (linked lists)", "Cycle, middle, k-from-end. O(n) time, O(1) space.", r"""
final class Node { var value: Int; var next: Node?; init(_ v: Int) { value = v } }

func hasCycle(_ head: Node?) -> Bool {
  var slow = head, fast = head
  while fast?.next != nil {
    slow = slow?.next
    fast = fast?.next?.next
    if slow === fast { return true }        // identity, not equality
  }
  return false
}

func middle(_ head: Node?) -> Node? {
  var slow = head, fast = head
  while fast?.next != nil { slow = slow?.next; fast = fast?.next?.next }
  return slow
}

func reversed(_ head: Node?) -> Node? {
  var prev: Node?, current = head
  while let node = current {
    current = node.next
    node.next = prev
    prev = node
  }
  return prev
}
"""),

    code("Trees: DFS and BFS", "Recursion for depth, a queue for breadth.", r"""
final class TreeNode { var val: Int; var left, right: TreeNode?; init(_ v: Int) { val = v } }

// DFS in-order (sorted output for a BST)
func inorder(_ node: TreeNode?, into out: inout [Int]) {
  guard let node else { return }
  inorder(node.left, into: &out); out.append(node.val); inorder(node.right, into: &out)
}

// BFS level order - the queue-of-levels trick
func levelOrder(_ root: TreeNode?) -> [[Int]] {
  guard let root else { return [] }
  var levels: [[Int]] = [], queue = [root]
  while !queue.isEmpty {
    levels.append(queue.map(\.val))
    queue = queue.flatMap { [$0.left, $0.right].compactMap { $0 } }
  }
  return levels
}

// Validate a BST: pass the allowed range down, don't just compare with the parent
func isValid(_ n: TreeNode?, _ lo: Int = .min, _ hi: Int = .max) -> Bool {
  guard let n else { return true }
  return lo < n.val && n.val < hi
      && isValid(n.left, lo, n.val) && isValid(n.right, n.val, hi)
}
"""),

    code("Graphs: BFS, DFS, topological sort", "O(V + E). Adjacency list, visited set, queue or stack.", r"""
typealias Graph = [Int: [Int]]

// Shortest path in an UNWEIGHTED graph = BFS
func shortestPath(_ g: Graph, from s: Int, to t: Int) -> Int? {
  var visited: Set = [s], queue = [(s, 0)], head = 0
  while head < queue.count {
    let (node, d) = queue[head]; head += 1        // head index beats removeFirst()
    if node == t { return d }
    for next in g[node, default: []] where visited.insert(next).inserted {
      queue.append((next, d + 1))
    }
  }
  return nil
}

// Kahn's algorithm: topological order, and cycle detection for free
func topologicalOrder(_ g: Graph, nodeCount n: Int) -> [Int]? {
  var indegree = [Int](repeating: 0, count: n)
  for (_, edges) in g { for e in edges { indegree[e] += 1 } }
  var queue = (0..<n).filter { indegree[$0] == 0 }
  var order: [Int] = [], head = 0
  while head < queue.count {
    let node = queue[head]; head += 1
    order.append(node)
    for next in g[node, default: []] {
      indegree[next] -= 1
      if indegree[next] == 0 { queue.append(next) }
    }
  }
  return order.count == n ? order : nil          // nil => there is a cycle
}
// Weighted graph? Dijkstra = BFS with a min-heap keyed by distance.
"""),

    code("Grid / matrix traversal", "A grid is just a graph with implicit edges.", r"""
let directions = [(0, 1), (1, 0), (0, -1), (-1, 0)]

func numberOfIslands(_ grid: [[Character]]) -> Int {
  var grid = grid, count = 0

  func flood(_ r: Int, _ c: Int) {
    guard grid.indices.contains(r), grid[r].indices.contains(c), grid[r][c] == "1"
    else { return }
    grid[r][c] = "0"                              // mark visited in place
    for (dr, dc) in directions { flood(r + dr, c + dc) }
  }

  for r in grid.indices {
    for c in grid[r].indices where grid[r][c] == "1" {
      count += 1
      flood(r, c)
    }
  }
  return count
}
// Watch the stack: on a 1000x1000 grid switch the recursion to an explicit stack.
"""),

    code("Backtracking", "Choose → explore → un-choose. O(2ⁿ) subsets, O(n!) permutations.", r"""
func subsets(_ nums: [Int]) -> [[Int]] {
  var result: [[Int]] = [], current: [Int] = []
  func explore(_ start: Int) {
    result.append(current)
    for i in start..<nums.count {
      current.append(nums[i])       // choose
      explore(i + 1)                // explore
      current.removeLast()          // un-choose
    }
  }
  explore(0)
  return result
}

func permutations(_ nums: [Int]) -> [[Int]] {
  var result: [[Int]] = [], current: [Int] = [], used = [Bool](repeating: false, count: nums.count)
  func explore() {
    if current.count == nums.count { result.append(current); return }
    for i in nums.indices where !used[i] {
      used[i] = true;  current.append(nums[i])
      explore()
      current.removeLast(); used[i] = false
    }
  }
  explore()
  return result
}
// Prune early (bounds, sorted skips, "used" sets) - that is the whole game.
"""),

    code("Dynamic programming", "Overlapping subproblems + optimal substructure. Memoize, then flatten.", r"""
// 1-D: house robber - keep only the last two states, O(n) time, O(1) space
func rob(_ nums: [Int]) -> Int {
  var skip = 0, take = 0
  for n in nums { (skip, take) = (max(skip, take), skip + n) }
  return max(skip, take)
}

// 2-D: edit distance. dp[i][j] = cost to turn the first i of x into the first j of y.
func editDistance(_ a: String, _ b: String) -> Int {
  let x = Array(a), y = Array(b)
  var dp = Array(repeating: Array(repeating: 0, count: y.count + 1), count: x.count + 1)
  for i in 0...x.count { dp[i][0] = i }         // delete everything
  for j in 0...y.count { dp[0][j] = j }         // insert everything
  for i in stride(from: 1, through: x.count, by: 1) {
    for j in stride(from: 1, through: y.count, by: 1) {
      dp[i][j] = x[i - 1] == y[j - 1]
        ? dp[i - 1][j - 1]                                        // free match
        : 1 + min(dp[i - 1][j],      // delete
                  dp[i][j - 1],      // insert
                  dp[i - 1][j - 1])  // substitute
    }
  }
  return dp[x.count][y.count]
}

// Top-down memoization when the recurrence is easier to see:
var memo: [Int: Int] = [:]
func fib(_ n: Int) -> Int {
  if n < 2 { return n }
  if let hit = memo[n] { return hit }
  let value = fib(n - 1) + fib(n - 2)
  memo[n] = value
  return value
}
"""),

    code("Union-Find (disjoint set)", "Connectivity questions. Near O(1) per op with both optimisations.", r"""
struct UnionFind {
  private var parent: [Int]
  private var rank: [Int]
  private(set) var componentCount: Int

  init(_ n: Int) {
    parent = Array(0..<n); rank = Array(repeating: 0, count: n); componentCount = n
  }

  mutating func find(_ x: Int) -> Int {
    if parent[x] != x { parent[x] = find(parent[x]) }   // path compression
    return parent[x]
  }

  @discardableResult
  mutating func union(_ a: Int, _ b: Int) -> Bool {
    let (ra, rb) = (find(a), find(b))
    guard ra != rb else { return false }                 // already connected
    if rank[ra] < rank[rb] { parent[ra] = rb }           // union by rank
    else if rank[ra] > rank[rb] { parent[rb] = ra }
    else { parent[rb] = ra; rank[ra] += 1 }
    componentCount -= 1
    return true
  }
}
// Solves: number of provinces, redundant connection, Kruskal's MST, account merge.
"""),

    code("Trie (prefix tree)", "Prefix queries in O(length), independent of dictionary size.", r"""
final class Trie {
  private final class Node {
    var children: [Character: Node] = [:]
    var isWord = false
  }
  private let root = Node()

  func insert(_ word: String) {
    var node = root
    for ch in word {
      if node.children[ch] == nil { node.children[ch] = Node() }
      node = node.children[ch]!
    }
    node.isWord = true
  }

  private func node(matching prefix: String) -> Node? {
    var node = root
    for ch in prefix {
      guard let next = node.children[ch] else { return nil }
      node = next
    }
    return node
  }

  func contains(_ word: String) -> Bool { node(matching: word)?.isWord ?? false }
  func hasPrefix(_ prefix: String) -> Bool { node(matching: prefix) != nil }
}
"""),

    code("Bit manipulation & cyclic sort", "Two tricks that turn O(n) space into O(1).", r"""
// XOR: every value appears twice except one
let unique = nums.reduce(0, ^)

x & (x - 1)            // clears the lowest set bit
x & -x                 // isolates the lowest set bit
x.nonzeroBitCount      // popcount
(mask >> i) & 1 == 1   // is bit i set
1 << i                 // bit i

// Enumerate every subset of n elements with a bitmask
for mask in 0..<(1 << n) {
  let subset = (0..<n).filter { mask & (1 << $0) != 0 }.map { nums[$0] }
}

// Cyclic sort: values are 1...n, so put each value at its own index
func findMissing(_ nums: inout [Int]) -> Int {
  var i = 0
  while i < nums.count {
    let target = nums[i] - 1
    if target >= 0, target < nums.count, nums[i] != nums[target] {
      nums.swapAt(i, target)
    } else {
      i += 1
    }
  }
  return (nums.indices.first { nums[$0] != $0 + 1 } ?? nums.count) + 1
}
"""),

    rules("Working a problem out loud", "The process is graded as much as the answer.", [
        ("good", "**Restate + clarify** first: input size, value ranges, duplicates, sorted?, can I mutate the input, what about empty?"),
        ("good", "**Say the brute force** and its complexity — it proves you understand the problem and gives you a baseline."),
        ("good", "**Name the pattern** you're reaching for and *why* the trigger fits."),
        ("good", "**Write it, then state time and space** without being asked."),
        ("good", "**Dry-run one small example** by hand, then call out the edge cases: empty, one element, all equal, negatives, overflow."),
        ("neutral", "Common speed-ups: sort first (O(n log n) is usually free), trade space for time with a hash map, use two pointers instead of a nested loop, precompute prefixes."),
        ("bad", "Don't silently rewrite. If you change approach, say what you learned that made you change."),
        ("bad", "In Swift, don't use `array.removeFirst()` in a BFS loop — it's O(n). Use a head index or `Deque`."),
    ]),
])


STREAMS = sheet("streams", "Streaming & Time-Series Patterns", G,
    "Unbounded data, bounded memory: windows, sketches, rate limits and backpressure.", [

    diagram("Windowing a stream",
            "Almost every streaming requirement is one of these three windows plus a lateness policy.",
            D.stream_windows()),

    rules("The constraints that define the field", "", [
        ("modern", "You see each item **once**, in order, and you cannot store them all — so answers are incremental, approximate, or windowed."),
        ("modern", "**Bounded memory** is the whole game: O(1) or O(window), never O(stream)."),
        ("modern", "**Time is two things**: *event time* (when it happened) and *processing time* (when you saw it). They diverge, and that's what watermarks are for."),
        ("neutral", "**Exact vs approximate** — a sketch trades a few percent of accuracy for orders of magnitude of memory. Say the error bound out loud."),
        ("neutral", "In Swift, a stream is an `AsyncSequence` (pull, backpressure-aware) or a Combine `Publisher` (push, needs explicit buffering)."),
    ]),

    code("1 · Ring buffer — fixed-size sliding window", "O(1) per event, O(k) memory. The workhorse.", r"""
struct RingBuffer<Element> {
  private var storage: [Element?]
  private var head = 0
  private(set) var count = 0
  let capacity: Int

  init(capacity: Int) {
    self.capacity = capacity
    storage = Array(repeating: nil, count: capacity)
  }

  /// Appends and returns the element that was evicted, if any.
  @discardableResult
  mutating func append(_ element: Element) -> Element? {
    let evicted = count == capacity ? storage[head] : nil
    storage[head] = element
    head = (head + 1) % capacity
    count = Swift.min(count + 1, capacity)
    return evicted
  }

  var elements: [Element] {
    guard count > 0 else { return [] }
    let start = (head - count + capacity) % capacity
    return (0..<count).compactMap { storage[(start + $0) % capacity] }
  }
}

// Rolling sum in O(1): add the new value, subtract the evicted one.
var sum = 0.0
if let old = window.append(value) { sum -= old }
sum += value
let movingAverage = sum / Double(window.count)
"""),

    code("2 · Running statistics — Welford & EMA", "Mean, variance and a smoothed level in O(1) memory.", r"""
/// Numerically stable online mean/variance. Never sum-of-squares: it loses precision.
struct RunningStats {
  private(set) var count = 0
  private(set) var mean = 0.0
  private var m2 = 0.0

  mutating func add(_ x: Double) {
    count += 1
    let delta = x - mean
    mean += delta / Double(count)
    m2 += delta * (x - mean)
  }

  var variance: Double { count > 1 ? m2 / Double(count - 1) : 0 }
  var standardDeviation: Double { variance.squareRoot() }
  func zScore(_ x: Double) -> Double {
    standardDeviation > 0 ? (x - mean) / standardDeviation : 0
  }
}

/// Exponential moving average: no window, no history, one multiply.
struct EMA {
  private(set) var value: Double?
  let alpha: Double                       // 2 / (period + 1)

  mutating func add(_ x: Double) -> Double {
    value = value.map { alpha * x + (1 - alpha) * $0 } ?? x
    return value!
  }
}
// Anomaly detection for free: flag when |zScore| > 3 against a rolling RunningStats.
"""),

    code("3 · Reservoir sampling", "A uniform sample of k items from a stream of unknown length. O(k) memory.", r"""
struct Reservoir<Element> {
  private(set) var sample: [Element] = []
  private var seen = 0
  let capacity: Int

  init(capacity: Int) { self.capacity = capacity }

  mutating func add(_ element: Element) {
    seen += 1
    if sample.count < capacity {
      sample.append(element)
    } else {
      // Keep with probability k/n — every item ends up equally likely.
      let j = Int.random(in: 0..<seen)
      if j < capacity { sample[j] = element }
    }
  }
}
// Use it for: sampling logs, A/B assignment audits, picking N events to upload.
"""),

    code("4 · Count-Min Sketch — approximate frequencies", "O(width × depth) memory for any number of keys. Never undercounts.", r"""
struct CountMinSketch {
  private var table: [[Int]]
  private let seeds: [UInt64]
  private let width: Int

  /// width ~ e/epsilon, depth ~ ln(1/delta). 2048 x 5 is a good default.
  init(width: Int = 2048, depth: Int = 5) {
    self.width = width
    table = Array(repeating: Array(repeating: 0, count: width), count: depth)
    seeds = (0..<depth).map { UInt64($0) &* 0x9E37_79B9_7F4A_7C15 &+ 1 }
  }

  private func index(_ key: some Hashable, _ row: Int) -> Int {
    var hasher = Hasher()
    hasher.combine(seeds[row])
    hasher.combine(key)
    let h = hasher.finalize()
    return (h % width + width) % width       // safe for negative hashes
  }

  mutating func add(_ key: some Hashable, count: Int = 1) {
    for row in table.indices { table[row][index(key, row)] += count }
  }

  /// Never underestimates; overestimates with probability delta.
  func estimate(_ key: some Hashable) -> Int {
    table.indices.map { table[$0][index(key, $0)] }.min() ?? 0
  }
}
"""),

    code("5 · Bloom filter — approximate membership", "\"Definitely not present\" or \"probably present\", in a few bits per key.", r"""
import Foundation

struct BloomFilter {
  private var bits: [UInt64]
  private let bitCount: Int
  private let hashCount: Int

  init(expectedCount: Int, falsePositiveRate: Double = 0.01) {
    // m = -n·ln(p) / (ln2)^2      k = (m/n)·ln2
    let m = Int(-Double(expectedCount) * log(falsePositiveRate) / (log(2) * log(2)))
    bitCount = max(m, 64)
    hashCount = max(Int(Double(bitCount) / Double(expectedCount) * log(2)), 1)
    bits = Array(repeating: 0, count: (bitCount + 63) / 64)
  }

  private func positions(_ key: some Hashable) -> [Int] {
    (0..<hashCount).map { i in
      var hasher = Hasher()
      hasher.combine(i)
      hasher.combine(key)
      let h = hasher.finalize()
      return (h % bitCount + bitCount) % bitCount
    }
  }

  mutating func insert(_ key: some Hashable) {
    for p in positions(key) { bits[p / 64] |= (1 << UInt64(p % 64)) }
  }

  /// false  => definitely absent.   true => probably present.
  func mayContain(_ key: some Hashable) -> Bool {
    positions(key).allSatisfy { bits[$0 / 64] & (1 << UInt64($0 % 64)) != 0 }
  }
}
// Classic use: "have I already synced this event id?" without keeping every id.
"""),

    code("6 · Heavy hitters — Misra–Gries / Space-Saving", "Top-K over a stream in O(k) memory.", r"""
/// Tracks the k most frequent keys approximately. Anything appearing
/// more than n/(k+1) times is guaranteed to survive.
struct HeavyHitters<Key: Hashable> {
  private var counters: [Key: Int] = [:]
  let capacity: Int

  init(capacity: Int) { self.capacity = capacity }

  mutating func add(_ key: Key) {
    if counters[key] != nil {
      counters[key]! += 1
    } else if counters.count < capacity {
      counters[key] = 1
    } else {
      // Decrement everything; whatever hits zero is evicted.
      for k in counters.keys {
        counters[k]! -= 1
        if counters[k]! == 0 { counters.removeValue(forKey: k) }
      }
    }
  }

  var top: [(key: Key, count: Int)] {
    counters.sorted { $0.value > $1.value }.map { (key: $0.key, count: $0.value) }
  }
}
"""),

    code("7 · Streaming quantiles", "p50/p95/p99 without storing the stream.", r"""
/// The P-square idea, simplified: keep a bounded, sorted sample and
/// interpolate. Good enough for client-side latency telemetry.
struct QuantileEstimator {
  private var reservoir: Reservoir<Double>

  init(sampleSize: Int = 1000) { reservoir = Reservoir(capacity: sampleSize) }

  mutating func add(_ x: Double) { reservoir.add(x) }

  func quantile(_ q: Double) -> Double? {
    let sorted = reservoir.sample.sorted()
    guard !sorted.isEmpty else { return nil }
    let position = q * Double(sorted.count - 1)
    let lower = Int(position.rounded(.down)), upper = Int(position.rounded(.up))
    let weight = position - Double(lower)
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
  }
}
let p95 = estimator.quantile(0.95)
// Report percentiles, not averages: one 4-second request hides behind a 200 ms mean.
"""),

    cmp("8 · Rate limiting", "Three algorithms, three different fairness properties.",
        [("Token bucket — allows bursts", "good", r"""
actor TokenBucket {
  private var tokens: Double
  private var lastRefill = Date.now
  private let capacity: Double
  private let refillPerSecond: Double

  init(capacity: Double, refillPerSecond: Double) {
    self.capacity = capacity
    self.tokens = capacity
    self.refillPerSecond = refillPerSecond
  }

  func allow(cost: Double = 1, now: Date = .now) -> Bool {
    let elapsed = now.timeIntervalSince(lastRefill)
    lastRefill = now
    tokens = min(capacity, tokens + elapsed * refillPerSecond)
    guard tokens >= cost else { return false }
    tokens -= cost
    return true
  }
}

// capacity = how big a burst you tolerate
// refillPerSecond = the sustained rate
"""),
         ("Sliding window log — exact, more memory", "modern", r"""
actor SlidingWindowLimiter {
  private var timestamps: [Date] = []
  private let limit: Int
  private let window: TimeInterval

  init(limit: Int, window: TimeInterval) {
    self.limit = limit; self.window = window
  }

  func allow(now: Date = .now) -> Bool {
    let cutoff = now.addingTimeInterval(-window)
    timestamps.removeAll { $0 < cutoff }     // evict what left the window
    guard timestamps.count < limit else { return false }
    timestamps.append(now)
    return true
  }
}

// Leaky bucket = a fixed-rate queue drain: perfectly
// smooth output, no bursts, requests may wait.
""")]),

    code("9 · Debounce, throttle & sample over an AsyncSequence", "The client-side versions of rate control.", r"""
// Debounce: emit only after the source has been quiet for `interval`.
func debounce<T: Sendable>(_ source: AsyncStream<T>, for interval: Duration)
  -> AsyncStream<T> {
  AsyncStream { continuation in
    let task = Task {
      var pending: Task<Void, Never>?
      for await value in source {
        pending?.cancel()                       // a newer value cancels the old timer
        pending = Task {
          try? await Task.sleep(for: interval)
          guard !Task.isCancelled else { return }
          continuation.yield(value)
        }
      }
      await pending?.value
      continuation.finish()
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}

// Throttle: at most one value per interval (keep the FIRST).
// Sample: whatever the latest value is, every interval (keep the LAST).
// Combine gives all three for free: .debounce, .throttle(latest:), and
// Timer.publish + .withLatestFrom-style zip.
"""),

    code("10 · Backpressure & buffering policy", "When production outruns consumption, you must choose what to lose.", r"""
// AsyncStream lets you state the policy up front.
let (stream, continuation) = AsyncStream<Sample>.makeStream(
  bufferingPolicy: .bufferingNewest(100)      // drop the oldest under pressure
)
// .unbounded          -> never drops, can grow without limit (memory risk)
// .bufferingOldest(n) -> keep the first n, drop new arrivals
// .bufferingNewest(n) -> keep the last n  (right for sensor/telemetry data)

switch continuation.yield(sample) {
case .enqueued(let remaining): if remaining < 10 { reduceSamplingRate() }
case .dropped:                 droppedCount += 1
case .terminated:              stopSensor()
@unknown default:              break
}

// Combine: .buffer(size:prefetch:whenFull:) with .dropOldest / .dropNewest / .customError
// Consumer-side relief: batch, or coalesce to the latest value before rendering.
"""),

    code("11 · Batching, chunking and coalescing", "Amortise per-item cost — the cheapest streaming optimisation there is.", r"""
/// Emit either when `size` items have accumulated or when `interval` elapses,
/// whichever comes first. The standard telemetry-upload shape.
func batched<T: Sendable>(
  _ source: AsyncStream<T>, size: Int, every interval: Duration
) -> AsyncStream<[T]> {
  AsyncStream { continuation in
    let task = Task {
      var buffer: [T] = []
      var lastFlush = ContinuousClock.now

      for await element in source {
        buffer.append(element)
        let elapsed = ContinuousClock.now - lastFlush
        if buffer.count >= size || elapsed >= interval {
          continuation.yield(buffer)
          buffer.removeAll(keepingCapacity: true)
          lastFlush = .now
        }
      }
      if !buffer.isEmpty { continuation.yield(buffer) }   // flush the tail
      continuation.finish()
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}

// swift-async-algorithms gives you these directly:
// .chunks(ofCount:), .chunked(by:), .debounce(for:), .throttle(for:),
// .merge(), .combineLatest(), .removeDuplicates()
"""),

    code("12 · Deduplication with a TTL", "Streams re-deliver. Idempotency is your problem, not the transport's.", r"""
struct RecentSet<Key: Hashable> {
  private var seen: [Key: Date] = [:]
  private var order: [Key] = []
  let ttl: TimeInterval
  let capacity: Int

  /// Returns true the first time a key is seen inside the window.
  mutating func insertIfNew(_ key: Key, now: Date = .now) -> Bool {
    evict(before: now.addingTimeInterval(-ttl))
    guard seen[key] == nil else { return false }
    seen[key] = now
    order.append(key)
    if order.count > capacity { seen.removeValue(forKey: order.removeFirst()) }
    return true
  }

  private mutating func evict(before cutoff: Date) {
    while let oldest = order.first, let at = seen[oldest], at < cutoff {
      order.removeFirst()
      seen.removeValue(forKey: oldest)
    }
  }
}
// At scale, swap the dictionary for a Bloom filter and accept a small false-positive rate.
"""),

    code("13 · Merging ordered streams & change detection", "", r"""
// Fan-in: interleave k streams, finishing when all of them do.
// NOTE: this preserves arrival order, NOT event-time order.
func merge(_ streams: [AsyncStream<Event>]) -> AsyncStream<Event> {
  AsyncStream { continuation in
    let task = Task {
      await withTaskGroup(of: Void.self) { group in
        for s in streams {
          group.addTask { for await e in s { continuation.yield(e) } }
        }
      }
      continuation.finish()
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}
// For true event-time order you must buffer until the watermark passes,
// then drain the buffer sorted by timestamp. Ordering always costs latency.

// Change detection with hysteresis: two thresholds stop the flapping
// you get from a single one.
struct Hysteresis {
  let enter: Double, exit: Double
  private(set) var isOn = false
  mutating func update(_ x: Double) -> Bool? {
    if !isOn, x > enter { isOn = true;  return true }
    if isOn,  x < exit  { isOn = false; return false }
    return nil                       // no transition — emit nothing
  }
}

// UI diffing: let the framework compute the minimal change set.
let diff = newItems.difference(from: oldItems)   // CollectionDifference
tableView.performBatchUpdates { apply(diff) }
"""),

    table("Sketch selection", "What to reach for when exact is too expensive.",
        ["Question", "Structure", "Memory", "Error"],
        [["How many distinct users?", "HyperLogLog", "~12 KB for billions", "~2% standard error"],
         ["How often did key X appear?", "Count-Min Sketch", "width × depth ints", "over-counts only"],
         ["Have I seen X before?", "Bloom filter", "~10 bits/key at 1%", "false positives only"],
         ["What are the top K keys?", "Misra–Gries / Space-Saving", "O(k)", "misses items below n/(k+1)"],
         ["What's the p95 latency?", "t-digest / P² / reservoir", "O(sample)", "a few % near the tail"],
         ["A uniform sample of n items", "Reservoir sampling", "O(k)", "exact and unbiased"],
         ["A rolling average", "Ring buffer or EMA", "O(k) or O(1)", "exact / smoothed"],
         ["Exact counts, bounded keys", "Dictionary", "O(distinct)", "exact"]]),

    rules("Streaming pitfalls", "", [
        ("bad", "Unbounded buffers. `AsyncStream` defaults to `.unbounded` — always state a policy for hot sources."),
        ("bad", "Recomputing the whole window per event (O(n·k) instead of O(n)) — slide, don't recompute."),
        ("bad", "Using processing time when the business asks about event time. Sensor and network delays reorder everything."),
        ("bad", "Assuming exactly-once delivery. Design for at-least-once and make the consumer idempotent."),
        ("bad", "Summing squares for variance — it loses precision. Use Welford."),
        ("bad", "Blocking the producer to do work per event. Hand off to a bounded queue and batch."),
        ("good", "Decide the lateness policy explicitly: drop, hold with a watermark, or re-open the window and re-emit."),
        ("good", "Instrument the stream itself: input rate, drop count, queue depth, end-to-end lag."),
    ]),
])
