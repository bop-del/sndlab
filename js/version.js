// The build number shown in the corner of the page.
//
// There is no build step (CLAUDE.md rule 2), so nothing generates this — it is
// bumped by one in every commit that changes shipped code. Its only job is to
// answer "is the tab I am looking at the change I just pushed?", which matters
// because GitHub Pages takes a minute or three to catch up. Counting builds,
// not releases: no minor-or-patch judgement per commit, and it only ever goes
// up, so a lower number on screen than in the repo means stale CDN, full stop.
export const VERSION = 'b34';
