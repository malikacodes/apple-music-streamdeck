# 06 · Music, but keep it behind the door

2026-10-19. The plugin was done, and then I restarted my Mac. Every key on the + said "Open Music", which is right, and the art key on my XL showed nothing, which is also right. The part I hadn't thought about: after a restart, Music is closed until something opens it, and the only key on my XL couldn't.

## What was already there

Any key on the + page opens Music when it's closed. I built that on day one. But the art key on the XL skipped that rule on purpose: its press always sends the + to the Apple Music page, whatever Music is doing. So on the deck I actually sit in front of most, there was no way to wake Music up without reaching for the mouse.

And the keys that could open it did the loud version: Music's window landed on top of whatever I was working in. I don't want to see Music. I want the deck to work.

## The fix

Two small things.

The art key now follows the same rule as everyone else: pressed while Music is closed, it starts Music. Pressed while Music is running, it switches the + like before.

And the launch itself went quiet. macOS's `open` command has two flags I hadn't used before:

```
open -g -j -a Music   # -g: don't bring it to the front, -j: launch it hidden
```

So Music starts, the deck's once-a-second read sees it, the keys come alive, and nothing changes on my screen. That's the whole feature. It's one line and a comment, which is a nice change from the queue.

## Did it work?

The test for it checks that the art key pressed with Music closed opens it with exactly those flags and doesn't switch the + at the same time. On the real deck: restart, press the art key, watch the + keys stop saying "Open Music" while my windows stay put.

## What I learned

Before building a hold gesture for this (I was leaning that way), I looked at what the keys already did. Most of the feature existed. The missing piece was one key opting out of a rule and one command being too loud. Check the rules a key already follows before inventing a new gesture for it.
