"""The infographics: Core Bluetooth, Testing, Architecture, Modularization,
algorithm selection, Big-O growth, stream windowing and the AI-assisted loop."""

import math

from svgkit import (CANVAS, canvas, box, band, chips, arrow, elbow, text, title,
                    row, bracket, color, polyline, axis, dot, slab)


# ==========================================================================
# Core Bluetooth
# ==========================================================================

def ble_lifecycle():
    """Serpentine pipeline: what you call vs what the delegate answers."""
    xs, w = row(4, gap=24)
    h, y1, y2 = 86, 44, 206
    stages = [
        ("1. Create manager", ["→ CBCentralManager(delegate:)", "← centralManagerDidUpdateState", "gate everything on .poweredOn"]),
        ("2. Scan", ["→ scanForPeripherals(svcUUIDs)", "← didDiscover + advData + RSSI", "stopScan() as soon as found"]),
        ("3. Connect", ["→ central.connect(peripheral)", "← didConnect / didFailToConnect", "STRONGLY retain the peripheral"]),
        ("4. Discover services", ["→ p.discoverServices([svcUUID])", "← didDiscoverServices", "set p.delegate = self first"]),
        ("5. Discover characteristics", ["→ discoverCharacteristics(_:for:)", "← didDiscoverCharacteristicsFor", "cache the ones you use"]),
        ("6. Subscribe", ["→ setNotifyValue(true, for: c)", "← didUpdateNotificationStateFor", "← didUpdateValueFor (the stream)"]),
        ("7. Read / Write", ["→ readValue(for: c)", "→ writeValue(d, for: c, type:)", "← didWriteValueFor (.withResponse)"]),
        ("8. Tear down", ["→ cancelPeripheralConnection(p)", "← didDisconnectPeripheral(error)", "reconnect with backoff"]),
    ]
    tones = ["accent", "modern", "modern", "type", "type", "good", "good", "legacy"]
    out = [title(4, 18, "CENTRAL ROLE - THE ONLY SEQUENCE THAT WORKS", "accent", 11.5)]
    out.append(text(456, 18, "→ you call        ← the delegate answers", 10, "neutral"))

    for i, (name, lines) in enumerate(stages):
        r, c = divmod(i, 4)
        y = y1 if r == 0 else y2
        out.append(box(xs[c], y, w, h, name, lines, tones[i]))
        if c < 3:
            out.append(arrow(xs[c] + w + 2, y + h / 2, xs[c + 1] - 4, y + h / 2, "neutral"))

    # serpentine connector from the end of row 1 to the start of row 2
    ex, sx = xs[3] + w / 2, xs[0] + w / 2
    out.append(elbow([(ex, y1 + h), (ex, 170), (sx, 170), (sx, y2 - 4)], "neutral", dash=True))
    out.append(text((ex + sx) / 2, 165, "connected - now you own the peripheral's delegate", 9.5,
                    "neutral", anchor="middle", weight="700"))

    c1, _ = chips(4, 306, [("every step is async + delegate based", "neutral"),
                           ("errors arrive in the SAME callback", "bad"),
                           ("iOS caches the GATT table per device", "legacy"),
                           ("one CBCentralManager is enough", "good")])
    out.append(c1)
    return canvas(334, "".join(out))


def ble_gatt():
    """GATT object model tree + property chips."""
    out = [title(4, 18, "GATT OBJECT MODEL - FOUR NOUNS, NOTHING ELSE", "accent", 11.5)]

    out.append(box(4, 104, 158, 76, "CBPeripheral", ["the remote device", "identifier: UUID", "(not the MAC address)"], "modern"))
    out.append(box(214, 104, 186, 76, "CBService", ["a feature group", "UUID 0x180D", "Heart Rate"], "type"))

    chars = [
        (12, "CBCharacteristic", ["0x2A37 Measurement", ".notify → the stream", "→ didUpdateValueFor"], "good"),
        (104, "CBCharacteristic", ["0x2A38 Body Location", ".read → one-shot", "→ readValue(for:)"], "good"),
        (196, "CBCharacteristic", ["0x2A39 Control Point", ".write / .withoutResponse", "→ writeValue(_:for:type:)"], "legacy"),
    ]
    for y, t, lines, tone in chars:
        out.append(box(452, y, 250, 76, t, lines, tone))
        out.append(elbow([(400, 142), (426, 142), (426, y + 38), (446, y + 38)], "neutral"))

    out.append(arrow(164, 142, 208, 142, "neutral"))
    out.append(box(746, 12, 190, 76, "CBDescriptor", ["0x2902 CCCD", "toggled for you by", "setNotifyValue(true:for:)"], "attr"))
    out.append(arrow(706, 50, 740, 50, "neutral"))

    out.append(text(4, 300, "characteristic.properties  (an OptionSet - always check it before you act)", 10.5, "neutral"))
    c, _ = chips(4, 310, [(".read", "good"), (".write", "legacy"), (".writeWithoutResponse", "legacy"),
                          (".notify", "modern"), (".indicate", "modern"), (".broadcast", "neutral"),
                          (".authenticatedSignedWrites", "neutral")])
    out.append(c)
    out.append(text(4, 352, "peripheral.services → service.characteristics → characteristic.descriptors   "
                            "(all Optional, all nil until you discover them)", 10.5, "neutral"))
    return canvas(366, "".join(out))


# ==========================================================================
# Testing
# ==========================================================================

