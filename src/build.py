"""Assembles every content module into a single self-contained `index.html`.

Run from anywhere:  python3 src/build.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import render                      # noqa: E402
import data_swiftui                # noqa: E402
import data_tca                    # noqa: E402
import data_conc                   # noqa: E402
import data_combine                # noqa: E402
import data_extra                  # noqa: E402
import data_principles             # noqa: E402
import data_ios                    # noqa: E402

OUTPUT = os.path.join(ROOT, "index.html")

# Order defines both the sidebar order and the scroll order.
SHEETS = [
    data_swiftui.SWIFTUI_STATE,
    data_swiftui.SWIFTUI_VIEWS,
    data_swiftui.SWIFTUI_UIKIT,
    data_tca.TCA_CORE,
    data_tca.TCA_COMPOSE,
    data_tca.TCA_NAV,
    data_conc.CONC_CORE,
    data_conc.CONC_ACTORS,
    data_conc.CONC_DOS,
    data_conc.THREADING,
    data_combine.COMBINE_CORE,
    data_combine.PATTERNS,
    data_extra.SWIFTUI_COMBINE,
    data_extra.CLEAN,
    data_principles.SOLID,
    data_principles.FP,
    data_principles.LANG,
    data_ios.ARCH,
    data_ios.MODULES,
    data_ios.TESTING,
    data_ios.BLE,
]


def main():
    ids = [s["id"] for s in SHEETS]
    duplicates = {i for i in ids if ids.count(i) > 1}
    assert not duplicates, "duplicate sheet ids: %s" % sorted(duplicates)

    html = render.build(SHEETS)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(html)

    cards = sum(len(s["cards"]) for s in SHEETS)
    print("wrote %s" % OUTPUT)
    print("%d sheets, %d cards, %d KB" % (len(SHEETS), cards, len(html) // 1024))


if __name__ == "__main__":
    main()
