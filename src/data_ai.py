"""Using Cursor and Claude effectively on Apple-platform Swift work."""

from render import sheet, code, cmp, rules, table, diagram
import diagrams as D

G = "iOS Practice"

AI = sheet("ai-workflows", "AI Workflows for Swift (Cursor + Claude)", G,
    "Ground it, plan it, let it run the build, review every diff. Configuration that makes that reliable.", [

    diagram("The loop, and where context belongs",
            "Most bad AI output is a grounding failure, not a model failure.",
            D.ai_loop()),

    rules("Why Swift is harder for models than TypeScript", "Know the failure modes and you can pre-empt every one.", [
        ("bad", "**Stale APIs** — training data is full of `ObservableObject`, `@StateObject` and `DispatchQueue.main.async` where you now want `@Observable`, `@State` and `@MainActor`."),
        ("bad", "**Invented modifiers and initialisers** that never existed, especially in SwiftUI and Charts."),
        ("bad", "**Concurrency annotations by vibes** — `@unchecked Sendable` or `@MainActor` sprinkled until it compiles."),
        ("bad", "**Package versions and product names guessed** in `Package.swift`."),
        ("bad", "**It can't see the compiler.** Without a build tool it is writing Swift blind — and Swift's type inference means a small mistake produces a nonsense error a thousand lines away."),
        ("good", "All five are fixed the same way: pin the target versions in your rules file, and give the agent a way to actually build and test."),
    ]),

    code("CLAUDE.md / AGENTS.md for a Swift project", "Short, factual, and about *this* repo. Long files get skimmed.", r"""
# Project

iOS 17+ SwiftUI app, Swift 6 language mode, strict concurrency = complete.
Package manager: SPM only. Modules live in `Modules/`, app shell in `App/`.

## Build & test (always use these, never guess)
- Build:  `xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 16' build`
- Test:   `xcodebuild test -scheme App -testPlan Unit -destination '...'`
- Lint:   `swiftlint --strict` and `swift-format lint -r Sources`

## House rules
- SwiftUI only. Do not add UIKit unless a `Representable` is unavoidable.
- Observation (`@Observable`), NOT `ObservableObject`/`@Published`.
- Concurrency: `@MainActor` on view models, `actor` for shared state.
  Never `DispatchQueue`, never `DispatchSemaphore`.
- Tests: Swift Testing (`@Test`, `#expect`). Do not add XCTest to new targets.
- Dependencies are injected through initialisers. No singletons in domain code.
- Never edit `*.pbxproj` by hand; add files to the SPM target instead.

## Conventions
- One `View` per file; previews at the bottom with `#Preview`.
- Errors: typed enums per module conforming to `LocalizedError`.

## Do not
- Do not create README/summary files unless asked.
- Do not bump package versions as a side effect of another change.
"""),

    code("Cursor project rules — .cursor/rules/*.mdc", "The single `.cursorrules` file is deprecated; Agent mode reads `.mdc` and `AGENTS.md`.", r"""
# .cursor/rules/swift-concurrency.mdc
---
description: Swift 6 concurrency conventions for this app
globs: ["**/*.swift"]
alwaysApply: false        # attach when a matching file is in context
---

- The language mode is Swift 6, strict concurrency complete.
- View models are `@MainActor @Observable final class`.
- Shared mutable state is an `actor`. Never a serial DispatchQueue.
- Anything crossing an isolation boundary must be `Sendable`; if you are
  tempted to write `@unchecked Sendable`, stop and make it a value type.
- Bridge legacy callbacks with `AsyncStream` or a checked continuation
  that is resumed exactly once.

# .cursor/rules/testing.mdc
---
description: How to write tests here
globs: ["**/Tests/**/*.swift"]
alwaysApply: false
---
Use Swift Testing. Inject the clock, never sleep. One behaviour per test,
named test_whenCondition_thenOutcome.

# Rule activation modes:
#   alwaysApply: true      always in context (keep these tiny)
#   globs: [...]           auto-attached when a matching file is touched
#   description only       agent-requested: the model pulls it in when relevant
"""),

    table("Which surface owns which practice", "The 2026 decision table — pick one home per rule.",
        ["If it is…", "Put it in", "Because"],
        [["always true about the repo", "`CLAUDE.md` / `AGENTS.md` (short)", "loaded every turn — length costs you context"],
         ["true for some files only", "`.cursor/rules/*.mdc` with `globs`", "attached automatically when relevant"],
         ["reusable know-how or a procedure", "a Claude Code **skill** (`SKILL.md` + scripts)", "routed in on demand by its description"],
         ["a one-tap workflow you invoke", "a **slash command**", "explicit, repeatable, parameterised"],
         ["a delegation boundary", "a **subagent**", "own context window; parallel search / review / migration"],
         ["non-negotiable", "a **hook** or a permission rule", "runs deterministically, not \"if the model remembers\""],
         ["access to an external system", "an **MCP server**", "real tools instead of guessed output"],
         ["a big refactor across the tree", "a subagent per module, or a git worktree", "keeps contexts and diffs separate"]]),

    code("Give the agent a compiler: Xcode over MCP", "The single highest-leverage change for Swift work.", r"""
// Claude Code: add the build server once, then it can build, test and read failures.
//   claude mcp add xcodebuild -- npx -y xcodebuildmcp@latest
// or, in .mcp.json committed to the repo so the whole team gets it:
{
  "mcpServers": {
    "xcodebuild": { "command": "npx", "args": ["-y", "xcodebuildmcp@latest"] }
  }
}

// XcodeBuildMCP (maintained by Sentry since Feb 2026) exposes ~80 tools:
//   discover schemes, build, run tests, boot simulators, install & launch,
//   capture logs, drive the UI, and attach LLDB.
// Xcode 26.3 also ships its OWN MCP server: project structure, diagnostics,
//   SwiftUI preview screenshots and documentation search - any MCP client
//   (Claude Code, Cursor, Codex) can connect to it.

// The prompt that this unlocks:
//   "Run the Unit test plan. Fix whatever fails. Re-run until green,
//    then show me the diff."
// Now the agent has a ground-truth oracle instead of your patience.
"""),

    cmp("Prompting: grounded vs vague", "Same request, wildly different output quality.",
        [("Do", "good", r"""
"@CartViewModel.swift @CartView.swift

The 'Apply coupon' button does nothing when the cart
is empty. Expected: it stays disabled and shows the
hint text.

Constraints: Swift 6, @Observable, no new dependencies.
Write the failing test in CartViewModelTests.swift
first, show me it fails, then fix it.
Keep the diff under 40 lines."

--- and for a bug with a build error ---
"Here is the exact compiler output:
<paste the full error, including the note: lines>
Explain the cause in one sentence before changing
anything."
"""),
         ("Don't", "bad", r"""
"the coupon thing is broken, fix it"

"make my app faster"

"refactor this to be more SOLID"

"add tests"

// Why these fail:
// - no file, no repro, no expected behaviour
// - no constraint on scope, so you get a 900-line diff
//   touching files you never asked about
// - no oracle: nothing tells the model whether it
//   succeeded, so it declares victory and stops
""")]),

    rules("Prompt patterns that work on Swift codebases", "", [
        ("good", "**Failing test first.** \"Write a test that reproduces this, run it, show me red, then fix it.\" The test is the spec *and* the oracle."),
        ("good", "**Ask for the plan before the diff.** Plan mode, or literally \"don't write code yet — list the files you'd change and why.\""),
        ("good", "**Bound the blast radius.** \"Only touch these two files.\" \"Keep it under 50 lines.\" \"No new dependencies.\""),
        ("good", "**Paste real output** — the compiler error, the test failure, the crash log — not your paraphrase of it."),
        ("good", "**Ask for two options** on design questions, with the trade-off named. You pick; it implements."),
        ("good", "**Make it prove things.** \"Cite the file and line where that's defined\" kills a whole class of confident invention."),
        ("neutral", "**Pin the era**: \"iOS 17+, Swift 6, Observation, Swift Testing.\" Otherwise you get 2021 SwiftUI."),
        ("neutral", "**Restart the context** when a thread goes sideways. Re-grounding beats arguing with a confused transcript."),
    ]),

    code("Hooks: turn conventions into guarantees", "A rule the model might forget becomes a rule the tool enforces.", r"""
// .claude/settings.json - run the formatter after every Swift edit,
// and block a commit whose tests don't pass.
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "if [[ \"$CLAUDE_FILE_PATHS\" == *.swift ]]; then swift-format -i $CLAUDE_FILE_PATHS; fi"
      }]
    }],
    "PreToolUse": [{
      "matcher": "Bash(git commit:*)",
      "hooks": [{ "type": "command", "command": "swiftlint --strict --quiet" }]
    }]
  }
}

// Good hook candidates in a Swift repo:
//   format on write, lint before commit, regenerate the Xcode project
//   after Package.swift changes, block edits to Generated/ and *.pbxproj.
"""),

    code("A migration workflow that scales", "The pattern for \"change 200 files consistently\".", r"""
// 1. Do ONE by hand, or supervise the agent doing one. That file becomes the spec.
// 2. Capture the rule where the tool will see it:
//      .cursor/rules/observation-migration.mdc, or a Claude Code skill
//      with the before/after example inline.
// 3. Verify the loop closes on a single module:
//      "Migrate Modules/Profile from ObservableObject to @Observable.
//       Run the Profile test plan. Show me the diff and the test output."
// 4. Then fan out - one subagent (or one git worktree) per module,
//    so contexts and diffs never mix:
//      git worktree add ../app-profile   feature/observation-profile
//      git worktree add ../app-checkout  feature/observation-checkout
// 5. Review each diff separately. Small PRs, one module each.

// The rule of thumb: never ask for a change you could not review.
// If the diff is too big to read, the task was too big to delegate.
"""),

    table("Failure modes and the antidote", "",
        ["Failure", "What you see", "Antidote"],
        [["Hallucinated API", "`.onChange(of:perform:)` on iOS 17, invented modifiers", "MCP build tool; \"cite where this is declared\""],
         ["Era drift", "`ObservableObject`, `DispatchQueue.main.async`", "pin iOS/Swift versions in `CLAUDE.md` and rules"],
         ["Concurrency cargo cult", "`@unchecked Sendable` added until it builds", "rule: \"explain the isolation in one sentence first\""],
         ["Scope creep", "a 900-line diff you didn't ask for", "\"only these files\", \"under N lines\", plan mode first"],
         ["Confident wrongness", "\"Fixed!\" with no build run", "make green tests the definition of done"],
         ["Context rot", "it forgets a decision from ten turns ago", "restart, re-ground, or promote the decision into the rules file"],
         ["Package invention", "a version or product name that doesn't exist", "have it read `Package.resolved` before editing `Package.swift`"],
         ["Silent test weakening", "assertions deleted to make a suite pass", "review test diffs like production code"]]),

    rules("Where AI earns its keep on Apple platforms", "", [
        ("good", "**Boilerplate with a known shape** — `Codable` models from a JSON sample, `Representable` wrappers, TCA reducer scaffolding, `Package.swift` targets."),
        ("good", "**Tests for existing code** — especially edge cases you'd skip by hand. You review the assertions."),
        ("good", "**Mechanical migrations** — `ObservableObject` → `@Observable`, XCTest → Swift Testing, completion handlers → `async`."),
        ("good", "**Reading unfamiliar code** — \"explain how navigation flows through this module, cite files.\""),
        ("good", "**Build and test triage** — hand it the failure, let it bisect with real runs."),
        ("good", "**Accessibility and localization passes** — labels, Dynamic Type, string extraction. Verify with the actual audit tool."),
        ("bad", "**Novel concurrency design** — it will produce something that compiles and races."),
        ("bad", "**Security-sensitive code** — Keychain, crypto, auth flows. Review line by line or write it yourself."),
        ("bad", "**Performance work without measurement** — it optimises what looks slow, not what is slow."),
        ("bad", "**Architecture decisions** — it has no stake in the next two years of the codebase. You do."),
    ]),

    rules("Habits of people who get good output", "", [
        ("modern", "Keep `CLAUDE.md` / `AGENTS.md` **under a page**. Prune it when a rule stops being violated."),
        ("modern", "Commit your rules, `.mcp.json` and skills — the team's tooling should be reproducible, like any dependency."),
        ("modern", "One task per session. New task, new context."),
        ("modern", "Read every diff before staging. `git add -p` is a perfectly good AI review tool."),
        ("modern", "Let it run the tests. An agent that can't verify itself is a very fast intern with no feedback."),
        ("modern", "When it's wrong twice in the same way, that's a missing rule — write the rule instead of repeating yourself."),
        ("neutral", "You own the code. \"The model wrote it\" has never once been an accepted answer in a post-mortem."),
    ]),
])