def test_pyramid():
    apex_x, apex_y, base_y, half = 250.0, 26.0, 286.0, 196.0

    def hw(y):
        return (y - apex_y) / (base_y - apex_y) * half

    y1, y2 = 112.0, 199.0
    bands = [
        ("UI / End-to-end", "5 - 10 %", "bad", apex_y, y1),
        ("Integration", "20 - 30 %", "legacy", y1, y2),
        ("Unit", "60 - 70 %", "good", y2, base_y),
    ]
    out = [title(4, 16, "THE TEST PYRAMID, iOS EDITION", "accent", 11.5)]
    for name, pct, tone, ya, yb in bands:
        pts = "%f,%f %f,%f %f,%f %f,%f" % (apex_x - hw(ya), ya, apex_x + hw(ya), ya,
                                           apex_x + hw(yb), yb, apex_x - hw(yb), yb)
        out.append('<polygon points="%s" fill="%s" opacity=".17" stroke="%s" stroke-width="1.5"/>'
                   % (pts, color(tone), color(tone)))
        # Labels sit near the bottom of each band, where the triangle is widest.
        out.append(text(apex_x, yb - 26, name, 12, tone, anchor="middle", weight="800"))
        out.append(text(apex_x, yb - 11, pct, 10.5, tone, anchor="middle", weight="700"))

    out.append(arrow(24, base_y, 24, apex_y + 6, "neutral"))
    out.append('<text x="14" y="156" font-size="9.5" font-weight="700" fill="%s" '
               'text-anchor="middle" transform="rotate(-90 14 156)">slower - flakier - costlier</text>'
               % color("neutral"))

    infos = [
        (18, "UI / End-to-end", ["XCUITest, XCUIApplication", "minutes, flaky, needs a device",
                                 "launch args to stub the backend",
                                 "assert: 3-5 critical journeys only"], "bad"),
        (114, "Integration", ["XCTest + real collaborators", "URLProtocol / in-memory store",
                              "seconds; no live network",
                              "assert: modules wired correctly"], "legacy"),
        (210, "Unit", ["Swift Testing / XCTest", "pure functions, reducers, mappers",
                       "milliseconds, deterministic",
                       "assert: logic + edge cases"], "good"),
    ]
    for y, t, lines, tone in infos:
        out.append(box(500, y, 436, 88, t, lines, tone))

    out.append(text(500, 316, "Rule: if a bug can be caught one layer down, write it one layer down.", 11, "accent", weight="700"))
    return canvas(330, "".join(out))


def test_doubles():
    xs, w = row(5, gap=16)
    out = [title(4, 16, "TEST DOUBLES - KNOW THE FIVE NAMES", "accent", 11.5)]
    out.append(arrow(120, 36, 820, 36, "neutral", dash=True))
    out.append(text(470, 30, "no behaviour   ->   real behaviour", 10, "neutral", anchor="middle", weight="700"))

    doubles = [
        ("Dummy", ["never actually used;", "just fills a slot", "", "let noop: () -> Void = { }"], "neutral"),
        ("Stub", ["returns canned answers", "no assertions on it", "", "{ _ in .success(.mock) }"], "modern"),
        ("Spy", ["a stub that RECORDS", "what it was asked", "", "var saved: [Item] = []"], "type"),
        ("Mock", ["stub + verifies the", "expected interaction", "", "#expect(spy.calls == 1)"], "legacy"),
        ("Fake", ["a real, lightweight", "implementation", "", "InMemoryRepository()"], "good"),
    ]
    for i, (name, lines, tone) in enumerate(doubles):
        out.append(box(xs[i], 52, w, 94, name, lines, tone))

    out.append(text(4, 172, "In Swift you rarely need a mocking framework: a struct of closures "
                            "IS a stub, a spy and a mock.", 11, "accent", weight="700"))
    out.append(box(4, 184, 460, 70, "Injectable seam", ["struct API { var user: (Int) async throws -> User }",
                                                        "let sut = Service(api: .init(user: { _ in .mock }))"], "good"))
    out.append(box(476, 184, 460, 70, "Verify without a framework", ["final class Spy { private(set) var calls = 0 }",
                                                                     "#expect(spy.calls == 1)"], "type"))
    return canvas(266, "".join(out))


# ==========================================================================
# Architecture
# ==========================================================================

def _flow(x0, y0, w, heading, nodes, fwd, back, tone, footer=None):
    h_band = 176
    out = [band(x0, y0, w, h_band, tone), title(x0 + 14, y0 + 24, heading, tone, 12.5)]
    n = len(nodes)
    gap = 44 if n <= 3 else 22            # room for the arrow labels only when we have it
    bw = (w - 28 - gap * (n - 1)) / float(n)
    by, bh = y0 + 40, 58
    for i, (lab, sub) in enumerate(nodes):
        bx = x0 + 14 + i * (bw + gap)
        out.append(box(bx, by, bw, bh, lab, [sub] if sub else [], tone, title_size=11.5, line_size=9.5))
    for i in range(n - 1):
        x1 = x0 + 14 + i * (bw + gap) + bw
        lbl = fwd[i] if i < len(fwd) else None
        out.append(arrow(x1 + 2, by + bh / 2, x1 + gap - 3, by + bh / 2, tone, label=lbl))
    if back:
        lastx = x0 + 14 + (n - 1) * (bw + gap) + bw / 2
        firstx = x0 + 14 + bw / 2
        yb = by + bh + 24
        out.append(elbow([(lastx, by + bh + 2), (lastx, yb), (firstx, yb), (firstx, by + bh + 4)],
                         tone, dash=True))
        out.append(text((lastx + firstx) / 2, yb + 13, back, 9.5, tone, anchor="middle", weight="700"))
    if footer:
        out.append(text(x0 + 14, y0 + h_band - 10, footer, 9.8, "neutral"))
    return "".join(out)


