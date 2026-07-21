# Pillar A — notes

**Caveat first:** nobody has played this — no display on this machine.
Everything below is inference from authoring the rooms plus the replays in
`sim.test.ts` — a design memo, not a playtest.

## Does interaction discovery alone sustain interest?

Partly, and less than I wanted. The flagship pull is genuinely strong, and it
is now *proved* forced rather than merely intended: the test exhausts all 781
push-only states of the Sealed Vault and finds no win, then finds one the
moment the whip is allowed. It is also the only beat of that size: levels 5
and 6 arrange a verb the player already owns, and I felt the drop while
authoring them. With zero pressure, a stuck player's only failure mode is
boredom — and undo cannot fix boredom.

## Best and flattest

**Best:** WHIP+BOULDER (level 4). **Flattest:** SATCHEL+PRESSURE_PLATE. The
brief counts the Raiders reference a virtue — players "arrive already
suspecting". That is exactly the problem: they arrive *knowing*, so it plays as
a tutorial, not a discovery. REVOLVER+ROPE was the surprise second-best: the
payload lands somewhere that matters.

## A finding about the shared toolset

Two of the six seeded ahas cannot exist here. TORCH+OIL_TRAIL
needs the board to advance on turn count; REVOLVER+GAS_VENT needs lethality.
Both are pressure. By TOOL-MATRIX §4's own third test — *does it survive all
three pillars?* — they are Pillar B mechanics sitting in the shared table. The
toolset is less pillar-neutral than the premise assumes.

## Content cost

Roughly 12 of the 20 registry rows are static-compatible. I estimate **10–14
rooms** before this is combinatorics rather than discovery, at ~one real aha
per three rooms. A demo's worth, not a game's — unless the empty cells get mined.

## TODO cells I most wanted

SATCHEL+BOULDER (sand as lubricant) above all: it would make pushing a verb
with depth instead of merely the wrong answer. Then WHIP+CRACKED_STONE and
SATCHEL+TREASURE. One warning: **WHIP+PRESSURE_PLATE must stay empty.** Level 4
works because the whip passes *through* the plate to the boulder behind it.

## Biggest risk

To make rooms lock, I added three Pillar-A-local rules: per-level tool
loadouts, a one-load satchel, and a `+` portcullis. The satchel limit is
scarcity-adjacent. If B and C do not adopt the same three, the pillars are no
longer running identical rules and the three-way comparison quietly stops
meaning anything.
