# Vision

**Climbing World Traveler** is a climbing career RPG. You build one climber from the body up: bones and tendons, fingers and hips, nerves and ego, bank balance and habits. Then you live a climbing life with them, one day at a time, across the real crags of the world, and find out how far that particular body and head will go before age, injury, money or fear calls time. Then you build another one.

Related: [01 Pillars, Scope and Roadmap](01-pillars-scope-roadmap.md) · [02 Character Model](02-character-model.md) · [03 Traits](03-traits.md)

---

## The fantasy

Every climber knows the thought experiment: *if I had started at twelve, if I had those fingers, if I did not get scared above a bolt, if I could just live in a van for three years.* This game lets you run the experiment. You choose the trade-offs explicitly. Long fingers and a huge ape index will make you a monster on steep limestone and a liability on Fontainebleau slopers. Nerves of steel cost you points you might have spent on tendons that do not snap. A trust fund buys you Rocklands every winter and costs you the respect of every dirtbag in the campground.

Then you go climbing, and the game shows you what those choices mean, hold by hold. Not in a stats screen, but in the moment where you are pumped out of your mind on a tufa with the clip at full stretch and the preview says *sketchy*.

## One sentence

Build a climber. Live a climbing life. See how far your body, head and heart take you.

## Reference points

| Game | What we borrow | What we do differently |
|---|---|---|
| **Project Zomboid** | Trait points with real teeth; negatives that are genuinely bad; hidden consequences that surface late; a run that ends | Traits are grounded in sports science and climbing culture, not survival horror |
| **Football Manager** | A career told through numbers that feel like people; aging curves; the long arc from prospect to veteran | You are the athlete, not the manager; you feel every number on the wall |
| **Into the Breach** | Perfect information where it matters, hard choices with shown odds, small boards that stay readable | Our odds are deliberately fuzzy until your route reading is good enough to sharpen them |
| **Slay the Spire** | Build synergies that the game names and rewards; the pleasure of a plan coming together | Synergies are additive and never multiplicative, so no build is a trivial win |
| **Dwarf Fortress legends mode** | Emergent stories worth retelling; a world that remembers what you did | Retired climbers become NPCs in later runs |
| **Climbing media and culture** | Real crags, real grades, real ethics debates, real weather windows | No real people as characters |

## Audience

Climbers first. The game should be legible to someone who has never climbed, but every design decision is made for a reader who knows what a kneebar is and has an opinion about chipping. Second audience: simulation and roguelike players who like deep character builds and systems that interact.

## Tone

Grounded and specific. The sport is treated with respect; its culture is treated with affection and a dry sense of humour. Dirtbag poverty, projecting obsession, spray, access politics and the crag-mayor personality are all fair game. Death exists in the mountains and on bold ground and is never glamorised; it is a consequence of choices the player made with the danger label visible.

## What the game is not

- Not a physics game. The climber is a stylised rig, not a ragdoll. Skill expression comes from decisions and builds, with a single modest timing input on dynamic moves.
- Not a licence. Real crags and real route names appear as geography. No real climber, living or dead, appears as a character, rival, mentor or sponsor.
- Not multiplayer and not online. It is an offline-first PWA you can play on a phone in a tent with no signal.
- Not driven by any runtime generative system. All content is authored or procedurally generated from authored data, so it is deterministic, testable and replayable.

## Why this can exist as a solo project

Because the hard part is data, not art. The world is tables: crags, climates, hold mixes, trait effects. Routes are generated from those tables. The climbing engine is one resolution function evaluated many times. A balance harness runs ten thousand careers overnight and tells you which traits are mispriced. That is a tractable shape for one person with a day job and a hangboard.

## Open questions

- Working title. "Climbing World Traveler" is the repository name and a fine placeholder; a shorter title may be wanted before any public page.
- Visual style for the climber rig and walls (flat vector vs textured) is deliberately undecided until P1a is playable in grey boxes.
