# Plan changes and announcements

**Shuffle announces what changed (#139).** When Shuffle produces no hand-swap
flash and no rotation-changed toast (A3), a visually-hidden polite live region
in `#view-games` reads `"New rotation."` followed by the summary, e.g.
`"New rotation. 12–16 min each · 21 changes"`. The text is written even if it
matches the previous one (by clearing then setting in the next frame, or
alternating so a repeat is still announced). Shuffle that clears hand swaps uses
the existing flash. Shuffle on an underway game uses the existing rotation-changed
toast.

**Issues rebuild only when the text changes (#139).** `renderIssues` compares
the new issues text with the previous one; if equal, the child nodes are left
untouched (same node identity). If the text changes, nodes are rebuilt. This
avoids re-announcing the same constraints to a screen reader on renders that
did not change the plan's legality.
