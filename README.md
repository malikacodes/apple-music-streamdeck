# Apple Music on my Stream Deck

Keys and dials for the Music app on my Mac, the way Elgato's Spotify plugin does it for Spotify, plus one key on my XL that shows the album art of whatever is playing and opens the Apple Music page on my Stream Deck + when I press it.

Elgato has its own Apple Music plugin, but it's keys only. I wanted dials, a playlist browser, a queue I can see, and everything drawn the same way as my other plugins: black, white and Apple Music's pink.

## What's in it

| Action | Kind | What it does |
|---|---|---|
| Playback | key | Play/Pause, Previous or Next, picked in its settings |
| Shuffle | key | Music's shuffle, or reshuffles what's left of my queue when the queue is playing |
| Repeat | key | Off, all, one. Three pictures, drawn by the plugin, since Stream Deck only does two |
| Favorite | key | Favorites the song that's playing, or takes it back |
| Play Playlist | key | Plays one playlist or album from the top. Pick it in the settings |
| Add to Playlist | key | Adds the playing song to a playlist, with a pink tick for two seconds |
| Now Playing | key | The album art, dimmed with a pause sign when paused. Press to open the Apple Music page on my + |
| Volume | dial | Turn for volume, push to mute |
| Multimedia | dial | Art, song and artist. Turn for volume (or to skip, a setting), push to play or pause |
| Play Collection | dial | Turn through my playlists (or library albums or artists), push to play |
| Queue | dial | What plays next, with "3 of 42". Push to jump there |
| Saved Search | dial | Songs in my library that match words I saved. Push to play |
| AirPlay | dial | Turn to pick where Music plays, push to play there |

When Music is closed every key says "Open Music", and a press opens it. Nothing in the plugin starts Music on its own.

## Setting it up

```bash
npm install                                        # the Stream Deck SDK, the only dependency
streamdeck link com.malikacodes.apple-music.sdPlugin   # puts the plugin into the Stream Deck app
npm run profiles                                   # builds the Apple Music page for my +
streamdeck restart com.malikacodes.apple-music     # picks up any code change
```

Then quit and reopen the Stream Deck app once, so it reads the action list. Drag Now Playing onto my XL. Its first press asks to install the page and leaves the + where it is. The second press switches. That's how Stream Deck installs a plugin's own page, not a bug.

If macOS asks whether Stream Deck may control Music, it needs a yes, or every key stays on its resting picture.

## How it works

One AppleScript a second reads everything (state, song, volume, shuffle, repeat, favorite, which playlist), and every key and dial draws from that one answer. Eight keys still means one script a second. All of it lives in `src/music.js`, every script goes through `src/run.js` and its three second limit, and the once a second read goes through `src/poll.js`.

The queue is a trick. Music's Up Next can't be read from a script, so the plugin keeps its own playlist called "Stream Deck Queue". Playing from a key or dial writes the songs into it and plays it, and "what's next" is every song after the current one. A jump deletes the songs before the one I picked and plays the playlist again: one script however far down it is. The story is in [journal 02](journal/02-the-queue-trick.md).

Album art is fetched once per song, written to a file and shrunk with `sips`, because printed as text it's bigger than Node takes from a command. [Journal 03](journal/03-the-art-that-comes-and-goes.md) has that one.

## Tests

```bash
npm run check   # every file parses
npm test        # 71 tests
```

The tests never run `osascript`. The only fake is Music itself, behind `run.js`; the real `index.js` runs against a pretend Stream Deck SDK.

## Known limits

- Music's `mute` can't be set from a script (error 9038), so mute is the plugin turning the volume to 0 and remembering where it was.
- A jump drops the songs before it from the queue, so Previous can't go back past a jump.
- The queue's order is only remembered while the plugin runs. After a restart the Queue dial still works, but the Shuffle key falls back to Music's own shuffle until I play something new from the deck.
- Albums, artists and Saved Search only see my library. Streamed songs that only live in playlists aren't there, and the Apple Music catalogue can't be searched from a script.
- Streamed songs sometimes have no art for a while. The key shows a plain tile and asks once more ten seconds later.
- No XL page, no Sleep Timer, no lyrics. On purpose, for now.

## What's next

- See it all on the real deck, especially whether the deck draws a photo inside an SVG.
- Remember the queue's source across restarts, so Play Playlist's pink ring comes back.
- Maybe a crossfade on the art key, if it earns it.
