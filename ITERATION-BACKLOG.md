# ITERATION-BACKLOG.md

Three changes per pillar, ordered by **value per hour** — cheapest-with-highest-payoff
first, not most-important first. Every item names the files it touches and the
audit number or code line that motivates it. A later task executes these verbatim,
so each is written to be actionable without re-deriving the analysis.

Rationale for the ordering lives in [`COMPARISON.md`](COMPARISON.md); the numbers
cited come from [`AUDIT.md`](AUDIT.md).

---

## Pillar A — "Clever, not strong"

### A1. Remove the soft-lock in a6: `TORCH+ROPE` destroys the payload

**Files:** `src/pillar-a/levels.ts:234`, `src/pillar-a/sim.ts:498-503`,
`src/pillar-a/sim.test.ts:415-422`

a6's loadout includes `TORCH`, but a6 contains no vine, no brazier, no oil and no
darkness — the torch's only live interaction in that room is
`TORCH+ROPE → BURN_THROUGH`. `applyEffect`'s `BURN_THROUGH` case (`sim.ts:498-503`)
deletes the rope entity **without spawning the payload**, unlike `SEVER`
(`sim.ts:505-518`), which reads `entity.flags?.suspends`. A player who burns the
rope instead of shooting it destroys the only boulder in the level; both plates
then need weight, one satchel load exists, and the room is unwinnable with no
death, no message, and no signal.

Do both:
1. Drop `'TORCH'` from a6's `tools` array at `levels.ts:234`. It has no other use
   in that room.
2. Make `BURN_THROUGH` honour `flags.suspends` the way `SEVER` does, so burning a
   rope drops its payload rather than deleting it.

Then fix the test at `sim.test.ts:415-422`, which is named
`'has no unrecoverable failure state in any shipped level'` but only checks for the
absence of `GAS_VENT`. Replace it with a reachability check: from every reachable
state, assert a win is still reachable.

**Why first:** highest value per hour in the repo. It is a two-line content fix
plus a small sim fix, it removes a genuine unwinnable state from the pillar's
best-forcing room (a6 forces 3/3, the highest in A), and it retires a test that
currently asserts something false.

### A2. Author a7 to exercise `WHIP+TORCH` (FLING / remote ignition)

**Files:** `src/pillar-a/levels.ts` (new level), `src/pillar-a/routes.ts` (new
authored route), `src/pillar-a/sim.test.ts` (new replay), `src/pillar-a/sim.ts:322-331`,
`src/pillar-a/sim.ts:547-549`

`WHIP+TORCH` is the only one of the six seeded ahas that Pillar A skips for **no
principled reason**. A's `NOTES.md:27-31` groups it with `TORCH+OIL_TRAIL` and
`REVOLVER+GAS_VENT` as pressure-dependent, and that is wrong: remote ignition needs
no clock and no lethality. It is fully static-compatible, it is the only tool-on-
tool cell filled in `TOOL-MATRIX.md`, and it currently fires in **zero rooms in the
entire project** (all three pillars). The machinery already ships unreachable:
`FLING` is implemented at `sim.ts:545-564` including brazier ignition at the landing
tile, `BRAZIER` is in `BLOCKING` at `sim.ts:151`, and `sim.ts:608` already makes an
unlit brazier hold every portcullis shut. No level contains a `B` or a `t`.

Two blockers must be cleared before the room can be authored:
- `FLING` targets a `TORCH_ITEM` **entity** via `findTarget` (`sim.ts:322-331`), but
  the player's torch is a `ToolId` in `state.tools` (`sim.ts:118`). There is no code
  path that flings the torch you are carrying — only one lying on the floor. Either
  allow the carried torch as a fling source, or author the room around a floor
  `TORCH_ITEM` and accept the narrower verb.
- `sim.ts:547-549` takes `reach[reach.length - 1]` — always maximum distance — and
  lights a brazier only at that exact endpoint. A brazier mid-flight is flown over.
  Light the first brazier along the ray instead.

