# Answer Reuse

Before running Codex, the app checks whether a similar question has already been answered for the active document source.

The MVP uses lightweight local matching:

- normalized exact match
- fuzzy text matching
- token similarity

Similarity bands:

- exact match: `1.0`
- high similarity: `>= 0.90`
- possible similarity: `>= 0.75`

The app auto-reuses only high-similarity answers. Possible matches are recorded as context, but the app runs a fresh indexed-document search.

Previous answers are not reused when:

- the active document source changed
- the document index changed after the prior answer
- source documents used by the prior answer are now excluded from chat
- the previous confidence was low
- the user chooses **Run fresh search**

Reused answers are clearly marked in the chat UI.