def arch_flows():
    W = 458
    L, R = 3, 479
    out = [title(4, 14, "FOUR DATA FLOWS YOU MUST BE ABLE TO DRAW", "accent", 11.5)]
    out.append(_flow(L, 24, W, "MVC (Apple flavour)",
                     [("View", "UIView"), ("Controller", "UIViewController"), ("Model", "data + rules")],
                     ["events", "reads"], "reload / KVO", "legacy",
                     "Massive View Controller: view + navigation + networking all end up here."))
    out.append(_flow(R, 24, W, "MVVM",
                     [("View", "SwiftUI / UIKit"), ("ViewModel", "@Published state"), ("Model", "repos + entities")],
                     ["intent", "calls"], "binding", "modern",
                     "Testable presentation logic. No rule about navigation -> pair with a Coordinator."))
    out.append(_flow(L, 214, W, "VIPER / Clean-ish",
                     [("View", "passive"), ("Presenter", "formats"), ("Interactor", "use cases"), ("Entity", "model")],
                     [], "output protocol", "type",
                     "Router owns navigation. Very testable, very boilerplate-heavy."))
    out.append(_flow(R, 214, W, "Unidirectional (TCA / Redux)",
                     [("View", "renders State"), ("Action", "what happened"), ("Reducer", "pure mutation"), ("State", "one source")],
                     [], "re-render", "good",
                     "View sends an Action, the Reducer mutates State and returns Effects."))
    return canvas(404, "".join(out))


def arch_clean():
    out = [title(4, 16, "CLEAN ARCHITECTURE - THE DEPENDENCY RULE", "accent", 11.5)]
    rings = [
        (12, 30, 462, 292, "Frameworks & Drivers", "legacy"),
        (52, 68, 382, 216, "Interface Adapters", "type"),
        (100, 108, 286, 136, "Use Cases", "modern"),
        (150, 148, 186, 56, "Entities", "good"),
    ]
    for x, y, w, h, label, tone in rings:
        out.append('<rect x="%s" y="%s" width="%s" height="%s" rx="14" fill="%s" opacity=".10" '
                   'stroke="%s" stroke-width="1.6"/>' % (x, y, w, h, color(tone), color(tone)))
        out.append(text(x + 12, y + 18, label, 11.5, tone, weight="800"))

    out.append(arrow(470, 340, 300, 340, "accent"))
    out.append(text(478, 344, "source-code dependencies point INWARD only", 10.5, "accent", weight="700"))
    out.append(text(12, 340, "inner layers know nothing about outer ones", 10, "neutral"))

    maps = [
        (30, "Frameworks & Drivers", ["SwiftUI / UIKit views, URLSession,", "CoreData, CoreBluetooth, Keychain",
                                      "-> disposable detail; swap freely"], "legacy"),
        (108, "Interface Adapters", ["ViewModels / Presenters, Repository", "implementations, DTO <-> Entity mappers",
                                     "-> where protocols get satisfied"], "type"),
        (186, "Use Cases (Interactors)", ["PlaceOrder, SyncDevices, Refund", "orchestrate entities; no UIKit import",
                                          "-> depends on protocols it declares"], "modern"),
        (264, "Entities", ["struct Order, Money, DeviceID", "pure Swift, no frameworks",
                           "-> the rules that outlive the app"], "good"),
    ]
    for y, t, lines, tone in maps:
        out.append(box(496, y, 440, 70, t, lines, tone, title_size=11.5, line_size=9.8))
    return canvas(360, "".join(out))


# ==========================================================================
# Modularization
# ==========================================================================

def mod_layers():
    out = [title(4, 16, "A MODULE GRAPH THAT SCALES - ARROWS ONLY EVER POINT DOWN", "accent", 11.5)]

    out.append(box(360, 30, 262, 52, "App (thin shell)", ["composition root: builds the graph,", "deep links, app lifecycle"], "accent"))

    fxs, fw = row(4, gap=22, margin=42)
    feats = [("FeatureOnboarding", "screens + logic"), ("FeatureCatalog", "screens + logic"),
             ("FeatureCheckout", "screens + logic"), ("FeatureSettings", "screens + logic")]
    for i, (name, sub) in enumerate(feats):
        out.append(box(fxs[i], 116, fw, 58, name, [sub, "no feature imports another"], "modern",
                       title_size=11.5, line_size=9.5))
        out.append(elbow([(491, 82), (491, 100), (fxs[i] + fw / 2, 100), (fxs[i] + fw / 2, 112)], "neutral"))

    dxs, dw = row(3, gap=24, margin=42)
    doms = [("DomainModels", "Order, Money, User"), ("UseCases", "PlaceOrder, Sync"),
            ("RepositoryInterfaces", "protocols only")]
    for i, (name, sub) in enumerate(doms):
        out.append(box(dxs[i], 208, dw, 54, name, [sub], "good", title_size=11.5, line_size=9.5))
    out.append(elbow([(491, 174), (491, 194), (dxs[1] + dw / 2, 194), (dxs[1] + dw / 2, 204)], "neutral"))
    out.append(text(506, 191, "features depend on the domain, never the reverse", 9.5, "neutral", weight="700"))

    cxs, cw = row(4, gap=22, margin=42)
    cores = [("CoreNetworking", "URLSession client"), ("CorePersistence", "CoreData / GRDB"),
             ("DesignSystem", "tokens + components"), ("CoreTesting", "fixtures + doubles")]
    for i, (name, sub) in enumerate(cores):
        out.append(box(cxs[i], 292, cw, 54, name, [sub], "type", title_size=11.5, line_size=9.5))
    out.append(elbow([(dxs[1] + dw / 2, 262), (dxs[1] + dw / 2, 278), (cxs[1] + cw / 2, 278),
                      (cxs[1] + cw / 2, 288)], "neutral"))

    out.append(bracket(34, 30, 82, "accent", "app"))
    out.append(bracket(34, 116, 174, "modern", "features"))
    out.append(bracket(34, 208, 262, "good", "domain"))
    out.append(bracket(34, 292, 346, "type", "core"))

    c, _ = chips(4, 358, [("no cycles - SPM refuses to build them", "bad"),
                          ("a 'Common' module is an anti-pattern", "bad"),
                          ("one test target per module", "good"),
                          ("a preview app per feature", "good")])
    out.append(c)
    return canvas(386, "".join(out))


