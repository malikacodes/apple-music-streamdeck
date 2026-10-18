# 01 · Does Music play inside my playlist?

2026-10-17. Before building anything on a queue dial, I wanted to know if the trick I had in mind works at all.

Music has no "Up Next" I can read from AppleScript. So the plan is a playlist the plugin owns, called `Stream Deck Queue`. Whatever I play from a dial gets written into it, and "what's next" is every track after the current one. That only works if Music keeps playing inside that playlist, and if the playlist can hold songs I don't own in my library (most of mine are streamed).

I made a throwaway playlist called `Stream Deck Test` and tried it with the volume at 15, because it was almost 10 pm.

## Check 1: does `play track 1 of` the playlist make it the current one?

No. Music started the song, but `current playlist` came back as my whole library, not the test playlist. Same for `play track 3 of`. Very polite of it to play the song and ignore which list I meant.

What does work is playing the playlist itself: `play user playlist "Stream Deck Test"`. Then `current playlist` has the same persistent ID as my playlist, and `next track` walks down it in order.

Two more things I found out on the way:

- `name of current playlist` throws a type error when it's one of my playlists, but `persistent ID of current playlist` works. So I compare IDs, not names.
- Music's shuffle has to be off first, or `play` of a playlist starts anywhere. The plugin does its own shuffling anyway.

To jump to track 5, the plugin plays the playlist and then sends `next track` four times. Three in a row with no wait landed on track 4, so it keeps up.

## Check 2: can a streamed song sit in my playlist if it isn't in my library?

Yes. I duplicated 12 tracks from my Pop playlist into the test one. They went in instantly, and a search of my library for the first three found none of them.

## What I learned

Ask Music to play the playlist, never a track inside it.

## What's next

The status poll, so every key reads from one script instead of eight.
