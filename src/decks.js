// Which deck a press on the Now Playing key opens the Apple Music page
// on. Plain functions: they're handed the decks and hand back an answer.
// The same idea as the "Open on" menu in my Mac Vitals plugin.

// The ready-made page for each kind of deck, by Stream Deck's number for
// it. There's only one: 7 is the Stream Deck +, the deck with the dials.
// The XL gets no page of its own, only the art key.
const PAGES = {
  7: { name: "Stream Deck +", profile: "profiles/apple-music-plus" },
};

// The art key lives on my XL, so a key that's never had its settings
// opened sends the + to the page. That's the whole point of the key.
const DEFAULT_KIND = 7;

// The rows for the "Open on" menu: every plugged-in deck that has a
// page. A choice is saved as the kind of deck ("7"), not that deck's
// own id. The kind is what picks the layout, and it's still right after
// I plug the deck into a different port.
export function deckChoices(decks) {
  const kinds = [...new Set(decks.filter((deck) => deck.isConnected && PAGES[deck.type]).map((deck) => deck.type))];
  return kinds.sort().map((kind) => ({ value: String(kind), label: PAGES[kind].name }));
}

// Where a press should open the page: { deck, profile }, or null when
// it can't, because the deck I picked isn't plugged in. Settings arrive
// as text, or not at all, so anything that isn't a kind I know means
// the default, the +. If the key itself sits on a + it opens there.
export function whereToOpen(choice, here, decks) {
  const kind = PAGES[choice] ? Number(choice) : DEFAULT_KIND;
  const deck = here?.type === kind ? here : decks.find((each) => each.type === kind && each.isConnected);
  if (!deck) return null;
  return { deck: deck.id, profile: PAGES[kind].profile };
}