def mod_interface():
    out = [title(4, 16, "INTERFACE MODULES - HOW TO BREAK A DEPENDENCY (AND A BUILD BOTTLENECK)", "accent", 11.5)]

    out.append(box(6, 60, 214, 76, "FeatureCheckout", ["imports CatalogInterface", "compiles WITHOUT CatalogImpl"], "modern"))
    out.append(box(300, 60, 220, 76, "CatalogInterface", ["protocol CatalogService { }", "struct Product { }", "tiny + rarely changes"], "good"))
    out.append(box(600, 16, 220, 76, "CatalogImpl", ["final class LiveCatalog", "the heavy module"], "type"))
    out.append(box(600, 116, 220, 76, "CatalogMock", ["struct StubCatalog", "used by tests + previews"], "legacy"))
    out.append(box(300, 210, 220, 66, "App", ["the only module that sees", "BOTH sides: it wires them"], "accent"))

    out.append(arrow(224, 98, 294, 98, "neutral", label="imports"))
    out.append(elbow([(596, 54), (560, 54), (560, 92), (526, 92)], "neutral", dash=True))
    out.append(elbow([(596, 154), (560, 154), (560, 104), (526, 104)], "neutral", dash=True))
    out.append(text(534, 46, "conforms to", 9.5, "neutral", weight="700"))
    out.append(elbow([(410, 204), (410, 142)], "accent"))
    out.append(elbow([(524, 244), (926, 244), (926, 98)], "accent"))
    out.append(text(716, 238, "injects the live implementation at startup", 9.8, "accent", weight="700"))

    out.append(text(6, 158, "Result: touching CatalogImpl no longer recompiles FeatureCheckout.", 10.5, "neutral"))
    out.append(text(6, 176, "Tests and SwiftUI previews link the mock instead - fast and hermetic.", 10.5, "neutral"))

    strategies = [
        ("Single target", ["fastest to start", "slowest to build at scale", "no boundaries enforced"], "bad"),
        ("Layer-based", ["UI / Domain / Data", "clear rules", "every feature still touches all 3"], "legacy"),
        ("Feature-based", ["one module per feature", "teams work in parallel", "watch for shared-code sprawl"], "modern"),
        ("Feature + interfaces", ["impl hidden behind protocols", "best build times + testability", "most setup cost"], "good"),
    ]
    xs, w = row(4, gap=20)
    for i, (name, lines, tone) in enumerate(strategies):
        out.append(box(xs[i], 296, w, 82, name, lines, tone, title_size=11.5, line_size=9.6))
    out.append(text(4, 290, "PICKING A STRATEGY", 11, "accent", weight="800"))
    return canvas(390, "".join(out))


# ==========================================================================
# Algorithms
# ==========================================================================

def algo_picker():
    """Trigger -> pattern -> complexity, in a scannable grid."""
    out = [title(4, 16, "PATTERN PICKER - READ THE TRIGGER, REACH FOR THE PATTERN", "accent", 11.5)]
    items = [
        ("Two pointers", "sorted array, pair/triplet, in-place", "O(n) / O(1)", "good"),
        ("Sliding window", "contiguous subarray/substring, 'longest'", "O(n) / O(k)", "good"),
        ("Binary search", "sorted, or 'minimise the maximum'", "O(log n)", "good"),
        ("Hash map counting", "frequency, anagram, 'seen before'", "O(n) / O(n)", "modern"),
        ("Prefix sum", "range sums, 'subarray equals k'", "O(n) / O(n)", "modern"),
        ("Sort then sweep", "intervals, overlaps, scheduling", "O(n log n)", "modern"),
        ("Monotonic stack", "'next greater', spans, histograms", "O(n) / O(n)", "type"),
        ("Heap / top-K", "'k largest', streaming median, merge k", "O(n log k)", "type"),
        ("Fast & slow pointers", "linked list cycle, middle, palindrome", "O(n) / O(1)", "type"),
        ("BFS", "shortest path on unweighted graph, levels", "O(V+E)", "attr"),
        ("DFS / backtracking", "all combinations, permutations, paths", "O(2^n) / O(n!)", "attr"),
        ("Topological sort", "dependencies, 'can you finish', ordering", "O(V+E)", "attr"),
        ("Union-Find", "connected components, cycle in undirected", "~O(1) amortised", "legacy"),
        ("Dynamic programming", "'ways to', 'min cost', overlapping subproblems", "O(n*m)", "legacy"),
        ("Greedy", "local choice provably optimal, intervals", "O(n log n)", "legacy"),
        ("Trie", "prefix search, autocomplete, word dictionary", "O(len)", "bad"),
        ("Bit manipulation", "subsets, 'appears once', flags", "O(n) / O(1)", "bad"),
        ("Cyclic sort", "values are 1...n, 'find the missing'", "O(n) / O(1)", "bad"),
    ]
    xs, w = row(3, gap=18)
    for i, (name, trigger, cost, tone) in enumerate(items):
        r, c = divmod(i, 3)
        y = 30 + r * 64
        out.append(box(xs[c], y, w, 56, name, [trigger, cost], tone,
                       title_size=11.5, line_size=9.4))
    out.append(text(4, 434, "Say the pattern name out loud before you write code - "
                            "it tells the interviewer you recognised the shape of the problem.",
                    11, "accent", weight="700"))
    return canvas(444, "".join(out))


