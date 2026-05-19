# Operator Validation Questionnaire

**Date:** 2026-05-19
**Purpose:** Validate the core product assumption before investing further in features
**Target:** 3-5 EVE Frontier SmartGate operators or aspiring operators

---

## The Assumption Being Tested

> Operators want tenant-scoped trust decisions — not global reputation scores.

If this is wrong, FrontierWarden's architecture, UX, and positioning are all
misaligned. Everything downstream depends on this being true.

### Secondary assumptions (tested in parallel)

- The first valuable use case is gate access and counterparty decisions
- Trust decisions need explainable proof bundles, not black-box scores
- Manual bootstrapping (import/vouch/local trust lists) is acceptable for cold start
- One operator per tenant is the correct initial authority model

---

## Interview Format

**Duration:** 20-30 minutes
**Setting:** Voice call or Discord DM (not a survey form — nuance matters)
**Recording:** Notes only, no recording without consent

### Before the interview

Show the operator the FrontierWarden Node Sentinel dashboard briefly (screenshot
or live demo). Do not explain what it does — let them react first.

### Ground rules for the interviewer

- Ask open-ended questions. Never lead with what FrontierWarden does.
- Listen for what they actually do today, not what they wish existed.
- If they describe a problem FrontierWarden solves, do NOT immediately pitch.
  Ask "how do you handle that now?" first.
- Track exact words they use. Their vocabulary matters more than ours.

---

## Section 1: Current Operations (5 min)

The goal is to understand what they actually do today, unprompted.

**1.1** What do you operate in EVE Frontier? (SmartGate, station, trade post, etc.)

**1.2** When someone approaches your gate, what do you want to know about them
before letting them through?

**1.3** How do you currently decide who gets access and who doesn't?
(Follow up: Is it manual? Automated? Based on what?)

**1.4** Have you ever denied someone access or regretted granting it?
What happened?

**1.5** Do you coordinate access decisions with other operators?
How? (Discord, spreadsheets, word of mouth?)

---

## Section 2: Trust and Risk (5 min)

The goal is to understand how they think about trust — in their own words.

**2.1** If you could know one thing about a pilot before they interact with
your assets, what would it be?

**2.2** How much do you trust another operator's judgment about a pilot?
Would you use their allow/deny list?

**2.3** Have you been scammed, ganked, or had assets stolen in EVE Frontier?
How did you respond? Did it change how you operate?

**2.4** If a tool told you "this pilot has a trust score of 700," would that
be useful? Why or why not?
(Listen carefully — "yes" or "no" matters less than the reasoning.)

**2.5** What would make you distrust a trust tool?

---

## Section 3: Decision Support vs Scoring (5 min)

The goal is to test the core framing hypothesis directly.

**3.1** Imagine two tools:
- **Tool A** gives every pilot a public score from 0-1000 that everyone sees.
- **Tool B** gives you a private dossier on a pilot — their combat history,
  attestations from other operators, and gate passage records — and lets
  you set your own threshold for who gets through.

Which would you prefer? Why?

**3.2** Would you want your gate access policy to be visible to pilots?
Or should it be private?

**3.3** If another operator flags a pilot as hostile, should that automatically
affect your gate? Or should you decide independently?

**3.4** How important is it that you can explain to a pilot WHY they were
denied? (e.g., "your score was below 400" vs "you were flagged by
operator X for gate camping")

---

## Section 4: Cold Start and Bootstrapping (5 min)

The goal is to understand how they'd get started with zero data.

**4.1** If you installed a trust tool today, it would have no history on
any pilot. How would you bootstrap it?

**4.2** Would you manually import a list of trusted/blocked pilots?
Where would that list come from?

**4.3** Would you vouch for specific pilots to seed the system?
How many? Based on what?

**4.4** How long would you wait for a tool to be useful before giving up?
(Days? Weeks? One session?)

---

## Section 5: Product Surface Reaction (5-10 min)

Show the Node Sentinel dashboard. Let them look for 30 seconds. Then:

**5.1** What do you think this is?

**5.2** What's the first thing you'd click?

**5.3** Is there anything on this screen you don't understand?

**5.4** Is there anything missing that you expected to see?

**5.5** If this were free and running on your gate right now, would you
use it? What would need to change for you to pay for it?

---

## Section 6: Willingness to Act (3 min)

The goal is to separate "interesting" from "would actually use."

**6.1** If I gave you access to this tool today, would you connect your
gate to it this week?

**6.2** What would stop you?

**6.3** Who else should I talk to about this?

---

## Scoring Rubric (for the interviewer)

After each interview, score these signals:

| Signal | Strong positive | Weak/neutral | Red flag |
|---|---|---|---|
| Current pain | Describes specific access decision problems | "I just let everyone through" | "I don't operate anything" |
| Trust vocabulary | Uses words like "policy," "threshold," "evidence" | Uses "reputation," "score" | "Just ban them" |
| Tool A vs Tool B | Strongly prefers B (private dossier) | Indifferent | Strongly prefers A (public score) |
| Cold start tolerance | Willing to import lists, vouch, wait 1-2 weeks | Expects magic on day 1 | "If it's not instant I won't use it" |
| Willingness to act | "Yes, this week" | "Maybe, send me a link" | "Interesting, let me think about it" |
| Referral | Names specific people | "I'll ask around" | No referral |

### Kill signals

If 3+ of 5 operators say any of the following, the core assumption is wrong:

- "I just want a number I can sort by"
- "I don't make access decisions — everything is open"
- "I wouldn't trust other operators' data"
- "This is too complicated — I just want a blocklist"

### Pivot signals

If operators consistently describe a different problem than the one we're
solving, document the exact problem and consider whether FrontierWarden's
architecture can serve it.

---

## Recruiting Operators

### Where to find them

- EVE Frontier Discord — SmartGate channels, operator discussions
- In-game — look for active gates with custom policies
- Reddit r/evefrontier — operator strategy threads
- Existing FrontierWarden testnet users (if any)

### Qualifying criteria

- Must operate or plan to operate a SmartGate, station, or trade facility
- Must have made at least one access/trust decision in EVE Frontier
- Bonus: operates multiple gates or coordinates with other operators

### Disqualifying criteria

- Pure combat pilots with no infrastructure operations
- Developers interested in the tech but not the product
- People who have never played EVE Frontier

---

## After the Interviews

### If validated (3+ operators prefer Tool B, describe real access problems)

- Proceed with trust-list bootstrap design
- Build the simplest possible "import trusted pilots" flow
- Get one operator to BINDING VERIFIED on a real gate
- Ship the operator-facing MVP: dossier + gate policy + trust list

### If invalidated (operators want global scores or don't make access decisions)

- Document what they actually want
- Assess whether FrontierWarden's tenant-scoped architecture can pivot
- Consider: is the problem access decisions, or something else entirely?
  (insurance? escrow? fleet coordination?)

### If mixed (split results or unexpected patterns)

- Segment by operator type (gate vs station vs trade)
- Look for a niche where tenant-scoped trust is clearly valued
- Narrow the MVP to serve that niche first
