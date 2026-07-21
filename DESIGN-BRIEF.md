# DESIGN BRIEF

## Theme

1930s pulp archaeology. Booby-trapped tombs cut into rock, rolling boulders,
pressure plates that measure weight to the ounce, floors that collapse when
the room decides they should, torchlight that only reaches so far, snake pits,
gold idols on pedestals, a bullwhip, and a fedora that survives everything.

The tone is *adventure serial*, not horror and not simulation. Traps are
theatrical and legible. The tomb is a machine built by someone clever, and the
player's job is to out-think a dead architect.

Visually: flat programmer art, a warm temple palette (sandstone, ochre,
torchlight, deep shadow), and one-character glyphs. Every level in this repo is
hand-authored ASCII so it can be edited in a text editor.

## Core value

> **EVERY LEVEL SHOULD TEACH OR COMBINE A TOOL INTERACTION.**
> **A level that is just a maze has failed.**

This is the standard every room is graded against. Not "is it hard", not "is it
long" — *what does the player know coming out that they did not know going in?*
A room either introduces an interaction, or forces two known interactions into
contact for the first time. If neither is true, the room is filler and should be
cut, however pretty it is.

`coverage()` in `src/kernel/tools.ts` exists to make this checkable rather than
aspirational: it reports which cells of the interaction table a level actually
exercises. A level that reports zero used interactions is, by this brief's own
definition, a maze.

## What this project is actually testing

The thing worth prototyping is **the aha moment players get from discovering
how tools interact** — not the tools themselves, and not the tomb. Everything
else here is scaffolding around that question.

## Non-negotiables

These hold across all three prototypes:

1. **Turn-based.** Nothing moves unless the player takes a turn. There is no
   timer anywhere in this repo.
2. **Puzzle-first.** No reflex gameplay, no action gameplay, no execution
   challenge, no dexterity check. If a player fails, it must be because they
   thought wrong — never because they pressed late. This applies to Pillar B
   too: an escalating room is still a *deterministic* room.
3. **Deterministic.** Same state plus same intent yields the same next state,
   always. No randomness in outcomes.
4. **Undo everywhere.** Deliberation puzzles require cheap experimentation.
   Punishing an experiment with lost progress teaches caution, and caution is
   the opposite of the discovery this project is trying to measure.
5. **One shared toolset.** See below.

## The shared toolset

All three prototypes use the same four tools, resolved through the same data
table in `src/kernel/tools.ts`:

| Tool | As traversal | As puzzle key |
| --- | --- | --- |
| **Whip** | Swing across a marked gap | Pull objects one tile toward you; trigger levers at range |
| **Torch** | Light the way; snakes will not cross flame | Ignite what burns; burn through what blocks |
| **Revolver** | Shatter cracked stone into walkable rubble | Break one specific thing at range — or spark one you should not |
| **Sand satchel** | Partially fill a pit to cross it | Place and remove weight; substitute onto pressure plates |

Every tool is deliberately **both a traversal verb and a puzzle key**. That
dual role is what makes discovery feel like insight rather than like being
handed a key for a lock: the player already knows the tool, and the aha is
realizing it does something *else*.

The toolset is identical across prototypes on purpose. Three prototypes with
three different toolsets would confound the pillar with the verbs, and any
difference in how they feel would be uninterpretable. Holding the verbs fixed
means the only variable is the pillar.

## The designed "aha" set

Six seeded interactions. These are the discoveries the prototypes exist to
test; each is flagged `aha: true` in the table and asserted in
`src/kernel/tools.test.ts`.

### 1. WHIP + BOULDER = pull *(flagship)*

Block-pushing puzzles are defined by a single constraint: **you can only push,
never pull.** Decades of design rest on it. Every "I've wedged the block in a
corner, time to reset" moment comes from it.

The whip inverts that constraint. The moment a player realizes they can pull,
the rule they had internalized stops being a law of physics and becomes a
*limitation of their old toolkit* — and every room they already walked through
retroactively re-opens. This is the interaction the whole project is built
around. If only one thing in this repo works, it should be this.

