# Run on the VPS: cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/python artifacts/033/bug3_snap.py
import json, re, sys
sys.path.insert(0, ".")
from backend import main, ask, history
SENTS = {
 "105days": "Talvisota alkoi Neuvostoliiton hyökkäyksellä ilman sodanjulistusta ja päättyi 105 päivää myöhemmin Moskovan rauhansopimukseen.",
 "10pct": "Sota päättyi Moskovan rauhansopimukseen, jossa Suomi luovutti 10 prosenttia maa-alueistaan",
 "sv2026_a": "Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940.",
 "sv2026_b": "Suomi joutui myös vuokraamaan Hangon Neuvostoliitolle tukikohdaksi 30 vuodeksi ja rakentamaan Kantalahden ja Sallan välille rautatien.",
 "sv2009_c": "Sodan seurauksena Suomi menetti Sallan, Karjalan, Suomenlahden ulkosaaret ja Kalastajasaarennon länsiosan.",
}
REVS = [2114325, 1862876, 7690165, 7751713, 24228934, 24273471, 20199251]
con = main._open_svt(); cur = con.cursor()
for rev in REVS:
    rows = history.rows(cur, main.REV_BY_ID_SQL, (1256, rev))
    if not rows: print(rev, "no row"); continue
    r = rows[0]; txt = ask.clean_article_text(r["text"])
    print(rev, r["user"], str(r["row_start"])[:10], {k: (v in txt) for k, v in SENTS.items()})
    m = re.search(r"[^.]*105 päivää[^.]*\.", txt)
    print("   lead 105:", m.group(0).strip()[:200] if m else None)
