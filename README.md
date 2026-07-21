# indy-prototypes

Indiana Jones puzzle prototypes — testing three design pillars against one
shared toolset.

Three small turn-based puzzle prototypes, each testing a different answer to
"where should the difficulty live?", all built on the exact same four tools.
The thing being prototyped is **the aha moment players get from discovering how
tools interact**; everything else here is scaffolding around that question.

## The three pillars

| | Pillar | Premise | What it tests |
| --- | --- | --- | --- |
| **A** | *Clever, not strong* | Static tomb, perfect information, no pressure. Pure deliberation — the room waits. | Are the interactions intrinsically satisfying to discover? |
| **B** | *The tomb is alive* | The room reacts and escalates every turn: collapsing floors, rising water, spreading fire, boulders in motion. Still fully turn-based and deterministic — the board just changes under you. | Does escalation make discovery thrilling, or just punish experimentation? |
| **C** | *Greed is the real enemy* | Tool uses cost scarce resources (torch fuel, bullets, sand); optional treasure sits off the safe path. The puzzle is affording what you want. | Does scarcity deepen the choices, or suppress the experimenting that discovery needs? |

All three are **turn-based and puzzle-first**. There is no reflex or action
gameplay anywhere in this repo, Pillar B included — an escalating room is still
a deterministic room, and a player who takes ten minutes per turn must be able
to play it perfectly.

## Why one shared toolset

All three prototypes use the same four tools — **whip, torch, revolver, sand
satchel** — resolved through the same data table in
[`src/kernel/tools.ts`](src/kernel/tools.ts).

This is deliberate. Three prototypes with three different toolsets would
confound the pillar with the verbs: if B felt better than A, you could never
tell whether that was the escalation or just a better whip. Holding the verbs
fixed makes the pillar the only variable, so the comparison actually means
something.

It is enforced structurally, not by discipline. Interactions live in one
registry keyed by `(tool, targetKind)` returning an effect — never as if/else
scattered through a prototype's simulation. Three consequences:

1. **The interaction set is enumerable**, so tooling can measure which
   combinations a level actually uses (`coverage()`).
2. **Adding a tool is a data change**, not a simulation rewrite.
3. **Accidental inconsistency between prototypes is impossible** — there is
   exactly one answer to "what does the whip do to a boulder", and it lives in
   one place.

### The designed "aha" set

Six seeded interactions, each flagged `aha: true` in the table and asserted in
`src/kernel/tools.test.ts`:

- **WHIP + BOULDER = pull** *(flagship)* — block puzzles are defined by the
  constraint that you can only push, never pull. The whip inverts it, which
  retroactively re-opens every earlier room.
- **SAND + PRESSURE PLATE = weight substitution** — the literal Raiders idol swap.
- **TORCH + OIL TRAIL = propagating fire** — spreads one tile per turn, turning
  time into a puzzle element rather than just a resource.
- **REVOLVER + ROPE = sever at range** — drops whatever the rope suspends.
- **WHIP + TORCH = remote ignition** — fling a lit torch across a gap to light
  a distant brazier.
- **REVOLVER + GAS VENT = spark → explosion** — a trap for careless players;
  the aha is realizing the safe tool is the wrong tool.

See [`TOOL-MATRIX.md`](TOOL-MATRIX.md) for the full 4×4 tool-pair grid and the
tool-vs-environment table, including every cell still marked `TODO`.
See [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) for theme, core value, and pillars.

---

## THE RULE: the simulation is a pure function

> **`step(state, intent) => newState`**
>
> **No DOM. No canvas. No timers. No `Date.now()`. No randomness.**

Every mechanic in this repo is built and verified on a **headless server with
no display**. Nobody can look at the game to check whether it works. That makes
**unit-testing the pure simulation the only way to prove a mechanic works** —
so anything that decides a game outcome must be reachable from a test, which
means it must be a pure function of state and intent.

Concretely:

- `src/kernel/grid.ts`, `tools.ts`, `undo.ts`, `input.ts` — **pure**. Import
  freely from simulation code. Fully unit-tested.
- `src/kernel/render.ts`, `loop.ts` — **the shell**. They touch canvas and
  input wiring, they are not verifiable here, and therefore **nothing in them
  may decide a game outcome**. Render reads state and never writes it. The loop
  owns history and repaint, and never decides what a turn means.

If you find yourself needing a timer to make a mechanic work, the mechanic is
wrong for this repo. Pillar B escalates on *turn count*, never on elapsed time.

State is immutable, which is also why undo is trivial: it is just keeping the
old pointer (see `src/kernel/undo.ts`, 200-entry cap).

## Running it

Requires Node 20+.

```sh
npm install
npm run dev      # dev server — landing page links all three pillars
npm run build    # tsc typecheck + vite production build
npm run test     # vitest — the only real verification available here
npm run test:watch
```

