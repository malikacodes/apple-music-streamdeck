# 04 · A page for my +, and the press that only installs it

2026-10-17, late. The keys and dials all work on the pretend deck, so tonight they got a home: one page on my Stream Deck + that the art key on my XL opens.

> **Heads up, future me:** the very first press of the art key does NOT switch the +. Stream Deck asks to install the Apple Music page, I say yes, and the + stays exactly where it was. Press it again. That second press is the real one. It's not broken, it's Stream Deck.

## The page

```
 Previous   Play/Pause   Next       Home
 Shuffle    Repeat       Favorite   Play Playlist

 Multimedia   Volume   Play Collection   Queue
```

`npm run profiles` builds it. The script is my Mac Vitals one, cut down to one page and taught about dials the way Pomodoro does it. Home is Stream Deck's own Switch Profile key with the white house and no words, pointed at my + Home page.

That Home page's id only means something on my Mac, so the built file stays out of git and gets made again on any computer with `npm run profiles`. Play Playlist arrives empty and says "Pick a playlist", because my playlists don't belong in a file either.

AirPlay, Add to Playlist and Saved Search ship as actions but aren't on the page. I'll drag them on if I miss them.

## The art key's press

The key reads its "Open on" setting, finds that deck among the ones plugged in, and switches it to the plugin's page. A fresh key with no settings picks the +, since that's the only deck with a page and the key lives on my XL. If the + is unplugged it shows the yellow triangle and does nothing else.

The tests run the real `index.js` with a pretend Stream Deck and a pretend Music: press with the + there switches it, press with the + missing shows the triangle and switches nothing. Very satisfying to watch a fake deck get switched.

## Going back over everything

Before calling it done I read the whole thing against the design, slowly, and found real bugs:

- a key leaving the page halfway through drawing could end the whole plugin
- turning a dial with Music closed opened Music (only a press should)
- playing an empty playlist stopped the old queue from finishing filling
- a song that broke halfway through the status script froze every key on the last song

Each one got fixed and most got a test. The one with the variable called `song` was my favourite: Music owns that word too, so the fix needed a fix.

## What's left for my hands

1. Drag the Now Playing key onto my XL's Home page.
2. Press it, say yes, press it again.
3. Pick a playlist for the Play Playlist key.
4. Quit and reopen Stream Deck once, so the newest actions show up in the list.

## What I learned

A plugin's own page installs on its first switch, not when the plugin is linked. Write that on the key if I have to. (I won't. That's what this entry is for.)