Then author a7: a brazier across a gap holding a portcullis shut, a floor torch on
the near side, no other route. Add the authored route to `routes.ts` and a replay
to `sim.test.ts`, and re-run `npm run audit`. Raises A's TOOL-MATRIX coverage from
5/20 to 6/20 and adds the pillar's second real discovery beat after a4.

**Why second:** highest raw value in Pillar A — it is a new aha, not a repair — but
it costs more hours than A1 because two sim changes gate it.

### A3. Move a4's decoy boulder off the optimal walking lane

**Files:** `src/pillar-a/levels.ts:157`

a4 reports **21 winning states within opt+2 and 1,681 reachable states**, against
1-2 win states for every other Pillar A room. Independent re-search of the space
confirms the cause: all 21 win states are identical except for the decoy boulder's
resting position. The player is always at (3,6) and the target boulder always at
(10,1) — the pull itself is completely unambiguous. The decoy at **(5,2)** sits
directly on the optimal walking lane (east along row 1, drop to row 2, continue
east), so shoving it is a *free* move that advances the player and displaces the
boulder in the same turn. That produces nine distinct win states at cost 20 before
any of the +2 slack is spent.

Move the `O` at `levels.ts:157` from (5,2) to **(6,4)** — off the row-1→row-2
corridor, still freely pushable in all directions, still rescuable by pulling.

This preserves every property a4's own comment block claims (`levels.ts:133-140`:
the player must be able to exhaust pushing before the reveal lands) while making
shoving the decoy cost a turn. Expect the ≤opt+2 win-state count to fall from 21
toward 1-3 and the reachable graph to roughly halve. Re-run `npm run audit` and
confirm a4 stays `GOOD` at 1/1 forced with optimal still 20.

**Why third:** a one-character edit, but the lowest value of the three — the
ambiguity it removes is arguably the design working, since the sandbox is what
makes the reveal land. Do it for the cleaner metric, not because a4 is broken.

---

## Pillar B — "The tomb is alive"

### B1. Force `TORCH+OIL_TRAIL` in b2 by removing the top-corridor bypass

