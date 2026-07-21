# TOOL MATRIX

**This document is the actual design space of the game.**

Every cell is a possible interaction. Six are designed and implemented; the
rest are marked `TODO` with a one-line prompt about what a good interaction
there might do. The empty cells are not oversights — they are the backlog.
Later work mines them.

Source of truth is the data table in [`src/kernel/tools.ts`](src/kernel/tools.ts).
This file is the designer-facing view of it. If they disagree, the code wins and
this file is stale.

Legend: **🔥 = a designed "aha" interaction** · `—` = deliberately nothing ·
`TODO` = unexplored cell

---

## 1. Tool × Tool (4 × 4)

Tool-on-tool combinations. These are the rarest and highest-value discoveries,
because they are the moment the player stops seeing four buttons and starts
seeing a *set*. Only one is currently designed.

Read as: **row tool** is used on **column tool**.

| ↓ used on → | WHIP | TORCH | REVOLVER | SATCHEL |
| --- | --- | --- | --- | --- |
| **WHIP** | `—` <br> Self-pairing; nothing coherent. | 🔥 **FLING** <br> Fling the lit torch up to 3 tiles to light a distant brazier. **Remote ignition.** | `TODO` <br> Disarm-style: whip a dropped revolver back to hand from across a gap? | `TODO` <br> Whip the satchel open mid-air to scatter sand over a wide area at range? |
| **TORCH** | `TODO` <br> Burn-harden or light the whip — a flaming whip that ignites what it strikes? | `—` <br> Self-pairing. | `TODO` <br> Heat rounds so a shot ignites instead of merely shattering? | `TODO` <br> Fuse sand to glass — a one-tile permanent walkable bridge? |
| **REVOLVER** | `TODO` <br> Shoot a whip anchor loose from range, retrieving a stuck whip? | `TODO` <br> Shoot a *placed* torch to knock it into a new tile — poor man's fling? | `—` <br> Self-pairing. | `TODO` <br> Shoot a hanging satchel to burst it, dumping its weight onto a plate below? |
| **SATCHEL** | `TODO` <br> Sand a whip anchor for grip — make an unswingable gap swingable? | `TODO` <br> Smother the torch: trade light for a turn of safety near gas? | `TODO` <br> Sand in the barrel — a deliberate self-jam to avoid an accidental spark? | `—` <br> Self-pairing. |

**Observation for later mining:** the whip row is the most productive one,
because the whip is the only tool that *moves other objects*. Any tool that can
be picked up is a whip target. That is a strong hint that new tools should be
designed as things the whip can throw.

---

## 2. Tool × Environment

The bread-and-butter interactions. Rows are environment targets; columns are
tools.

