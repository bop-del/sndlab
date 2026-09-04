# Generating basslines and melodies for Goa trance and melodic techno

Research behind ADR 0007. Fifteen-minute read.

## Summary

The word "random" is misleading for both target genres. Goa/psytrance and
melodic techno are **rigid where it matters and vary in small, deliberate
ways** — the rhythmic grid is nearly fixed, the pitch content is mostly the
root, and what makes a line interesting is modulation and slow mutation
rather than note choice. A generator that randomises freely reproduces a
documented failure mode; one that randomises inside these constraints has a
realistic chance of producing lines worth keeping.

The single most useful finding for architecture: **the two genres are the
same algorithm with a different chord source.** Melodic techno anchors each
phrase's boundary notes to a chord that moves underneath it; Goa sets that
chord to the tonic and never changes it. Sections 2 and 3 below establish
this independently, from different sources.

**Evidence quality, stated up front.** This document is weaker than
`electronic-music-scales.md`. There is no academic corpus, no transcription
literature, and no artist interview describing note choice for either genre.
What exists is production tutorials and producer forums. Where independent
sources converge on the same specific number or rule, that convergence is
itself evidence of a real learnable convention — and it is flagged
**[attested]**. Where a claim rests on one blog or one forum poster, it is
flagged **[folklore]**. The two well-documented exceptions, with primary or
near-primary sources, are the TB-303 sequencer model (section 4) and
Euclidean rhythms (section 5).

**The honest gap:** no public MIDI transcriptions or note-by-note analyses of
named Goa tracks were found. Ear-transcribing two bars of a classic would
outperform every source cited here. The generator's constants should be
treated as starting points to tune by ear, not as settled values.

---

## 1. The rhythmic grid: what is fixed

Both genres work on a **16-step bar at 16th-note resolution**, and both
define the bassline by its relationship to the kick. This is the load-bearing
structure — the reason a generator must not randomise rhythm alongside pitch.

**Kick on steps 1, 5, 9, 13** — the quarter-note downbeats. **[attested]**