**Files:** `src/pillar-b/levels.ts:84-120` (b2's `rows`), `src/pillar-b/routes.ts`

b2 declares `requires: TORCH+OIL_TRAIL, FIRE+VINE` and forces **0 of 2**
(AUDIT.md:104). The shortest win is 13 moves: `E E E E E E E E E E TE E E` — walk
the top row, torch the vine directly (firing `TORCH+VINE`, not `TORCH+OIL_TRAIL`),
walk out. The room's own comment concedes a second dead verb: "The satchel is
carried and never needed."

`TORCH+OIL_TRAIL` is the single most important unfixed thing in this repository:
it is declared in b2 and b6, forced in **neither**, it fires in zero rooms across
all three pillars, and it is **structurally impossible in A and C** (both memos
independently identify it as needing a turn-count clock). Pillar B is the only
place it can ever live, and b2 is the better of its two attempts. Fix b2 and the
brief's "turns time into a puzzle element" claim has evidence for the first time.

Two edits to b2's `rows`:
1. **Wall off the top corridor** so the vine cannot be reached on foot at all —
   the only approach to the vine's tile must be from the far side of the oil.
2. **Delete the `TORCH+VINE` melee answer** as a competing route: either remove the
   vine and make the fire itself open the path (`FIRE+VINE`, which the level already
   declares), or move the vine behind the burn so reaching it requires the fire to
   have already propagated.

Then re-author b2's route in `routes.ts` and re-run `npm run audit`. Target: 2/2
forced, and `TORCH+OIL_TRAIL` appearing in the "registry rows exercised" rollup for
the first time in the project.

**Why first:** a level-geometry edit — cheap in hours — and it is the only change in
this document that can rescue a seeded aha currently at zero across the whole repo.

### B2. Author b6's route, or cut b6

**Files:** `src/pillar-b/routes.ts`, `src/pillar-b/levels.ts:267-341`,
`src/pillar-b/scratch.test.ts`

b6 is the pillar's capstone: a 45-line design comment describing a four-system
chain with exactly one correct turn to strike the match. It declares five required
interactions and forces **zero** (AUDIT.md:109); the shortest win is 11 moves,
`S S E E E SE W W W S S`, firing one interaction. `routes.ts` has **no b6 entry** and
documents the gap honestly. `scratch.test.ts`'s b6 block contains **zero `expect`
calls** — it runs a fixed sequence and two `console.log`s. And `levels.ts:304` claims
the one-turn window is asserted "so the window is a fact about the simulation rather
than a claim in a comment." It is a claim in a comment.

Do one of two things, and decide before starting:
- **Author it.** Produce the winning route the comment describes, add it to
  `routes.ts` as `AUTHORED.b6`, and add a real assertion in the test suite: replay
  the route, assert `WON`, then replay it shifted one turn each way and assert both
  fail. That last pair is what would make the one-turn window a fact.
- **Cut it.** Delete b6 from `levels.ts` and the scratch block. A capstone that
  cannot be authored is a finding about the pillar, and shipping it unproven while
  six comments cite proof that does not exist is worse than not shipping it.

Also fix the b5 comment/data mismatch while in this file: the header at
`levels.ts:219` says `requires: REVOLVER+GUARDIAN, FLOOD+FLOOR` but the exported
field at `levels.ts:255` is `['REVOLVER+GUARDIAN']`.

**Why second:** decides whether escalation is a workable pillar or an unfinishable
one. That is high value, but authoring a four-system one-turn-window room is the
most expensive hour-per-outcome item in this document, which is why B1 goes first.

### B3. Replace `scratch.test.ts` with a real `src/pillar-b/sim.test.ts`

**Files:** delete `src/pillar-b/scratch.test.ts`, create `src/pillar-b/sim.test.ts`;
verify the citations at `src/pillar-b/levels.ts:42, 187, 231, 304` and
`src/pillar-b/sim.ts:156, 1229`

`scratch.test.ts` is 82 lines and 7 `it()` blocks against Pillar A's 438-line suite.
Every replay is `console.log(log); expect(s.status).toBe('WON')` — no invariant
tests, no state-space searches, no property tests, and b6 has no assertion at all.
**`src/pillar-b/sim.test.ts` does not exist**, yet six comments across `levels.ts`
and `sim.ts` cite it as proof of specific guarantees, including "asserts these
comment blocks match the exported data" (`levels.ts:42`), "proves it by exhausting
the room's whole state space" (`levels.ts:231`), and "no matter what the player
does. `sim.test.ts` asserts exactly that" (`sim.ts:1229`). Every one of those
guarantees is currently unbacked.

Port Pillar A's suite structure: the comment↔data rot-guard (`pillar-a/sim.test.ts:170-194`,
which reads its own source via `?raw` and asserts `teaches`/`requires`/`aha` match),
the requires-token validity check (`pillar-a/sim.test.ts:154-168`), and per-level
replay assertions. Then walk each of the six citations above and either make it
true or delete the claim.

**Why third:** the most hours and the least immediate design payoff — but it is what
makes B1 and B2 verifiable, and nothing in Pillar B should be trusted until it
exists. If B2 resolves as "cut b6", do this before any further B content.

---

## Pillar C — "Greed is the real enemy"

### C1. Price the flagship at zero

**Files:** `src/kernel/tools.ts:236` (the `WHIP+BOULDER` row), `src/pillar-c/NOTES.md:53-57`

C's memo names this as its own biggest risk and does not act on it: "`WHIP+BOULDER`
is here priced at 8 points, which converts the best discovery in the project into a
line item. A player who has just realised they can *pull* should be exhilarated; a
player who has just realised pulling costs 8 does arithmetic instead."

The code confirms there is currently no lever: 8 comes purely from
`COST_POINTS.whip = 8` (`pillar-c/sim.ts:143-148`), and `costOfUse()`
(`kernel/tools.ts:209-217`) has no way to price the pull differently from a whip
swing across a gap. But the hook already exists and is unused — the per-row
`Interaction.cost` field (`tools.ts:138`) is unset on **every** shipped row and takes
precedence over both the override table and the tool default.

