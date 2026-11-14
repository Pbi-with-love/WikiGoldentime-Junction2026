import re, sys
sys.path.insert(0, ".")
from backend import main, ask, history
con = main._open_svt(); cur = con.cursor()
vers = history.rows(cur, history.VERSIONS_SQL, (1256,))
idx = {int(v["rev_id"]): i for i, v in enumerate(vers)}
def txt(rev):
    row = history.rows(cur, main.REV_BY_ID_SQL, (1256, int(rev)))[0]
    return ask.clean_article_text(row["text"])
def around(t, pat, n=110):
    m = re.search(pat, t); return t[max(0, m.start()-n): m.end()+n] if m else None
for label, rev, pats in [
    ("2009 Peltimikko, rev BEFORE", vers[idx[7690165]-1]["rev_id"], [r"\b105\b"]),
    ("2009 Peltimikko, rev", 7690165, [r"\b105\b"]),
    ("2026 Vire, rev BEFORE", 24227313, [r"315\s?727|315\xa0727|Helsingin asukasluku", r"Kuusamoa", r"\b105\b"]),
    ("2026 Vire, rev", 24228934, [r"315\s?727|315\xa0727|Helsingin asukasluku", r"Kuusamoa"]),
]:
    t = txt(rev); print("==", label, rev, "len", len(t))
    for p in pats: print("  ", p, "->", around(t, p))