| Target | WHIP | TORCH | REVOLVER | SATCHEL |
| --- | --- | --- | --- | --- |
| **BOULDER** `O` | 🔥 **PULL 1** <br> Pull one tile toward you. Inverts push-only. **Flagship.** | `TODO` <br> Heat then crack the stone — a slow, two-turn alternative to a bullet? | `TODO` <br> Ricochet harmlessly, or chip it into a slow roll? | `TODO` <br> Sand under a boulder as a lubricant, letting one push travel further? |
| **PRESSURE_PLATE** `_` | `TODO` <br> Trip a plate at range without standing on it? | `TODO` <br> `—` probably; light has no weight. | `TODO` <br> Shoot the plate to jam its mechanism permanently? | 🔥 **SUBSTITUTE_WEIGHT** <br> Sand holds the plate down so you can step off. **The Raiders idol swap.** |
| **OIL_TRAIL** `~` | `TODO` <br> Whip-crack a spark, igniting oil at range? | 🔥 **PROPAGATE_FIRE** <br> Burns 1 tile/turn along the trail. **Turns time into a puzzle element.** | `TODO` <br> Muzzle flash ignites it at range — cheaper than walking there? | **PLACE_WEIGHT** <br> Smother one tile to build a firebreak. |
| **ROPE** `r` | `TODO` <br> Grab the rope and swing, instead of cutting it? | **BURN_THROUGH** <br> The melee answer. Slower and riskier than a bullet. | 🔥 **SEVER** <br> Cut at range; the payload drops. **You are aiming the payload, not the rope.** | `TODO` <br> Weigh a rope down to lower what it holds gently, rather than dropping it? |
| **GAS_VENT** `v` | `TODO` <br> Fan the gas away for one turn, making a tile briefly safe? | **EXPLODE** (hazardous) <br> Obvious enough to read as a warning — teaches the rule the revolver later breaks. | 🔥 **EXPLODE** (hazardous) <br> Spark → explosion. **The aha is realizing the safe tool is the wrong tool.** | `TODO` <br> Plug the vent with sand — the intended safe answer? |
| **LEVER** `/` | **TRIGGER** <br> Throw a lever from across the room, without standing in the trap it arms. | `TODO` <br> Burn a wooden lever away, disabling it permanently? | `TODO` <br> Shoot it — faster than the whip but louder, and it wakes guardians? | `TODO` <br> Weigh a lever down to hold it, instead of toggling it? |
| **SNAKE** `s` | `TODO` <br> Flick a snake one tile — repositioning rather than removing? | **REPEL** <br> Snakes will not enter a lit tile. Fire is a wall you carry. | `TODO` <br> Kill one outright — effective, wasteful, and loud? | **PLACE_WEIGHT** <br> Bury it. Cheap, and costs sand you will want for a plate. |
| **GUARDIAN** `G` | `TODO` <br> Disarm or trip it, trading damage for position? | `TODO` <br> Hold it at bay while it circles — a moving wall? | **STUN 1** <br> Buy exactly one turn. Never a solution alone; always a setup. | `TODO` <br> Blind it for a turn — the free, ammo-less version of a stun? |
| **CRACKED_STONE** `c` | `TODO` <br> Pull a cracked block down onto something below? | `TODO` <br> Thermal shock as a silent, slower alternative to a shot? | **SHATTER** <br> Becomes walkable rubble, from a safe distance. | `TODO` <br> `—` probably; sand does not break stone. |
| **METAL_PLATE** `M` | `TODO` <br> Whip-crack on metal as a noise decoy to pull a guardian? | `TODO` <br> Heat the plate so anything stepping on it is hurt? | **RICOCHET** <br> Bank a shot around a corner to hit what line-of-sight forbids. | `TODO` <br> Sand on metal to deaden it, denying a ricochet the room wants? |
| **BRAZIER** `B` | `TODO` <br> Tip a lit brazier over to start an oil fire remotely? | **IGNITE** <br> The win condition of light puzzles. | `TODO` <br> Shoot a hanging brazier down onto a target below? | `TODO` <br> Snuff a brazier with sand — un-solving a room on purpose? |
| **VINE** `V` | **SWING** <br> Anchor and swing. The traversal half of the whip. | **BURN_THROUGH** <br> Opens a path — but destroys a whip anchor. A real trade. | `TODO` <br> Shoot a vine loose so it dangles into reach? | `TODO` <br> `—` probably. |
| **TREASURE** `$` | **PULL** <br> Snatch the idol without stepping on the floor around it. | `TODO` <br> Reveal hidden treasure that only shows under light? | `TODO` <br> Shoot a treasure free of its mount — and risk damaging it? | `TODO` <br> The other half of the idol swap: sand *replaces* the treasure you take. |
| **SAND_PILE** `n` | `TODO` <br> Scatter a pile across several tiles at once? | `TODO` <br> `—` probably; sand does not burn. | `TODO` <br> Blast a pile apart to clear a plate you sanded by mistake? | **REMOVE_WEIGHT** <br> Scoop it back. Sand is the only reversible resource, which is why it is scarce. |

### Terrain rows

GAP and PIT are *terrain*, not entities, so they are not rows in the
interaction table. Their two filled cells are the tools' **traversal verbs**,
declared in `TOOL_DEFS` rather than in the `(tool, targetKind)` registry. They
are listed here because designers think of them as part of the same grid.

| Target | WHIP | TORCH | REVOLVER | SATCHEL |
| --- | --- | --- | --- | --- |
| **GAP** `:` | **SWING** *(traversal verb)* <br> Cross it. The whip's core traversal. | `—` <br> Nothing to burn over a chasm. | `—` | `—` <br> A gap is too wide for a satchel. |
| **PIT** `X` | `TODO` <br> Climb down and back up — slow but free? | `TODO` <br> Light the pit to see what is at the bottom before committing? | `—` | **FILL** (partial) *(traversal verb)* <br> Partially fill a pit to cross it. |

---

## 3. Coverage summary

These numbers are asserted against the code, not maintained by hand — see the
table-integrity tests in `src/kernel/tools.test.ts`.

| | Count |
| --- | --- |
| Implemented interactions (registry rows) | **20** |
| Designed 🔥 aha interactions | **6** |
| Tool × Tool cells filled | **1 of 12** (excluding the 4 self-pairings) |
| Tool × Environment cells filled | **19 of 56** (14 entity targets × 4 tools) |
| Traversal verbs (terrain, outside the registry) | **2** — whip/GAP, satchel/PIT |

`coverage()` in `src/kernel/tools.ts` reports which of these a given level or
prototype actually exercises. Per `DESIGN-BRIEF.md`, a level that exercises
none of them is a maze, and a maze has failed.

---

## 4. How to mine an empty cell

A cell is worth filling when the answer to all three is yes:

1. **Is it guessable in hindsight but not in foresight?** The player should
   feel *"of course"*, not *"how was I supposed to know"*. WHIP + BOULDER
   passes: pulling is obvious once seen and invisible before.
2. **Does it change what earlier rooms mean?** The best interactions are
   retroactive — they re-open ground the player already walked. If a cell only
   solves the room it appears in, it is a lock, not a discovery.
3. **Does it survive all three pillars?** An interaction that only works
   without pressure (A), or only matters when resources are scarce (C), is not
   part of the shared toolset — it is a pillar-specific mechanic, and it
   belongs in that prototype rather than in this table.

A cell that fails all three should be marked `—` rather than left `TODO`, so
the backlog stays honest about its own size.
