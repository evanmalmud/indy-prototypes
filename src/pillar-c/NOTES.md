# Pillar C — the honest memo

**Does scarcity make interactions more interesting, or less?** Both, and the
split is clean. Scarcity makes *choosing between known* interactions much more
interesting — one plate with three prices is a better decision than one plate
with one answer, and the measured spread proves the decision has teeth (c3:
54 / 32 / -5 for the same room). But it makes *discovering* interactions worse,
and this is the central risk, so plainly: **a resource you can lose is a
resource you stop experimenting with.** Every tool use here is a small, real,
irreversible payment, and the rational response to "I wonder what the whip does
to that" is to not find out. That directly undermines Evan's goal. Pillar A's
player pokes everything because poking is free.

Three things blunt it, none of them fully:

1. **Failed uses are free.** A tool aimed at nothing, or at an empty pool, is a
   no-op that costs no resource and no turn. Asking the price is never punished;
   only paying is. This is the single most important rule in the sim.
2. **Sand is refundable.** `SATCHEL+SAND_PILE` is the one negative cost in the
   table, so the satchel is the tool players will actually play with. Behaviour
   will be visibly different for sand than for bullets, and that asymmetry is
   the cleanest experiment in this prototype: watch which tool gets tried.
3. **Undo.** Which brings us to —

**Does undo break the economy?** No, and it is load-bearing. Undo restores the
pools exactly (asserted), so experimenting costs nothing but keystrokes and the
scarcity survives only as a *planning* constraint, not an *anxiety* one. The
honest caveat: this means the score is really "best score you found", not "score
you played", and a determined player can brute-force par by undoing. I think
that is correct for a prototype measuring insight rather than execution — but
it does mean par measures the room, not the player.

**Is optimising score fun or anxious?** Anxious while playing, fun after. The
first run of a room is tense in a bad way — you are spending without knowing
what is round the corner, which is guessing, not deciding. The second run is
excellent, because now every purchase is a real comparison. So this pillar is
weak on first contact and strong on replay, which is the exact opposite shape to
Pillar A. c4 is the proof: the 50-point run is *correct*, it is the swap the
room teaches, and it is still six short of what the same tools would have paid.

**Content cost.** Highest of the three, roughly 2× Pillar A. A room needs a
guaranteed escape, three substitutable routes, treasure priced so no route
dominates, and a par — and none of that can be eyeballed. Every number here came
from exhaustively searching the room's state space; two rooms were silently
broken (c4 was a trap, c6's budget was one whip short) and only the search caught
it. **Pillar C is not authorable without that tool**, which is itself a finding.

**Two seeded ahas do not survive.** `TORCH+OIL_TRAIL` needs the board to advance
on turn count (Pillar B's premise). `REVOLVER+GAS_VENT` is a death trap, and this
pillar's whole position is that greed is punished by the ledger and never by a
dart — so it is excluded on principle, not on convenience.

**Biggest risk:** the flagship. `WHIP+BOULDER` is here priced at 8 points, which
converts the best discovery in the project into a line item. A player who has
just realised they can *pull* should be exhilarated; a player who has just
realised pulling costs 8 does arithmetic instead. Scarcity may be structurally
incompatible with the one interaction the project exists to test.