Pages: `/` (landing), `/pillar-a/`, `/pillar-b/`, `/pillar-c/`.

## The ASCII level format

Every level is hand-authored ASCII so it can be edited in a text editor.
`parseLevel(rows: string[])` in `src/kernel/grid.ts` turns it into a `TileMap`
plus a list of entities.

Terrain characters map to tiles. Entity characters place an entity and stamp
`FLOOR` underneath, so `O` means "a boulder standing on a floor" — you never
have to author two layers.

**Terrain**

| Char | Tile | Walkable |
| --- | --- | --- |
| `#` | WALL | no |
| `.` | FLOOR | yes |
| `:` | GAP — whip-swingable chasm | no |
| `X` | PIT — sand-fillable | no |
| `,` | RUBBLE — what shattered stone leaves | yes |
| `=` | WATER | no |
| `>` | EXIT | yes |
| (space) | VOID — off-map padding | no |

**Entities**

| Char | Entity | Char | Entity |
| --- | --- | --- | --- |
| `@` | PLAYER (spawn) | `c` | CRACKED_STONE |
| `O` | BOULDER | `M` | METAL_PLATE |
| `_` | PRESSURE_PLATE | `B` | BRAZIER |
| `~` | OIL_TRAIL | `t` | TORCH_ITEM |
| `r` | ROPE | `V` | VINE |
| `v` | GAS_VENT | `$` | TREASURE |
| `/` | LEVER | `n` | SAND_PILE |
| `s` | SNAKE | `G` | GUARDIAN |

Example — a room teaching the flagship pull:

```
##########
#@..O.._.#
#######.##
#....O...#
#..####..#
#.......>#
##########
```

Rules the parser enforces:

- Ragged rows are right-padded with VOID, so **trailing whitespace never
  changes a level** — an editor that strips it is safe.
- At most one `@`.
- Unknown characters are a hard error with the row and column reported, rather
  than a silently mis-parsed room.

## Layout

```
index.html            landing page linking all three pillars
pillar-{a,b,c}/       one HTML entry point per prototype
src/
  kernel/             genre-agnostic foundation — the shared core
    grid.ts           Vec2, TileMap, parseLevel, ray helpers          [pure]
    tools.ts          THE INTERACTION TABLE                           [pure]
    tools.test.ts     asserts every seeded interaction + parseLevel
    input.ts          discrete intents: move, USE_TOOL 1..4, undo,
                      reset, wait                                     [pure]
    undo.ts           history stack, 200 cap                          [pure]
    loop.ts           turn driver                                     [shell]
    render.ts         canvas, flat art, warm temple palette           [shell]
  pillar-a/           PILLAR A — static tomb, perfect information
    sim.ts            step(state, intent), pure                      [pure]
    levels.ts         six ASCII rooms + teaches/requires/aha comments
    sim.test.ts       replays for all six + the unsolvable-by-pushing proof
    main.ts           canvas, keys, HUD                              [shell]
    NOTES.md          the honest memo
  pillar-{b,c}/       per-prototype entry points (placeholders for now)
DESIGN-BRIEF.md       theme, core value, the three pillars
TOOL-MATRIX.md        the full design space; TODO cells are the backlog
```

## Status

**Pillar A is built** — six rooms at `/pillar-a/`, with a pure sim
(`src/pillar-a/sim.ts`), six ASCII levels, and replay tests that win every one
of them. Its headline result is a machine-checked one: level 4 is *proved*
unsolvable by pushing, by exhausting the entire 781-state push-only space and
finding no win, then finding one the moment the whip is allowed. See
[`src/pillar-a/NOTES.md`](src/pillar-a/NOTES.md) for the honest read, including
two seeded interactions that turn out to be incompatible with this pillar.

**Pillar C is built** — six rooms at `/pillar-c/`, with a pure sim
(`src/pillar-c/sim.ts`) carrying a resource economy, six ASCII levels, and
replay tests that win every one of them. Its headline result is that every room
has a *solution space* rather than a solution: each level ships a proven
zero-treasure escape (no room can be bricked), a proven at-or-above-par run, and
for five of the six, two different winning routes at measurably different
scores — c6 spans 73 against 48 on the single question of which pool pays the
door. Every one of those numbers was found by exhaustively searching the room's
reachable state space, which caught two rooms that were silently broken. See
[`src/pillar-c/NOTES.md`](src/pillar-c/NOTES.md) for the honest read, including
why scarcity is expected to suppress the very experimentation this project is
trying to measure.

Costs live in the shared table as additive metadata (`costOfUse()` in
`src/kernel/tools.ts`) rather than in a forked copy, so Pillars A and B are
untouched by it and their tests still pass unchanged.
