# 03 · The art that comes and goes

2026-10-17. I wanted one key on my XL that's just the album cover of whatever is playing. The Multimedia and Queue dials want the same picture. Getting it out of Music took more tries than drawing it.

> Why does the same song have art one minute and none the next?

I still don't know. Streamed songs do it. So the plugin asks once when the song changes, and if Music says there's no art, it asks one more time ten seconds later. After that it keeps the plain tile. Asking every second for a picture that isn't coming would be a script a second for nothing.

## It's not a PNG

My notes said Music hands over PNG bytes. For my streamed songs it's a JPEG, about half a megabyte. So the plugin looks at the first bytes of the file to tell which one it got, instead of assuming.

## Half a megabyte is a lot of text

Printed through `osascript`, the picture comes back as text, two characters per byte:

```
«data JPEGFFD8FFE000104A4649460001…
```

That was 1,050,920 characters. Node only takes 1,048,576 from a command unless you ask for more. Missed it by a whisker.

So the script writes the bytes to a file instead, and `sips` (it comes with the Mac) shrinks the picture to 288 pixels, which is twice the size of a key. What goes to the deck is about 25 KB and still sharp.

How it fits together:

```
song changes → script writes the art to a file → sips shrinks it → key, Multimedia strip
```

## Problems on the way

| What I saw | Why | Fix |
|---|---|---|
| `A command name can't go after this "my"` | my helper was called `save`, and inside `tell application "Music"` that's Music's word | renamed it `keepArt` |
| a test that only failed sometimes | the plugin on my deck and a test copy both named their files `art-1` and deleted each other's | the file name has the process id in it now |
| a faded white tile looked like a gray square | white at a third is gray, not "dim" | only real art is ever faded |

The flaky test was the sneaky one. It passed every time I ran it alone, which is exactly when there was nobody else around to delete its picture.

## The key

The art sits on a rounded tile with a little black around it, the same numbers as my app-icon keys (12 pixels in, corners at 32). Paused, it dims and a small pause sign sits in the corner. With nothing playing it's just a dim note.

What I haven't seen yet is the real deck drawing a photo inside an SVG. The pretend deck page in Chrome does. The deck is next.

## What I learned

Ask for the art once per song, keep it, and don't trust a format until you've read the first bytes.
