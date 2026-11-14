import json, re, sys
sys.path.insert(0, ".")
from backend import main, ask, history
d = json.load(open("/root/sv_default.json"))
ms = d["milestones"]
def key(m): return [f["source_sentence"] for f in m["facts"]]
con = main._open_svt(); cur = con.cursor()
vers = history.rows(cur, history.VERSIONS_SQL, (1256,))
print(len(vers), "versions; last rev ids", [v["rev_id"] for v in vers[-4:]])
idx = {int(v["rev_id"]): i for i, v in enumerate(vers)}
target = 24228934
i = idx[target]
for j in (i-1, i):
    v = vers[j]
    row = history.rows(cur, main.REV_BY_ID_SQL, (1256, int(v["rev_id"])))[0]
    txt = ask.clean_article_text(row["text"])
    print(v["rev_id"], v["user"], str(v["row_start"])[:19], "|", v.get("comment","")[:60])
    for s in key(ms[4]): print("   holds" if s in txt else "   MISSING", s[:90], re.findall(r"\d+", s))
