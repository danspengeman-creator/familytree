# The Spengeman Family Tree

A static, single-page family tree site built from a GEDCOM export and a hand-drawn pedigree chart, reconciled fact by fact. No build step, no backend, no dependencies beyond two Google Fonts.

## Files

- `index.html` &mdash; page structure and the three views (Tree, Directory, Research Notes)
- `styles.css` &mdash; the whole design system
- `data.js` &mdash; the family data itself, 98 people and 23 marriages/families, embedded as a plain JS object
- `app.js` &mdash; renders the tree, the searchable directory, the notes page, and the click-through detail panel

## Hosting on GitHub Pages

1. Create a new repo (something like `family-tree`).
2. Drop these four files in the repo root (or in `/docs` if you prefer that convention, just point Pages at whichever folder you use).
3. In the repo's Settings &rarr; Pages, set the source to the branch and folder these files live in.
4. Your site will be live at `https://danspengeman-creator.github.io/family-tree/` (or whatever you name the repo).
5. Optional: add a card for it on your `danspengeman-creator.github.io` index page like your other projects.

## Updating the data later

Everyone's facts live in `data.js` as one big object keyed by an Ancestry-style ID (e.g. `I252763206391`). Each person has `given`, `birthSurname`, `marriedSurnames`, `birthDate`/`birthPlace`, `deathDate`/`deathPlace`, `father`/`mother` (ids), `spouses` (with marriage info), `children` (ids), and an optional `note` for anything that needed a research call. To add a photo gallery, source citations, or new family members later, this is the only file that needs editing; `app.js` doesn't need to change unless you want new UI behavior.

## What got resolved before this was built

See the "Research Notes" tab on the live site for the full writeup: it covers a duplicate person record that got merged, a few conflicting dates between sources, an anglicized surname, and the handful of facts still marked as open questions.
