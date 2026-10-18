# 02 · The queue is a playlist I keep rewriting

2026-10-17, later that night. Entry 01 proved Music will play inside my own playlist if I play the playlist itself. Tonight I built the Queue dial on top of that, and the question was how to jump to a song further down.

## Skipping ahead doesn't count very well

The obvious way: play the queue, then send `next track` until I'm on the song I picked. Last time three in a row went from track 1 to track 4. Tonight the same three, in one script, went from track 1 to track 3.

So `next track` sometimes swallows one. Fine for a skip key, useless for "jump to song 40". Forty calls, and I'd have to check where it landed after every one.

## Deleting is faster than walking

What works is cutting off the top of the queue:

```applescript
delete (tracks 1 thru 6 of q)   -- everything before the song I picked
play q                          -- the picked song is track 1 now
```

One script, about 0.9 seconds, however far down the song is. `current playlist` stays mine, so the rest still follows. The catch is that the songs before the jump leave the queue, so Previous can't go back past it. I can live with that.

## Filling the queue

Copying a whole playlist in is quick: `duplicate every track of` my 404 song lo-fi playlist took a quarter of a second.

A shuffled queue is the slow one. Music can't copy a list in a new order in one go (I tried, it said it couldn't "set" my playlist to a list), so the songs go in one at a time, about 20 milliseconds each. 404 songs took 8.3 seconds. Nobody is waiting eight seconds after pressing a key, least of all me.

So the plugin copies the first 50 in, starts the music, and fills in the rest behind it in chunks of 80. By the time the first song is a few seconds in, the queue is whole.

I checked it all at volume 15, under ten seconds a go: play, jump to song 5, a shuffled 65 song playlist, then shuffle off again. The dial said "2 of 65" and meant it. 🎉

## Things that broke on the way

- A helper in my script called `save` wouldn't compile. Music thinks `save` is its own command.
- A list called `names` broke too:

  ```
  execution error: Can’t get item 1 of names. (-1728)
  ```

  Same reason. My lists are called `pids` and `titles` now, which is a bit silly, but they work.
- `set mute to true` fails with error 9038 whether Music is playing or not. The Volume dial mutes by going to 0 and remembering where it was.
- If Music's own shuffle gets turned on while my queue plays, Music picks from my list in its own order and the dial would be lying. Now it says "Music's own shuffle is on" instead.

## What I learned

The queue doesn't need Music's help. It needs a playlist I'm allowed to cut the top off.

## What's next

The + profile, and the key on my XL that opens it.