def bigo_curves():
    """Growth curves plus a 'what it costs at n = 1,000,000' panel."""
    x0, x1, ytop, ybot = 62.0, 540.0, 40.0, 292.0
    nmax, cap = 20.0, 110.0

    out = [title(4, 18, "HOW FAST IT BLOWS UP", "accent", 11.5)]
    out.append(axis(x0, ybot, x1 + 8, ybot))
    out.append(axis(x0, ybot, x0, ytop - 6))
    out.append(text(x1 + 8, ybot + 16, "input size n", 9.5, "neutral", anchor="end"))
    out.append(text(x0 - 6, ytop - 10, "work", 9.5, "neutral", anchor="start"))

    # `place` keeps the flat curves' labels from colliding at the right edge.
    curves = [
        ("O(1)", lambda n: 1.0, "good", "left"),
        ("O(log n)", lambda n: math.log2(n) if n > 1 else 0.0, "good", "end"),
        ("O(n)", lambda n: n, "modern", "end"),
        ("O(n log n)", lambda n: n * math.log2(n) if n > 1 else 0.0, "legacy", "end"),
        ("O(n^2)", lambda n: n * n, "bad", "end"),
        ("O(2^n)", lambda n: 2.0 ** n, "bad", "end"),
    ]
    for label, fn, tone, place in curves:
        pts, steps = [], 160
        for i in range(steps + 1):
            t = i / float(steps)
            n = 1.0 + t * (nmax - 1.0)
            v = fn(n)
            if v > cap:
                break
            pts.append((x0 + t * (x1 - x0), ybot - (v / cap) * (ybot - ytop)))
        if len(pts) < 2:
            continue
        out.append(polyline(pts, tone, width=2.2))
        lx, ly = pts[-1]
        if place == "left":
            out.append(text(x0 + 10, ly - 7, label, 10, tone, weight="800"))
        else:
            out.append(text(lx + 7, max(ly - 5, ytop + 4), label, 10, tone, weight="800"))

    rows = [
        ("O(1)", "constant", "dictionary lookup, array index", "1 step", "good"),
        ("O(log n)", "logarithmic", "binary search, balanced tree", "~20 steps", "good"),
        ("O(n)", "linear", "one pass, map / filter / reduce", "1 million", "modern"),
        ("O(n log n)", "linearithmic", "sort(), heap build + drain", "~20 million", "legacy"),
        ("O(n^2)", "quadratic", "nested loop, naive dedupe", "10^12 - too slow", "bad"),
        ("O(2^n), O(n!)", "exponential", "all subsets, all permutations", "not happening", "bad"),
    ]
    out.append(text(600, 34, "AT n = 1,000,000", 11, "accent", weight="800"))
    for i, (o, name, example, cost, tone) in enumerate(rows):
        y = 56 + i * 40
        out.append(dot(606, y + 6, tone, 4)),
        out.append(text(618, y + 10, o, 11.5, tone, weight="800"))
        out.append(text(722, y + 10, name, 10, "neutral"))
        out.append(text(618, y + 24, example, 9.6, cls="mono"))
        out.append(text(936, y + 10, cost, 10, tone, anchor="end", weight="700"))

    out.append(text(4, 320, "Space matters too: recursion depth is O(n) stack. "
                            "An interviewer asking \"can you do better?\" usually means "
                            "drop one factor of n with a hash map, a sort, or two pointers.",
                    10.5, "neutral"))
    return canvas(334, "".join(out))


# ==========================================================================
# Streams
# ==========================================================================

def stream_windows():
    """Tumbling / sliding / session windows, plus watermarks and late events."""
    x0, x1 = 96.0, 924.0
    span = x1 - x0
    out = [title(4, 16, "WINDOWING A STREAM OVER TIME", "accent", 11.5)]

    def tx(t):                       # t in 0...100 -> x
        return x0 + (t / 100.0) * span

    events = [3, 9, 14, 21, 24, 33, 38, 41, 52, 57, 61, 63, 74, 78, 86, 92, 96]

    # ---- raw event line ----
    out.append(text(6, 48, "events", 10.5, "neutral", weight="700"))
    out.append(axis(x0, 44, x1, 44))
    for t in events:
        out.append(dot(tx(t), 44, "accent", 4))

    # ---- tumbling ----
    out.append(text(6, 84, "tumbling", 10.5, "good", weight="700"))
    out.append(text(6, 97, "fixed, disjoint", 8.8, "neutral"))
    for i in range(4):
        out.append(slab(tx(i * 25) + 2, 68, span * 0.25 - 4, 30, "W%d" % (i + 1), "good"))

    # ---- sliding ----
    out.append(text(6, 132, "sliding", 10.5, "modern", weight="700"))
    out.append(text(6, 145, "size 40, step 20", 8.8, "neutral"))
    for i in range(4):
        out.append(slab(tx(i * 20) + 2, 112 + (i % 2) * 14, span * 0.40 - 4, 12, "", "modern"))
    out.append(text(x1, 152, "overlapping - every event lands in 2 windows", 9,
                    "modern", anchor="end"))

    # ---- session ----
    out.append(text(6, 186, "session", 10.5, "legacy", weight="700"))
    out.append(text(6, 199, "gap > 6 closes it", 8.8, "neutral"))
    sessions = [(1, 26), (31, 43), (50, 65), (72, 98)]
    for i, (a, b) in enumerate(sessions):
        out.append(slab(tx(a), 172, tx(b) - tx(a), 30, "session %d" % (i + 1), "legacy"))

    # ---- watermark / lateness ----
    out.append(text(6, 240, "watermark", 10.5, "bad", weight="700"))
    out.append(axis(x0, 236, x1, 236))
    wm = tx(70)
    out.append(polyline([(wm, 216), (wm, 256)], "bad", width=2))
    out.append(text(wm + 8, 224, "watermark: \"no more events older than this\"", 9.5, "bad", weight="700"))
    out.append(dot(tx(46), 236, "bad", 4.5))
    out.append(text(tx(46), 252, "late event", 9, "bad", anchor="middle", weight="700"))
    out.append(text(tx(46), 264, "drop it, or re-open the window", 8.6, "neutral", anchor="middle"))

    c, _ = chips(4, 284, [("tumbling = counters & billing", "good"),
                          ("sliding = rolling averages & alerts", "modern"),
                          ("session = user activity bursts", "legacy"),
                          ("always decide what happens to late data", "bad")])
    out.append(c)
    return canvas(312, "".join(out))


