# 05 · The Chrome preview is not the deck

2026-10-18. Everything had passed on the pretend deck, so I finally put the keys on my real decks. A few things looked wrong straight away, and one of them only existed on the real hardware.

## Problem 1: the wrong house

The Home key on my + page had the thin house I drew for Mac Vitals a few days ago. Next to Stream Deck's own icons it looked like a sketch. I swapped it for Stream Deck's white house, the rounded one with the door, and rebuilt the page with `npm run profiles`.

My installed page didn't change, because bundled profiles install once. I fixed that one by hand. The file is for next time.

## Problem 2: the Volume dial stuttered

Turned slowly it was fine. Spun fast, the number jumped backwards and the strip flickered.

Two things were fighting:

```
I turn to 46 → the strip says 46 → the once-a-second read lands, Music still says 40
→ the strip says 40 → my next click starts from 40
```

Music takes a moment to catch up with a new volume, and the read was believing Music over me. Now, for a second and a half after a turn, the number I turned to wins. That's the same trick my Audio Dial uses, and I'd already written a wiki page about it. Past me left a note and present me didn't read it. Classic.

The flicker was the other half. Every click redrew every key and dial on the deck, twice, album art and all. Stream Deck only takes about ten pictures a second for the whole plugin, and a fast spin blew straight past that. Now a turn redraws only the dials that show the volume, once, and the regular read does the rest.

## A decision: my plugins look like mine

Looking at the + page next to my other plugins, it was the odd one out. Apple's red, its own font sizes, a heavier "1" on the Repeat key than anything else I own.

So I made it look like me instead of like the app it controls:

- My soft pink, `#f2a7c3`, replaced Apple's red everywhere, down to the plugin icon.
- The Audio Dial's type became the rule: 15 for a name, 22 for a value, 14 for a second line, nothing bolder than 600, and on a key 20. The Volume strip is laid out exactly like the Audio Dial's, so the two sit side by side as a pair.
- Repeat got three little dots along the bottom, so I can see off, all or one without squinting at the arrows.

## Problem 3: square corners

The album art on my XL had square corners. On the pretend deck's page it was rounded, every single time.

The art is a picture inside an SVG, cut to a rounded rectangle with `clip-path`. Chrome draws the clip. Stream Deck just doesn't. So my "proof" was a screenshot of a browser doing something my deck never does.

The fix doesn't ask the deck to clip anything. It draws the picture square, then paints black over the corners:

```
<image ...the album art, square.../>
<path d="the tile's square, with a rounded hole cut out" fill="#000000" fill-rule="evenodd"/>
```

`evenodd` is what makes the inner shape a hole instead of a second black square. The corner is 28 out of 120 now, which I matched by eye against the Mail, Terminal and Obsidian icons sitting next to it.

I checked it in the Stream Deck app's own window this time, not in Chrome. Curved. 🎉

## Later that day: the dial still lurched

Spun fast, the sound still caught up in jumps. I timed it: one volume change is about 190 ms, a status read about 380, and Music answers one script at a time. So the once-a-second read could land in the middle of a spin and make the next change wait. Now the read just sits out a turn and catches up after. Ten changes in a row went from 2.0 s with a worst click of 321 ms to 1.8 s with a worst of 210. Most of the time left is the 190 ms itself, and about 63 ms of that is just osascript starting up.

## What I learned

The Chrome preview isn't the deck. It's a good first look, and then the only proof is the real thing.