Set `cost: { resource: 'whip', amount: 0 }` on the `WHIP+BOULDER` row. The project's
headline discovery becomes free to find while whip *traversal* stays metered, which
is the distinction C wants and cannot currently express. Zero impact on Pillars A and
B, which never read `cost`. Then re-run `npm run audit` — c1 and c6 pars will need
re-checking, since the pull no longer costs 8 against their par of 25 and 65.

**Why first:** one line, and it answers the pillar's own stated central risk. Nothing
else in this document has that ratio.

### C2. Force the aha in c4 by moving the exit behind the portcullis

**Files:** `src/pillar-c/levels.ts:271-281` (c4's `rows`), `src/pillar-c/levels.ts:283`
(`requires`)

c4 is the only `AHA NOT FORCED` room in Pillar C: deleting `SATCHEL+PRESSURE_PLATE`
still meets par 48 against a best of 56 (AUDIT.md:146). The cause is geometric. The
`>` EXIT sits at **(9,3)**, *inside* the dark corridor, one tile past the last `%`,
and that corridor runs continuously from (1,3). So the portcullis at (11,2) — the
thing the idol-plate holds open — is not the only way out. It is a shortcut, exactly
as the level name says. Taking both idols (85) and walking home through the dark
costs only fuel: 85 − 9 fuel × 4 = 49 ≥ par 48.

**Move the exit out of row 3.** Put `>` at (11,1), reachable only by passing through
the portcullis at (11,2), and make row 3 a dead-end alcove containing the second
treasure. The dark corridor stays a real greed decision — walk in for the 30-point
idol and pay fuel, or skip it — but it stops being an escape route, so the sand
substitution becomes the only way out and `SATCHEL+PRESSURE_PLATE` becomes genuinely
load-bearing.

**Do not fix this by raising `par` to 54.** That is the tempting one-line change and
it is a fudge: it makes the number pass without making the room force anything, and
it is exactly the kind of par-tuning that makes Pillar C's 3.33 forced-per-level hard
to trust in the first place.

While in the file, add `TORCH+DARK` to c4's `requires:` at `levels.ts:283`. It fires
on the best route (`sim.ts:455`) and is currently undeclared, which is why the audit
reports 1/2 rather than grading all three interactions the room actually uses.

**Why second:** a level-geometry edit that converts the pillar's only failing room to
`GOOD` — and, more importantly, converts it honestly.

### C3. Make c5's lower loop real, or delete it

**Files:** `src/pillar-c/levels.ts:293-340`, `src/pillar-c/routes.ts:166-181`

c5 is the thinnest room in Pillar C: shortest route 3 moves, only 2 interactions
fired, 2 win states within opt+2 (AUDIT.md:138). The proven zero-treasure escape is
literally `[M('S'), M('S'), M('S')]` — three steps south from spawn — which makes the
"no room is a trap" proof trivially true here and therefore meaningless.

The whole lower loop is dead content: the cracked stone `c` at (2,3) and the pit `X`
at (3,3) are **never touched by any authored route**. `best` and `alt`
(`routes.ts:172-181`) are top-corridor out-and-back only, so the `bullets: 1` and
`sand: 1` in `start` (`levels.ts:329`) are dead inventory. The room's own comment
advertises a four-option ledger (`levels.ts:307-310`) of which two options nothing
verifies.

Pick one:
- **Prove it.** Add `PROOFS.c5.alt2` demonstrating the lower-loop line the comment
  claims, with its measured score, so the four-option ledger is backed by four routes.
- **Cut it.** Delete the `c`, the `X`, and the lower corridor, remove `bullets` and
  `sand` from `start`, and re-describe c5 honestly as a two-interaction
  whip-traversal tutorial priced accordingly.

Either way, move the exit away from spawn so the escape is a decision rather than
three steps. Re-run `npm run audit` afterwards.

**Why third:** real, but the smallest payoff of the three — c5 is already rated
`GOOD` and this is about the room being honest rather than the pillar being wrong.