# ==========================================================================
# AI-assisted development
# ==========================================================================

def ai_loop():
    """The agentic loop for Swift work, plus where each kind of context belongs."""
    out = [title(4, 16, "THE LOOP THAT ACTUALLY SHIPS SWIFT CODE", "accent", 11.5)]
    stages = [
        ("1. Ground", ["point at the real files", "paste the real error", "@file, not \"my app\""], "accent"),
        ("2. Plan", ["plan mode / ask for a plan", "approve or correct it", "before any edit"], "modern"),
        ("3. Implement", ["small, reviewable diffs", "one concern per turn", "tests first when you can"], "type"),
        ("4. Verify", ["xcodebuild test via MCP", "agent reads the failure", "loop until green"], "good"),
        ("5. Review", ["you read every diff", "check API + concurrency", "then commit"], "legacy"),
    ]
    xs, w = row(5, gap=18)
    for i, (name, lines, tone) in enumerate(stages):
        out.append(box(xs[i], 34, w, 78, name, lines, tone, title_size=11.5, line_size=9.4))
        if i < 4:
            out.append(arrow(xs[i] + w + 2, 73, xs[i + 1] - 4, 73, "neutral"))
    out.append(elbow([(xs[4] + w / 2, 112), (xs[4] + w / 2, 132), (xs[0] + w / 2, 132),
                      (xs[0] + w / 2, 116)], "neutral", dash=True))
    out.append(text(470, 145, "failing test / wrong approach -> back to grounding, not to nagging",
                   9.5, "neutral", anchor="middle", weight="700"))

    out.append(text(4, 176, "WHERE EACH KIND OF CONTEXT BELONGS", 11, "accent", weight="800"))
    homes = [
        ("Always-on rules", ["CLAUDE.md / AGENTS.md", ".cursor/rules/*.mdc", "keep it SHORT"], "modern"),
        ("Reusable know-how", ["Claude Code skills", "(SKILL.md + scripts)", "loaded on demand"], "type"),
        ("Isolated work", ["subagents / parallel agents", "own context window", "search, review, migrate"], "good"),
        ("Hard guarantees", ["hooks + permissions", "format on write,", "tests before commit"], "legacy"),
        ("External systems", ["MCP servers", "XcodeBuildMCP, Xcode MCP,", "Figma, Sentry, docs"], "attr"),
    ]
    hxs, hw = row(5, gap=18)
    for i, (name, lines, tone) in enumerate(homes):
        out.append(box(hxs[i], 190, hw, 76, name, lines, tone, title_size=11, line_size=9.2))

    out.append(text(4, 288, "If it must be enforced -> a hook. If it is knowledge -> a skill. "
                            "If it is a delegation boundary -> a subagent. "
                            "If it is always true -> one short line in CLAUDE.md.",
                    10.5, "neutral"))
    return canvas(302, "".join(out))


# ==========================================================================
# Files
# ==========================================================================

def file_atomic_write():
    """The five steps of a crash-safe write, and what a crash at each point leaves."""
    xs, w = row(5, gap=18)
    out = [title(4, 16, "THE ATOMIC WRITE, STEP BY STEP", "accent", 11.5)]
    steps = [
        ("1. Write to temp", ["a NEW file, in the SAME", "directory as the target", "(rename needs one volume)"], "modern"),
        ("2. Flush", ["fsync, or F_FULLFSYNC", "for real durability", "bytes leave the page cache"], "type"),
        ("3. Rename over", ["rename(2) / replaceItemAt", "ATOMIC on one volume:", "the swap has no midpoint"], "good"),
        ("4. fsync the dir", ["makes the rename itself", "survive power loss", "usually skipped - know that"], "legacy"),
        ("5. Done", ["every reader saw either", "the whole old file or", "the whole new one"], "accent"),
    ]
    for i, (name, lines, tone) in enumerate(steps):
        out.append(box(xs[i], 42, w, 80, name, lines, tone, title_size=11.5, line_size=9.4))
        if i < 4:
            out.append(arrow(xs[i] + w + 2, 82, xs[i + 1] - 4, 82, "neutral"))

    out.append(text(4, 142, "IF THE PROCESS DIES HERE...", 10.5, "neutral", weight="800"))
    out.append(axis(3, 150, 934, 150))
    out.append(slab(3, 156, xs[1] + w - 3, 32,
                    "old file untouched - a stray temp file is the only damage", "good"))
    out.append(slab(xs[2], 156, w, 32, "old OR new, never a mix", "good"))
    out.append(slab(xs[3], 156, 934 - xs[3], 32,
                    "content is correct; on power loss the rename itself may be lost", "legacy"))

    out.append(box(3, 202, 460, 72, "What Foundation already does for you",
                   ["try data.write(to: url, options: .atomic)",
                    "-> temp file + rename. It does NOT fsync,",
                    "so it is crash-safe, not power-loss-safe."], "good"))
    out.append(box(477, 202, 457, 72, "The classic mistake",
                   ["let h = FileHandle(forWritingTo: url)",
                    "h.truncateFile(atOffset: 0)   // <- destroys the",
                    "h.write(newData)              //    only good copy"], "bad"))
    return canvas(286, "".join(out))