### 2. SAND + PRESSURE PLATE = weight substitution

The literal Raiders idol swap. Sand holds the plate down so the player, or the
treasure, can leave it. Immediately readable to anyone who has seen the film,
which makes it the ideal *second* thing to teach: the player arrives already
suspecting it might work.

### 3. TORCH + OIL TRAIL = propagating fire

Fire spreads one tile per turn along the trail. This is the interaction that
turns **time into a puzzle element rather than just a resource**. The player
does not merely light the oil — they must reason about where the fire will be
four turns from now, and get themselves somewhere else by then. It is also the
bridge into Pillar B, since it makes the board change without the room having
to attack anyone.

### 4. REVOLVER + ROPE = sever at range

Cut a rope from across the room and whatever it suspends falls. The aha is a
shift in what the player thinks they are aiming at: the rope is not the target,
the *falling payload* is. Once that clicks, players start reading every
suspended object as a weapon or a bridge.

### 5. WHIP + TORCH = remote ignition

Fling a lit torch across a gap to light a distant brazier. The first tool-on-
tool interaction — the moment the player stops thinking of the toolbar as four
separate buttons and starts thinking of it as a set that combines.

### 6. REVOLVER + GAS VENT = spark → explosion

A trap for careless players. The revolver is elsewhere the *safe* tool: ranged,
precise, no consequences, use it from anywhere. That habit is exactly what
makes this lethal. The aha here is inverted — it is realizing that **the safe
tool is the wrong tool**, and that the toolbar has no universally correct
answer. It should be placed only after the player has grown comfortable
reaching for the revolver by reflex.

## The three pillars

Three prototypes, one toolset, three different answers to "where does the
difficulty live?" Each is a separate page, playable side by side.

### Pillar A — "Clever, not strong"

**Static tomb, perfect information, no pressure.**

Nothing moves unless the player moves it. The whole room is visible from turn
one. There is no failure state that arrives on its own — the player can sit and
stare for an hour, and the tomb will wait.

Difficulty comes purely from *deliberation*: the room is a locked box and the
answer is a sequence. This is the control condition, and the cleanest test of
whether the interactions are interesting on their own merits. If an interaction
is not fun here, no amount of pressure elsewhere will save it.

**Tests:** are the tool interactions intrinsically satisfying to discover?

### Pillar B — "The tomb is alive"

**The room reacts and escalates each turn.**

Floors collapse, water rises, fire spreads, boulders roll. Each turn the player
takes, the board advances one step — and it never advances back. Still fully
turn-based and fully deterministic: the player has unlimited *thinking* time and
zero *acting* time, and the room's next state is always predictable from the
current one.

This is the pillar most at risk of drifting into action gameplay, and it must
not. The pressure is *positional*, not temporal. A player who takes ten minutes
per turn must be able to play it perfectly.

**Tests:** does escalation make discovery feel urgent and thrilling — or does it
just punish experimentation and push players toward memorization?

### Pillar C — "Greed is the real enemy"

**Tool uses cost scarce resources.**

Torch fuel burns down. Bullets run out. Sand is finite and only partly
recoverable. Optional treasure sits off the safe path, and taking it costs
resources the player may need later.

The room is usually solvable cheaply. The *interesting* solution is not. So the
puzzle stops being "what is the answer" and becomes **"what can I afford"** —
and the player's real opponent is their own appetite.

**Tests:** does scarcity deepen the interactions by forcing choices between
them — or does it just make players hoard, avoid experimenting, and never
discover anything?

## Open questions for the prototypes

- Does the flagship whip-pull land as hard in B and C as in A, or does pressure
  and scarcity drown it?
- Is undo enough to keep Pillar B from teaching caution?
- Does Pillar C's scarcity suppress the experimentation that discovery needs?
- Do players in any pillar spontaneously try tool-on-tool combinations, or does
  that only happen once WHIP + TORCH is explicitly taught?
