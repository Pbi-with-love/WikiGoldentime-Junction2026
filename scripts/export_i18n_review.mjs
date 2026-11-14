// Export every UI label as CSV: key, English, Finnish, Swedish (+ empty review columns).
// Usage: node scripts/export_i18n_review.mjs > docs/i18n-review.csv
import { STRINGS } from "../src/i18n.js";
const flat = (o) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) =>
  typeof v === "object" ? Object.entries(v).map(([f, s]) => [`${k}.${f}`, s]) : [[k, v]]));
const [en, fi, sv] = ["en", "fi", "sv"].map((l) => flat(STRINGS[l]));
const keys = [...new Set([...Object.keys(en), ...Object.keys(fi), ...Object.keys(sv)])];
const q = (s) => `"${String(s ?? "MISSING").replace(/"/g, '""')}"`;
console.log(["key", "English", "Finnish", "Swedish", "Finnish fix", "Swedish fix", "Comment"].map(q).join(","));
for (const k of keys) console.log([k, en[k], fi[k], sv[k], "", "", ""].map(q).join(","));