def file_size_strategy():
    """Pick the read strategy from the file size, not from habit."""
    xs, w = row(4, gap=20)
    out = [title(4, 16, "PICK THE STRATEGY FROM THE SIZE", "accent", 11.5)]

    tiers = [
        ("up to ~1 MB", "Load it whole", [
            "String(contentsOf: url,", "          encoding: .utf8)",
            "Data(contentsOf: url)", "", "simplest, one syscall,",
            "peak memory = file size"], "good", 1.00),
        ("~1 - 100 MB", "Memory-map it", [
            "Data(contentsOf: url,", "     options: .mappedIfSafe)",
            "", "the kernel pages it in on", "demand; random access is",
            "free, no copy"], "modern", 0.30),
        ("100 MB - GBs", "Stream it", [
            "for try await line in url.lines",
            "handle.read(upToCount: 1 << 16)",
            "", "one pass, constant memory,", "cannot random-access"], "legacy", 0.10),
        ("bigger than RAM", "Chunk, sort, merge", [
            "split into sorted runs ->", "k-way merge with a heap",
            "", "external sort: O(n log n) time,", "O(k * chunk) memory"], "bad", 0.20),
    ]

    for i, (size, name, lines, tone, _) in enumerate(tiers):
        out.append(text(xs[i] + w / 2, 36, size, 10.5, tone, anchor="middle", weight="800"))
        out.append(box(xs[i], 44, w, 124, name, lines, tone, title_size=12, line_size=9.4))

    out.append(text(4, 190, "PEAK MEMORY, RELATIVE", 10.5, "neutral", weight="800"))
    captions = ["= the whole file", "= pages touched", "= one chunk", "= k chunks"]
    for i, (_, _, _, tone, ratio) in enumerate(tiers):
        out.append(slab(xs[i], 198, max(w * ratio, 26), 20, "", tone, opacity=".35"))
        # Caption goes BELOW the bar - to the right it would collide with the next column.
        out.append(text(xs[i], 234, captions[i], 9.6, tone, weight="700"))

    c, _ = chips(4, 250, [("file I/O blocks - never on the main actor", "bad"),
                          ("mmap still page-faults on a slow disk", "legacy"),
                          ("one pass? stream. random access? map.", "good"),
                          ("test on a real-sized file", "modern")])
    out.append(c)
    return canvas(280, "".join(out))


# ==========================================================================
# Collections
# ==========================================================================

def collection_hierarchy():
    """Sequence -> Collection -> Bidirectional -> RandomAccess, plus the orthogonal ones."""
    xs, w = row(4, gap=26)
    out = [title(4, 16, "THE PROTOCOL LADDER - EACH RUNG ADDS A GUARANTEE", "accent", 11.5)]
    rungs = [
        ("Sequence", ["ONE pass, may be infinite", "makeIterator() / next()",
                      "map filter reduce first(where:)", "no count, no indices, no reuse"], "legacy"),
        ("Collection", ["multi-pass, finite, indexed", "startIndex endIndex subscript",
                        "count isEmpty indices first", "index math may be O(n)"], "modern"),
        ("BidirectionalCollection", ["can walk backwards", "index(before:) last reversed()",
                                     "String Set Dictionary", "suffix / dropLast are cheap"], "type"),
        ("RandomAccessCollection", ["O(1) index offset AND count", "distance(from:to:) is O(1)",
                                    "Array ArraySlice Range", "makes sort + binary search fast"], "good"),
    ]
    for i, (name, lines, tone) in enumerate(rungs):
        out.append(box(xs[i], 42, w, 92, name, lines, tone, title_size=11.5, line_size=9.4))
        if i < 3:
            out.append(arrow(xs[i] + w + 2, 88, xs[i + 1] - 4, 88, "neutral", label="refines"))

    out.append(title(4, 158, "ORTHOGONAL CAPABILITIES - MIX THEM IN", "accent", 11))
    oxs, ow = row(3, gap=26)
    others = [
        ("MutableCollection", ["subscript has a SETTER", "length cannot change",
                               "swapAt sort() reverse()", "shuffle() partition(by:)"], "attr"),
        ("RangeReplaceableCollection", ["the length CAN change", "append insert remove +=",
                                        "replaceSubrange(_:with:)", "removeAll(where:)"], "attr"),
        ("SetAlgebra", ["union intersection subtracting", "symmetricDifference",
                        "isSubset(of:) isDisjoint(with:)", "Set  OptionSet  IndexSet"], "str"),
    ]
    for i, (name, lines, tone) in enumerate(others):
        out.append(box(oxs[i], 166, ow, 92, name, lines, tone, title_size=11.5, line_size=9.4))

    out.append(text(4, 282, "Array = RandomAccess + Mutable + RangeReplaceable    "
                            "String = Bidirectional + RangeReplaceable (NOT RandomAccess)    "
                            "Set / Dictionary = Bidirectional, not ordered", 10.2, "neutral"))
    c, _ = chips(4, 292, [("target the WEAKEST rung that compiles", "good"),
                          ("Sequence for infinite or streaming data", "legacy"),
                          ("a Slice reuses the parent's indices", "bad")])
    out.append(c)
    return canvas(322, "".join(out))