**The bass is silent on the kick step.** Not a stylistic option; it is the
rule both genres share, stated across every source found for each of them
([Myloops, psytrance rolling
bassline](https://www.myloops.net/how-to-make-a-psytrance-rolling-bassline);
[Attack Magazine, warehouse rolling techno
bass](https://www.attackmagazine.com/technique/tutorials/warehouse-rolling-techno-bass/)).
**[attested]**

Filling the gaps differs by genre:

| | Pattern in each beat's gap |
|---|---|
| **Psytrance rolling bass** | three offbeat 16ths — `K b b b` × 4 |
| **Goa** | looser: offbeat 8ths *or* the rolling 16ths |
| **Melodic techno** | offbeat 8ths (four per bar, on the "and"), or rolling 16ths with velocity tiers |

**Why this matters for a generator.** The fixed grid gives the listener a
reference against which pitch and velocity variation read as intentional
rather than chaotic. Randomising the rhythm layer along with the pitch layer
is the most commonly reported cause of a generator sounding wrong even when
its pitch content is correctly scale-constrained. **[attested]**

### Envelope, for the roll to roll

Psytrance rolling bass, with numbers: MIDI note length 50–75% of a 16th
(50–75 ms at 145 BPM); attack 1–3 ms, sustain 0, decay 60–80 ms, release
20–40 ms. **The note must fully die before the next 16th triggers** — that is
what produces a roll rather than a legato smear or a choppy staccato
([Myloops](https://www.myloops.net/how-to-make-a-psytrance-rolling-bassline)).
**[folklore, but specific and internally consistent]**

Sidechain to the kick is described as surgical — 2–4 dB — unlike house's
audible pump.

Explicitly *prohibited* in psytrance rolling bass: glides, portamento, pitch
bends, fast melodic runs in the low end. "Rhythm dressed as a note, not a
melody." This is the technical marker separating a psytrance bass from a Goa
or full-on one.

---

## 2. Pitch: how little it moves

The consistent surprise across both genres is how static the bass is.

**Psytrance rolling bass is monotone.** Same pitch for all twelve hits, at
the root (F1–A1, roughly 43–55 Hz). Movement is applied sparingly: an octave
drop on one note every 4–8 bars, or a swap to the fifth or minor third for a
two-bar span. The hypnotic effect depends on pitch staying static most of the
time. **[attested]**

**Melodic techno bass is ~70% root**, with the remaining ~30% doing harmonic
work via the fifth, minor third or ♭7. Range is tight — one octave, mostly
root and fifth. A worked 4-bar example in A minor
([Myloops, melodic techno
bassline](https://www.myloops.net/how-to-make-a-melodic-techno-bassline)):

```
bar 1   A A A A
bar 2   A A A A
bar 3   A A E E     ← the fifth, as a lift
bar 4   A A G F     ← stepwise walkdown, pre-announcing the next chord
```

**[attested]** — the 70/30 ratio appears in more than one write-up.

**The bass mostly does not follow the chord roots.** This is the clearest
divergence from generic techno: in melodic techno the chords move above a
bass that stays largely on the tonic. The bass is described as a chord-*transition*
device — the walkdown at the end of a phrase — more than a countermelody.
**[attested]**

**Consequence for the generator:** one bass generator serves both genres
nearly unchanged. The genre difference is a density parameter (offbeat 8ths
vs. rolling 16ths) and a walkdown flag, not different logic.

**Full-on** is the outlier worth naming: same three-in-the-gap principle, but
"plays on various notes across a few octaves" — deliberately melodic bass.
That is the clearest distinguishing feature between full-on and psytrance.
**[folklore]**

### Velocity shaping

Three tiers, consistently described for both genres: strong hits ~110–120 on
the downbeat-adjacent steps, medium ~85–95 on offbeats, ghost fills ~65–75
elsewhere. In melodic techno, downbeat notes are *shortest* (~60% of a
16th cell) and offbeat notes longest (90–100%). **[folklore]**

A named failure: "everything hitting at the same volume becomes flat" — the
single most repeated specific critique found in the Goa sources. Velocity
variation is treated as non-optional.

---

## 3. Melody: two genres, one algorithm

### 3.1 Melodic techno — anchor to the chord

The crux rule, repeated near-verbatim across independent write-ups:

> **Start on a chord tone, land on a chord tone.** The first and last note of
> each phrase must belong to the underlying chord; everything in between is
> free within the scale.

So the *shape* — contour, rhythm, interval pattern — repeats across the
progression while the actual pitches snap to each new chord's tones. This is
neither strict transposition (which ignores the new chord) nor a fixed pedal
figure (which ignores the change entirely). It is re-voicing a fixed contour
([Myloops, melodic techno chords and
melodies](https://www.myloops.net/how-to-create-melodic-techno-chords-and-melodies)).
**[attested]**

That rule is directly implementable as constraint satisfaction: locked scale,
per-chord tone sets, boundary constraints, free interior choice.

Supporting numbers **[folklore, convergent]**:

- **Note values:** 16ths are the default feel. 8ths read as slower and more
  hypnotic; 32nds read as tech-house and too aggressive for the genre.
- **Phrase length:** 2 bars is the recurring unit — write a 2-bar phrase,
  repeat it verbatim, alter only its ending. 4- and 8-bar wrappers contain it.
- **Register:** leads sit roughly two octaves above the harmony bed.
- **Restraint:** 3–4 chord changes per 32-bar section; 4-note motifs. The
  interest comes from timbral evolution, not melodic complexity.
- **No chromatic passing tones.** Stay in the scale of the chords.

### 3.2 Goa — a narrow walk around the root

Goa leads are **stepwise and oscillatory, not arpeggiated**. The dominant
technique named repeatedly is a narrow weighted random walk around a centre
tone: "pick a note around which you bounce up and down semi-randomly on the
scale", with "jumping a lot between the first and second scale degree" named
as a good start ([KVR
t=271696](https://www.kvraudio.com/forum/viewtopic.php?t=271696),
[t=511877](https://www.kvraudio.com/forum/viewtopic.php?t=511877)).
**[attested across several threads]**

A concrete example given in E Phrygian
([KVR t=212265](https://www.kvraudio.com/forum/viewtopic.php?t=212265)):

```
E – D – E – F – E     repeated, with a G thrown in occasionally
```

Interval vocabulary is dominated by minor/major 2nd neighbour motion; leaps
are rare, small, and function as deliberate outlier events (~5–10% of notes)
rather than a phrase norm.

**The ♭2 is the primary colour tone**, not a passing tone — often the
second-most-visited note after the root, sitting a semitone above it. Sources
state the emphasis pattern directly: Goa emphasises the second, third and
seventh degrees, where rock and pop emphasise the fourth and fifth
([outerverse.fm](https://outerverse.fm/blogs/tutorials/understanding-scales-modes-in-psytrance)).
**[attested]**

The augmented second (the Phrygian-dominant ♭2→3 gap) is used opportunistically
for colour, with no documented structural position.

**Grid and gate:** 16th-note steps with a much shorter gate than the bass —
"steady 16th note pattern with 32nd note length and very short decay". Rests
and slides are explicit per-step decisions. **[attested]**

**Repetition:** a short 3–5 note cell repeated many times per phrase, with
movement introduced through velocity and accent rather than new pitches. No
source gives an exact ratio; 70–85% repeated-or-neighbour content is a
reasonable default, flagged as inference.

### 3.3 The unification

| | Goa | Melodic techno |
|---|---|---|
| Pitch source | walk around a fixed root | chord tones at phrase boundaries |
| Harmony | one static pedal | `i–VI–III–VII`, 2–4 bars/chord |
| Motif length | coprime with the bar (5, 7) | 2 bars, bar-aligned |
| Evolution | irregular, non-beat-locked | micro-variation every 4–8 bars |
| Mode | Phrygian; ♭2 central | Aeolian/Dorian; **no Phrygian found** |
| Complexity from | velocity → cutoff | dotted-8th delay |

Goa is melodic techno's algorithm with the progression set to one chord and
the walk narrowed. The divergences sit in parameters — walk width, chord
source, motif length, mutation schedule — not in control flow.

---

## 4. Pattern mutation: the core Goa device

This is the best-attested compositional finding in the research, and the
reason "mutate" is a UI verb in ADR 0007 rather than an implementation detail.

**"Melody without a melody."** Many psytrance leads keep the same pitch
throughout and vary *velocity*, mapped to filter cutoff, resonance or FM
amount — producing perceived melodic motion from timbre alone. Named
explicitly across sources ([KVR
t=271696](https://www.kvraudio.com/forum/viewtopic.php?t=271696)).
**[attested]** Cheap to implement given a filter already exists, and a good
fallback when pitch variation risks sounding wrong.

**Octave displacement over a fixed cell.** A three- or four-note melody
repeated many times while gradually changing register — a line that began in
the bass ending several octaves higher after a few repetitions. **[attested]**

**Metric non-alignment — the strongest specific rule found.** One detailed
poster warns against mechanical regularity and describes deliberately making
the motif length *not* match the bar: "the motive is made not to match exact
number of beats, such that it moves from one part of the beat to another"
([KVR t=212265](https://www.kvraudio.com/forum/viewtopic.php?t=212265)).
A 5- or 7-step motif against a 16-step bar precesses against the beat and
realigns only after several bars. This is a classic minimalist device and it
is directly encodable. **[attested, single detailed source]**

**Mutation timing should be irregular.** Sources explicitly reject fixed
periodicity — "make sure that these trips don't occur too deterministically
(say always at 3rd beat)". No source supports a "change every 4 bars" rule;
Goa is described as gradual evolution rather than change at bar boundaries.
Any periodicity is a design choice, not genre practice. **[attested]**

**Not found:** reversal and rotation of patterns are not documented as Goa
techniques. They are plausible extrapolations from general algorithmic
practice, nothing more.

### Phrase and section structure

Weakly quantified. Arpeggios and simple melodic parts "typically span 2 or 4
bars"; a 16-bar loop recurs as a working unit for motif development. Best
supported default: **4-bar micro-phrase, 16-bar macro-cycle** — with the
caveat above that the melodic cell itself is often deliberately not
bar-aligned. **[folklore]**

Melodic techno's counterpart, from a production source: an 8-bar cycle where
bars 1–2 anchor, 3–4 shift accent placement, 5–6 return home, 7–8 go
staccato as a mini-build.

### Layering

Goa's famous "layered melodies" are not classical counterpoint. Three named
mechanisms **[folklore]**:

1. **Unison-octave doubling** — two lines at different octaves, separated by
   timbre and filtering rather than by pitch content.
2. **Register call-and-response** — a high voice calls, a low voice answers.
   Not simultaneous harmony.
3. **Drone-anchored offset** — a lead layer sitting a fixed interval from the
   bass drone (a minor third is named), giving modal colour rather than
   tertian harmony.

No fixed harmonic interval relationships between simultaneous leads are
documented, which is consistent with the genre being modal rather than
harmonic.

---

## 5. The TB-303 sequencer model

The best-documented section here, from clone manuals and Roland's own
articles rather than forums. It is the recommended data model because it
covers Goa bass, techno bass and acid leads with one structure.

Per-step data splits into two orthogonal layers, entered separately on the
hardware:

**Pitch layer** — `note` (pitch class), `octave` (`-1`, `0`, `+1`),
`accent` (boolean), `slide` (boolean).

**Timing layer** — `note` (new attack), `tie` (sustain the previous note
through this step: no re-trigger, no pitch glide), `rest` (silence).

Pattern length is conventionally 16 steps.

**Accent raises volume *and* filter-envelope depth** — brighter, not merely
louder. This matters for the audio engine, not just the sequencer
([Roland, mastering the TB-303
sequencer](https://articles.roland.com/mastering-the-tb-303-sequencer-in-roland-cloud/);
[Acid Tabs editing guide](https://acid-tabs.com/tb_303_patterns_help.php)).

A generator's minimum per step:

```js
{ gate: 'note' | 'tie' | 'rest', pitch, octave: -1 | 0 | 1, accent, slide }
```

**Known bug source:** slide only has an audible effect when the *following*
step is a `note` rather than a `rest`, and typically only when the prior
note's gate carries into it. This trips up 303-emulation generators
([Gearspace, "303 Sequencer
Mystery"](https://gearspace.com/threads/303-sequencer-mystery.1466814/)).

**The 303 as a Goa lead:** root on beat 1, with an octave jump or passing
note on beat 3 — octave displacement as a structured mid-bar event rather
than random placement. Accents give bounce; slides give a legato singing
character ([psytrance-blueprint](https://psytrance-blueprint.com/tutorials/goa-303-acid-lead/)).
No numeric slide times are documented anywhere found — that is ear territory.

---

## 6. Algorithmic approaches, and what fails

### Approaches with evidence behind them

**Euclidean rhythms** (Toussaint 2005). `E(k,n)` distributes `k` onsets as
evenly as possible across `n` steps via the Euclidean algorithm. `E(3,8)` =
tresillo `x..x..x.`; `E(2,5)` = `x.x..`. Toussaint's claim is that maximal
evenness characterises "good" rhythms across world-music traditions, which is
why Euclidean generation reliably produces non-arbitrary results without
hand-tuning ([Toussaint,
PDF](https://cgm.cs.mcgill.ca/~godfried/publications/Hawaii-Paper-Rhythm-Generation.pdf)).
**[well-documented, primary source]** Good for gate patterns; less needed
here, since both target genres have a fixed grid already.

**Markov chains over scale degrees.** A comparative study found second-order
chains score better than first-order on tonic resolution, interval
smoothness, stepwise motion, motivic repetition and rhythmic variety. The
documented limitation is structural: a Markov process has no memory beyond
order-N, so it cannot enforce global constraints like "return home at bar 8"
([NHSJS](https://nhsjs.com/2026/comparing-first-order-and-second-order-markov-chains-for-algorithmic-melody-generation/)).
**[documented study]**

**Constrained random walk.** Works when interval size is capped and a
return-to-tonic bias is added. Unconstrained walks produce "meandering,
scale-like" output with little aesthetic appeal. This is what Goa melody
generation actually is (section 3.2).

**Arp plus probability mask.** Separate pitch, velocity and trigger-probability
lanes over a fixed or Euclidean grid — reported as effective specifically for
acid and techno lines in commercial and hobbyist generative tools.

**Motif mutation.** Confirmed as real Goa practice, not just theory — see
section 4.

**Genetic and L-system approaches** appear in the generative-music literature
but nothing was found reporting their use for these genres specifically.
Under-attested; treat as unexplored rather than rejected.

### Why unconstrained randomness sounds bad

Four failure modes, converging across sources:

1. **No repetition → nothing memorable.** The fix is a repetition constraint:
   cap identical-note runs, or force periodic motif recurrence.
2. **No contour → "a monkey hitting piano keys."** Uniform random pitch has
   no correlation between consecutive notes; a random walk has correlation but
   no *shape*. The fix is explicit contour shaping — an arc across a phrase.
3. **No rhythmic anchor → the ear cannot lock in.** This is the structural
   reason both genres are rigid about the kick slot.
4. **No resolution to the root, no chord tones on strong beats.** The fix is
   the melodic-techno boundary rule (section 3.1) approached from the other
   direction.

**The practical takeaway:** separate the *what* (pitch — Markov or constrained
walk over scale degrees, capped intervals, contour-biased), the *when*
(rhythm — a fixed genre template), and the *how much* (accent, slide, rest,
per the 303 model). Randomising all three simultaneously is the reliably
reported failure.

### Failure modes producers name for Goa specifically

- **Flat dynamics** — the most repeated critique. Velocity variation is not
  optional.
- **Simple content mistaken for the whole job.** Note content is *meant* to
  be simple; producers who skip the automation and layering get a thin result.
  The substance is in modulation, not pitch complexity.
- **Anthem predictability** — "no supersaw theme", explicitly called out as
  wrong for the genre.
- **Mechanical, beat-locked mutation** — changes that always land on the same
  beat read as deterministic. Misaligning phrase length with the bar is the
  documented fix.
- **Harmonic thinking destabilising the mode** — treating a Phrygian melody
  with major-key chord logic "obliterates" the modal centre.

---

## 7. Harmony and mode, by genre

### Melodic techno

Harmonic rhythm is slow: **2 or 4 bars per chord**, 4-chord loops spanning 8
or 16 bars. Named progressions **[folklore, but `i–VI–III–VII` appears in two
independent write-ups]**:

| Numerals | Rhythm | Example |
|---|---|---|
| `i–VI–III–VII` | 2 bars/chord, 8-bar loop | Am–F–C–G |
| `i–III–VII–VI` | 4 bars/chord, 16-bar loop | Fm–A♭–E♭–D♭ |
| `i–iv–VI–V` | 2 bars/chord | Dm–Gm–B♭–A7sus4 |
| `i–VII–VI–V` | 2 bars/chord, 8-bar loop | descending roots |
| `i–i–VI–VI` | 4 bars/chord, 16-bar loop | near-static |

**Modes:** Aeolian is the default. **Dorian** for a "slightly hopeful" lift —
one source describes raising the 6th during build-ups for brightness without a
key change. **Harmonic minor is lead-only**, for a Middle-Eastern flavour, not
for pads or bass. **No Phrygian usage was documented** — a real divergence
from Goa.

### Goa

**Phrygian** dominates. Secondary colours: **Phrygian dominant**, **harmonic
minor**, **double harmonic / Hijaz-family**. The root is hammered constantly —
"hammer home that root and have everything else circle it indefinitely".
Chromatic notes outside the scale are not documented as a device.

**Nitzhonot** leans toward bolder, more singable, more overtly Middle-Eastern
lines with heavier pitch-bend ornamentation, against Goa's more austere
Phrygian minimalism.

This corroborates section 6.4 of `electronic-music-scales.md`, which reached
the same conclusion from different sources: Goa's harmony is a drone plus
modal melody, and Western chord changes work against its character.

---

## 8. Devices worth knowing about

**The dotted-8th delay** is called the standard processing chain for melodic
techno leads, and it is the most encodable device found. Play steady 8ths; the
dotted-8th repeats land in the rhythmic gaps and never align with the kick, so
a simple line reads as denser and syncopated. Companion advice: low-pass the
feedback path from ~4 kHz, sidechain-duck the delay return. A generator can
get most of the genre's lead texture from this rather than by composing a
denser line ([Myloops, why a melodic techno track sounds
empty](https://www.myloops.net/why-a-melodic-techno-track-sounds-empty)).
**[attested, specific mechanism]**

**Portamento in melodic techno:** 50–200 ms glide, recommended on perfect
4th/5th jumps and explicitly avoided on half-step movement ("sounds muddy").
Note this is the opposite of psytrance rolling bass, where glide is prohibited
outright.

**Bass-as-lead (the Bodzin device):** real and named — one monophonic voice
carrying the hook, serving as both bass and lead. Bodzin describes his rig
(Ableton triggering a Moog Sub 37) but no source publishes the compositional
rule behind the line. **The device is attested; the method is not documented.**

**Note-repeat / stutter:** not found documented for this genre specifically.
Probably real in practice; flagged as unconfirmed.

**Arpeggiator settings [mostly general, not genre-specific]:** 16ths as the
rate; gate ~45% for plucky techno arps, 50–75% for melodic techno, 85%+ for
rolling legato; octave span 2–3 for pad-register arps but tight one-octave for
bass. No genre-specific preference for up/down/random was found.

---

## Sources

Ordered roughly by strength.

**Primary or near-primary:**
[Toussaint, "Generating 'Good' Musical Rhythms
Algorithmically"](https://cgm.cs.mcgill.ca/~godfried/publications/Hawaii-Paper-Rhythm-Generation.pdf) ·
[Roland — Mastering the TB-303
sequencer](https://articles.roland.com/mastering-the-tb-303-sequencer-in-roland-cloud/) ·
[Roland — Beyond
Acid](https://articles.roland.com/beyond-acid-pushing-the-tb-303-into-new-sonic-territory/) ·
[Acid Tabs — TB-303 pattern
editing](https://acid-tabs.com/tb_303_patterns_help.php) ·
[NHSJS — First- vs second-order Markov chains for melody
generation](https://nhsjs.com/2026/comparing-first-order-and-second-order-markov-chains-for-algorithmic-melody-generation/) ·
[DJ Mag — Stephan Bodzin on playing
live](https://djmag.com/longreads/stephan-bodzin-how-i-play-live)

**Production tutorials:**
[Myloops — psytrance rolling
bassline](https://www.myloops.net/how-to-make-a-psytrance-rolling-bassline) ·
[Myloops — melodic techno
bassline](https://www.myloops.net/how-to-make-a-melodic-techno-bassline) ·
[Myloops — melodic techno chords and
melodies](https://www.myloops.net/how-to-create-melodic-techno-chords-and-melodies) ·
[Myloops — melodic techno complete
guide](https://www.myloops.net/melodic-techno-production-complete-guide-from-start-to-finish) ·
[Myloops — why a melodic techno track sounds
empty](https://www.myloops.net/why-a-melodic-techno-track-sounds-empty) ·
[Myloops — trance arpeggios](https://www.myloops.net/programming-trance-arpeggios-and-rhythmic-sequences) ·
[Attack Magazine — warehouse rolling techno
bass](https://www.attackmagazine.com/technique/tutorials/warehouse-rolling-techno-bass/) ·
[presetground — melodic techno chord
progressions](https://presetground.com/blogs/news/melodic-techno-chord-progressions) ·
[psytrance-blueprint — Goa 303 acid
lead](https://psytrance-blueprint.com/tutorials/goa-303-acid-lead/) ·
[outerverse.fm — scales and modes in
psytrance](https://outerverse.fm/blogs/tutorials/understanding-scales-modes-in-psytrance) ·
[Production Music Live — lead bass for melodic
techno](https://www.productionmusiclive.com/blogs/news/the-most-important-lead-bass-for-melodic-techno-diva-bodzin-ben-bohmer-lane-8)

**Forums — folklore, but convergent:**
[KVR t=271696 — Trance Goa melodic
patterns](https://www.kvraudio.com/forum/viewtopic.php?t=271696) ·
[KVR t=212265 — Help me with Goa
melodies](https://www.kvraudio.com/forum/viewtopic.php?t=212265) ·
[KVR t=511877 — Goa
melodies?](https://www.kvraudio.com/forum/viewtopic.php?t=511877) ·
[KVR t=390962 — Goa/psytrance and music
theory](https://www.kvraudio.com/forum/viewtopic.php?t=390962) ·
[KVR t=174442 — Goa and psytrance production
tips](https://www.kvraudio.com/forum/viewtopic.php?t=174442) ·
[KVR t=476052 — Goa trance
melody](https://www.kvraudio.com/forum/viewtopic.php?t=476052) ·
[Gearspace — 303 sequencer
mystery](https://gearspace.com/threads/303-sequencer-mystery.1466814/)

**Genre overviews:**
[Melodigging — Goa trance](https://www.melodigging.com/genre/goa-trance) ·
[Wikipedia — Nitzhonot](https://en.wikipedia.org/wiki/Nitzhonot) ·
[Wikipedia — Euclidean rhythm](https://en.wikipedia.org/wiki/Euclidean_rhythm) ·
[jaralucastudio — Goa vs
psytrance](https://jaralucastudio.com/goa-trance-vs-psytrance-whats-the-difference/) ·
[AudioCipher — random melody
generators](https://www.audiocipher.com/post/random-note-generator)
