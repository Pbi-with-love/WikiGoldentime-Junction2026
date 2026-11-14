# Spec 021: UI demo fixes (search "also in" chips, 2006 milestone oldid clarity)

Read docs/memory/ARCHITECTURE.md first (incl. the Frontend deploy step). Found by the demo dry run
(docs/memory/research/demo-dryrun.md, screenshots in artifacts/demo-dryrun/).

## Bugs
1. Search result rows: the "also in" language chips are wrong after the first row (fi *Talvisota* shows "en, fi" —
   itself, and sv missing). `/api/search?q=talvisota` returns `also: None` on every row (check the real response
   and src/mock/contract.test.js for the contract: per spec 006 the search rows carry an `also` language map).
   Find whether the API stopped filling `also` (then fix it in backend/main.py search, minimal) or the UI computes it
   wrongly (fix in src/ui.js). The chips must show the OTHER languages that have the same wikidata_id, never itself.
2. Ask milestone cards: the 2006 card shows two oldids (snapshot rev and changed_by rev); the real edit (1862876)
   only appears after clicking. Make the card itself show the changed_by line ("Edited by {user} on {date}" with
   its oldid link) when `changed_by` exists, and keep the snapshot oldid as the secondary link (or drop it from the
   card face and keep it in the expanded view). Follow docs/design/013-i18n.md + 001 rules; existing i18n keys
   (`ask.changedBy`) — add a key only if needed, in fi/sv/en.

## Acceptance
- [ ] Contract test for search `also` passes in mock and `REAL=search` (tunnel); npm test all green.
- [ ] Playwright screenshots: search "talvisota" rows with correct chips (fi Talvisota: sv, en); hero milestone strip
      showing "Edited by Whiskey~fiwiki … 1862876" on the 2006 card without clicking (en + fi UI).
- [ ] `npm run build` and deploy dist to the VPS per ARCHITECTURE; show the new asset hash served by :8002.

## Scope
May edit: src/ui.js, src/i18n.js (+ test) only if a key is needed, src/styles.css, backend/main.py (search route
only, if the API is at fault), backend/test_api.py (search test only), src/mock/* (only if the mock is wrong).
If you change backend/main.py: deploy it and restart the `api` tmux once (another worker on spec 020 may also
restart it: check ~/wikimemory/api.log quiet for 60 s first and say when). Must not touch backend/summary.py,
backend/ask.py, backend/compare.py, docs/, organizers' app/tm, container 3308. Never edit docs/memory/*.

## Evidence (worker_done)
Root cause of bug 1 (API or UI) with the curl before/after, files changed, npm test counts, screenshots, deployed hash.
