# /api/ask top-article misses: demo questions [32] [34] [39]

Measured 2026-11-14 on the VPS: bge-m3 query embedding (VPS Ollama), `RETRIEVAL_SQL` from
`backend/ask.py` (chunk_vector top 50, ef_search 80), plus the exact best chunk per article. Read-only.

How ask.py picks `top` (`retrieve_and_resolve`): group the 50 chunks into the first `MAX_SOURCES = 3`
distinct (lang, page_id) sources, then take the first fi source (or fi sibling via wikidata) that has
history. Since dataset M is loaded, every candidate here has history (expected and chosen articles have
86 to 730 versions), so `top` is simply the article of the rank-1 chunk.

## [32] "Upseerien salaliitto Kustaa III:n Venäjän-sodan aikana"
| | article | best chunk rank (of 50) | article rank | cos dist |
|---|---|---|---|---|
| chosen | fi:33312 Kustaa III:n sota | 1 | 1 | 0.4241 |
| expected | fi:33347 Anjalan liitto | 8 | 4 (after Kustaa III, Michael Anckarswärd) | 0.4588 |
Label is correct (the conspiracy is the Anjala League). Cached answer is correct anyway: it names
"Anjalan liitto" and the Liikkala note, cited from the war article. Miss = vectors, not logic.

## [34] "Toisen maailmansodan jälkeinen rauhansopimus, jossa Suomi menetti alueita"
| | article | best chunk rank | article rank | cos dist |
|---|---|---|---|---|
| chosen | fi:51219 Luovutetut alueet | 1 | 1 | 0.3951 |
| expected (en sibling) | en:243885 Paris Peace Treaties, 1947 | 6 | 5 | 0.4380 |
| expected | fi:27916 Pariisin rauhansopimus (1947) | 15 | 10 | 0.4528 |
Label is correct: "rauhansopimus after WWII" = Paris 1947 (Moscow 1944 is a välirauha, an armistice).
The question words "menetti alueita" pull the "ceded territories" article. Cached answer says
"Pariisin rauhansopimus vuodelta 1947" correctly. Miss = vectors.

## [39] "Sodan jälkeinen presidentti, joka loi uuden linjan suhteessa Neuvostoliittoon"
| | article | best chunk rank | article rank (by wikidata) | cos dist |
|---|---|---|---|---|
| chosen | fi:20984 Paasikiven–Kekkosen linja | 1 | 1 | 0.4522 |
| expected (sv sibling) | sv:16649 Juho Kusti Paasikivi | 4 | 3 (after sv Mauno Koivisto) | 0.4671 |
| expected | fi:11446 Juho Kusti Paasikivi | >50 (exact 0.5215) | >10 | 0.5215 |
Label is right but the question is ambiguous ("loi uuden linjan" names the doctrine; "presidentti" asks
for the person). The fi Paasikivi article (30 chunks, long biography) scores far worse than its sv/en
siblings. Worse: the cached answer says **Urho Kekkonen**, which is wrong for the expected reading.

## Organizers' eval (~/wikimemory/eval_chunks_full.md)
Only changed questions are listed. [32] and [34] are not listed, so they hit@5 in both article and chunk
mode but are not hit@1 (chunk hit@1 is 59%, 22/37: these are among the 15 rank>1 cases). [39] is
listed only for hybrid ("rank 5 -> 7, top: Paasikiven–Kekkosen linja"), i.e. article-mode rank 5, and
chunk mode also top-5 not top-1. Same misses, same top article: the demo's top-1 check is stricter
than the organizers' hit@5.

## Root cause
Pure vector ranking: in all three the rank-1 chunk belongs to a broader neighbour article (the war,
the ceded territories, the doctrine). ask.py logic (history preference, sibling hop, top-3 cut) does
not cause any miss: the expected article is never in the 3 sources, and history is present for all.

## Recommendation (smallest first)
1. **Accept / relabel (0 code).** Score the demo check as hit@5 by wikidata (as the organizers do), or
   accept the chosen top: [32] and [34] answers are correct and cite the right fact. Do this now.
2. **Drop [39] from the demo list (or reword to "...Paasikivi..." style)**: label is ambiguous and the
   cached answer (Kekkonen) is wrong for it; it is the only one that would look bad on stage.
3. **Small code change, only if top must match (~15 lines in `retrieve_and_resolve`/after the current
   LLM call):** among the 50 retrieved chunks, if a fi article (or fi sibling) title appears in the
   generated answer text, use it as `top`. Effect: [32] -> Anjalan liitto (chunk rank 8), [34] ->
   Pariisin rauhansopimus (rank 15 / en sibling rank 6); [39] unchanged (answer names Kekkonen).
   Cost: changes `top` for other cached answers, so rebuild answer_cache and recheck the hero question.
   Not recommended before the demo.
4. Not worth it: raising `MAX_SOURCES` (top stays rank-1 article) or hybrid search (eval: hit@1 41%).
