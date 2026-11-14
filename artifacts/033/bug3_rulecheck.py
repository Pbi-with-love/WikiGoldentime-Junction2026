# Run on VPS. For each stored hero milestone boundary: do new cited-sentence digits exist in the article text just BEFORE the origin edit?
import json, re, sys
sys.path.insert(0, ".")
from backend import main, ask, history
con = main._open_svt(); cur = con.cursor()
vers = history.rows(cur, history.VERSIONS_SQL, (1256,))
idx = {int(v["rev_id"]): i for i, v in enumerate(vers)}
def text_of(rev):
    return ask.clean_article_text(history.rows(cur, main.REV_BY_ID_SQL, (1256, int(rev)))[0]["text"])
for lang in ("en", "fi", "sv"):
    ms = json.load(open(f"/root/{lang}_default.json"))["milestones"]
    print("==", lang)
    for i in range(1, len(ms)):
        prev_key = {f["source_sentence"] for f in ms[i-1]["facts"]}
        cur_key = {f["source_sentence"] for f in ms[i]["facts"]}
        covered = {t for s in prev_key for t in ask.material_tokens(s)}
        new_mat = [s for s in cur_key - prev_key if ask.material_tokens(s) - covered]
        cb = ms[i]["changed_by"]
        if not cb: print(" ", ms[i]["from_year"], "no origin"); continue
        origin = int(cb["rev_id"]); base_rev = vers[idx[origin]-1]["rev_id"]
        base_tokens = ask.material_tokens(text_of(base_rev))
        truly_new = [s for s in new_mat if ask.material_tokens(s) - covered - base_tokens]
        print(" ", ms[i]["from_year"], cb["user"], origin, "| new_material sentences:", len(new_mat), "| with digits absent from article before origin:", len(truly_new))
        for s in truly_new: print("      NEW:", sorted(ask.material_tokens(s) - covered - base_tokens)[:6], s[:80])
