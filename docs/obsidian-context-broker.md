# E5-T01 Obsidian Context Broker Search

The Obsidian Context Broker searches only approved roots.

## Candidate fields

Each candidate includes:

- relative path
- title
- excerpt
- reason
- hash
- metadata
- links
- updated time

## Ranking inputs

- title
- frontmatter metadata
- wiki links
- keywords/headings/tags
- body text
- recency

## Guardrails

- No root means no search.
- Roots must exist and be directories.
- Symlinks or paths that resolve outside approved roots are skipped.
- Candidate verification fails if the real path is outside the approved roots.
