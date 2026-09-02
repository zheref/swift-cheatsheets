"""The eight infographics: Core Bluetooth, Testing, Architecture, Modularization."""

from svgkit import (CANVAS, canvas, box, band, chips, arrow, elbow, text, title,
                    row, bracket, color)


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
                           ("one CBCentralManager per app is enough", "good")])
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

    c, _ = chips(4, 358, [("no cycles - SPM will refuse to build them", "bad"),
                          ("a 'Common' dumping-ground module is an anti-pattern", "bad"),
                          ("every module gets its own test target", "good"),
                          ("each feature can run in a preview app", "good")])
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