def collection_picker():
    """What do you need -> which type, with the cost that matters."""
    out = [title(4, 16, "PICK THE CONTAINER", "accent", 11.5)]
    items = [
        ("Array", "ordered, indexed, duplicates ok", "index O(1) · append O(1)* · contains O(n)", "good"),
        ("Set", "membership + dedupe, unordered", "insert / contains O(1) avg", "good"),
        ("Dictionary", "key to value, unordered", "subscript O(1) avg", "good"),
        ("ContiguousArray", "Array without ObjC bridging", "same, slightly faster for classes", "modern"),
        ("ArraySlice", "a window onto an Array, no copy", "shares storage · indices are the PARENT's", "modern"),
        ("Range / ClosedRange", "0..<n, a..​.b — a lazy collection", "O(1) count · contains O(1)", "modern"),
        ("String / Substring", "grapheme clusters, not bytes", "count O(n) · no Int subscript", "legacy"),
        ("KeyValuePairs", "ordered literal pairs, duplicates ok", "lookup O(n) — for small fixed config", "legacy"),
        ("IndexSet", "a set of integers, run-length packed", "great for row/section index math", "legacy"),
        ("Deque", "queue: push/pop at BOTH ends", "O(1) both ends (Array.removeFirst is O(n))", "type"),
        ("OrderedSet", "Set that keeps insertion order", "O(1) lookup + a random-access view", "type"),
        ("OrderedDictionary", "Dictionary with a stable order", "O(1) lookup, ordered iteration", "type"),
        ("Heap", "min/max priority queue", "insert / popMin O(log n) · min O(1)", "type"),
        ("TreeDictionary / TreeSet", "persistent, cheap copies + diffing", "O(log n), structural sharing", "type"),
        ("BitSet", "dense set of small integers", "1 bit per element, fast set algebra", "type"),
        ("IdentifiedArray", "ordered AND keyed by Identifiable id", "TCA — O(1) by id, O(1) by index", "attr"),
        (".lazy view", "chain map/filter with no intermediates", "work happens on demand, per element", "accent"),
        ("AnyCollection / AnySequence", "erase the concrete type at an API edge", "adds a box + dynamic dispatch", "bad"),
    ]
    xs, w = row(3, gap=18)
    for i, (name, need, cost, tone) in enumerate(items):
        r, c = divmod(i, 3)
        out.append(box(xs[c], 30 + r * 64, w, 56, name, [need, cost], tone,
                       title_size=11.5, line_size=9.3))
    out.append(text(4, 434, "Deque · OrderedSet · OrderedDictionary · Heap · BitSet · TreeDictionary all come from "
                            "apple/swift-collections — one SPM dependency, no bridging cost.",
                    10.5, "accent", weight="700"))
    return canvas(444, "".join(out))


# ==========================================================================
# Timing
# ==========================================================================

def timing_marbles():
    """One input timeline, six timing operators, side by side."""
    x0, x1 = 232.0, 924.0
    span = x1 - x0
    row_h = 46.0
    top = 44.0

    def tx(ms):
        return x0 + (ms / 1000.0) * span

    out = [title(4, 16, "SAME INPUT, SIX OPERATORS - WINDOW = 200 ms", "accent", 11.5)]

    # window gridlines behind everything
    for ms in (200, 400, 600, 800):
        out.append(polyline([(tx(ms), top - 12), (tx(ms), top + row_h * 6 + 12)],
                            "neutral", width=1, dash=True, opacity=".35"))
        out.append(text(tx(ms), top - 16, "%d" % ms, 8.6, "neutral", anchor="middle"))

    def marble(x, y, label, tone, wide=False):
        if wide:
            width = max(len(label) * 6.0 + 12, 34)
            return slab(x - width / 2.0, y - 11, width, 22, label, tone, radius=11, opacity=".30", size=9)
        return (dot(x, y, tone, 9, opacity=".95")
                + text(x, y + 3.5, label, 9.5, anchor="middle", weight="800",
                       cls="", tone=None))

    events = [("A", 50), ("B", 120), ("C", 180), ("D", 520),
              ("E", 560), ("F", 600), ("G", 640), ("H", 700)]

    rows = [
        ("input", "8 values, two bursts", "accent",
         [(lbl, ms, False) for lbl, ms in events]),
        ("debounce(200ms)", "waits for 200 ms of SILENCE, keeps the LAST of a burst", "good",
         [("C", 380, False), ("H", 900, False)]),
        ("throttle(latest: false)", "at most one per window - keeps the FIRST", "modern",
         [("A", 200, False), ("D", 600, False), ("F", 800, False)]),
        ("throttle(latest: true)", "at most one per window - keeps the LAST", "modern",
         [("C", 200, False), ("E", 600, False), ("H", 800, False)]),
        ("delay(150ms)", "shifts EVERYTHING, drops nothing", "type",
         [(lbl, ms + 150, False) for lbl, ms in events]),
        ("collect(byTime: 200ms)", "buffers each window into an array", "legacy",
         [("[A,B,C]", 200, True), ("[D,E]", 600, True), ("[F,G,H]", 800, True)]),
        ("timeout(300ms)", "no value for 300 ms -> the stream FAILS and is over", "bad",
         [("A", 50, False), ("B", 120, False), ("C", 180, False)]),
    ]

    for i, (name, note, tone, marbles) in enumerate(rows):
        y = top + i * row_h
        out.append(text(6, y - 3, name, 10.5, tone, weight="800"))
        out.append(text(6, y + 11, note, 8.5, "neutral"))
        # The timeout row's stream is dead after the failure, so its axis stops there.
        fx = tx(480)
        out.append(axis(x0, y, fx if name.startswith("timeout") else x1, y))
        for label, ms, wide in marbles:
            if ms <= 1000:
                out.append(marble(tx(ms), y, label, tone, wide=wide))
        if name.startswith("timeout"):
            out.append(polyline([(fx - 8, y - 8), (fx + 8, y + 8)], "bad", width=2.6))
            out.append(polyline([(fx - 8, y + 8), (fx + 8, y - 8)], "bad", width=2.6))
            out.append(text(fx + 16, y - 2, "failure at 480 ms - the 340 ms gap blew the budget",
                            9, "bad", weight="700"))

    out.append(text(6, top + row_h * 6 + 34,
                    "debounce = \"tell me when they stop typing\".   throttle = \"at most N per second\".   "
                    "delay = \"same thing, later\".   collect = \"batch it\".   timeout = \"give up\".",
                    10.4, "accent", weight="700"))
    out.append(text(6, top + row_h * 6 + 50,
                    "Combine delivers the leading value of a throttle immediately and then one per window; "
                    "empty collect windows can still emit []. Verify against your Combine version.",
                    9.6, "neutral"))
    return canvas(int(top + row_h * 6 + 62), "".join(out))
