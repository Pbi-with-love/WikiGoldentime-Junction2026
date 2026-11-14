import test from "node:test";
import assert from "node:assert/strict";
import { buildSummaryCardList, describeSummaryCard, mapSummaryCard } from "./summaryMap.js";

function makeTalvisotaFixtures() {
  const fiSummary = {
    article: { lang: "fi", page_id: 1256, title: "Talvisota" },
    sections: [
      { no: 1, heading: "Tausta" },
      { no: 2, heading: "Joukot" },
      { no: 3, heading: "Suomen torjuntavoitot joulu- ja tammikuussa" },
      { no: 4, heading: "Puna-armeijan suurhyökkäys helmikuussa" },
      { no: 5, heading: "Moskovan rauha" },
      { no: 6, heading: "Osapuolten heikkoudet ja vahvuudet" },
      { no: 7, heading: "Talvisodan sotatalous Suomessa" },
      { no: 8, heading: "Osapuolten tappiot" },
      { no: 9, heading: "Alueluovutukset ja väestön uudelleensijoitus" },
      { no: 10, heading: "Ulkomaiden roolit ja apu" },
      { no: 11, heading: "Talvisodan seurauksista ja merkityksestä" },
      { no: 12, heading: "Kunniamerkit" },
      { no: 13, heading: "Talvisota taiteessa ja viihteessä" },
    ],
    ghost_sections: [
      { after_no: 0, from_year: 2005, removed_year: 2006, oldid: 6022332, heading: "Sodan alku" },
      { after_no: 0, from_year: 2005, removed_year: 2006, oldid: 6022332, heading: "Talvisodan tausta" },
      { after_no: 8, from_year: 2005, removed_year: 2006, oldid: 658274, heading: "Talvisodan merkityksestä" },
    ],
  };

  const svSummary = {
    requested: { lang: "fi", page_id: 1256, title: "Talvisota" },
    article: { lang: "sv", page_id: 23612, title: "Vinterkriget" },
    sections: [
      { no: 1, heading: "Bakgrund" },
      { no: 2, heading: "Styrkeförhållanden" },
      { no: 3, heading: "Kriget" },
      { no: 4, heading: "Fredsavtalet" },
      { no: 5, heading: "Övriga offer" },
      { no: 6, heading: "Fosterbarn" },
    ],
    ghost_sections: [],
    fi_history: {
      article: { lang: "fi", page_id: 1256, title: "Talvisota" },
      ghost_sections: fiSummary.ghost_sections,
    },
  };

  const enSummary = {
    requested: { lang: "fi", page_id: 1256, title: "Talvisota" },
    article: { lang: "en", page_id: 33924, title: "Winter War" },
    sections: [
      { no: 1, heading: "Background" },
      { no: 2, heading: "Opposing forces" },
      { no: 3, heading: "Soviet invasion" },
      { no: 4, heading: "Operations from December to January" },
      { no: 5, heading: "Aerial warfare" },
      { no: 6, heading: "Naval warfare" },
      { no: 7, heading: "Soviet breakthrough in February" },
      { no: 8, heading: "Foreign support" },
      { no: 9, heading: "Aftermath and casualties" },
    ],
    ghost_sections: [],
    fi_history: {
      article: { lang: "fi", page_id: 1256, title: "Talvisota" },
      ghost_sections: fiSummary.ghost_sections,
    },
  };

  const compareData = {
    article: { lang: "fi", page_id: 1256, title: "Talvisota" },
    siblings: {
      sv: { page_id: 23612, title: "Vinterkriget" },
      en: { page_id: 33924, title: "Winter War" },
    },
    sections: [
      { no: 1, heading: "Tausta", sv: { match: true, section: "Kriget" }, en: { match: true, section: "Background" } },
      { no: 4, heading: "Puna-armeijan suurhyökkäys helmikuussa", sv: { match: true, section: "Styrkeförhållanden" }, en: { match: true, section: "Soviet breakthrough in February" } },
      { no: 5, heading: "Moskovan rauha", sv: { match: true, section: "Fredsavtalet" }, en: { match: true, section: "Fredsavtalet-en" } },
      { no: 7, heading: "Talvisodan sotatalous Suomessa", sv: { match: false, section: null }, en: { match: false, section: null } },
      { no: 8, heading: "Osapuolten tappiot", sv: { match: true, section: "Övriga offer" }, en: { match: true, section: "Aftermath and casualties" } },
    ],
  };

  return { fiSummary, svSummary, enSummary, compareData };
}

test("031 overview maps to target overview (index 0)", () => {
  const { fiSummary, svSummary, compareData } = makeTalvisotaFixtures();
  const fiItems = buildSummaryCardList(fiSummary);
  const svItems = buildSummaryCardList(svSummary);
  const ref = describeSummaryCard(fiItems[0], fiSummary);
  assert.equal(ref.kind, "overview");
  assert.equal(mapSummaryCard(ref, svItems, svSummary, compareData), 0);
});

test("031 fiHistory maps to target fiHistory if present, else nearest kept section", () => {
  const { fiSummary, svSummary, enSummary, compareData } = makeTalvisotaFixtures();
  const enItems = buildSummaryCardList(enSummary);
  const svItems = buildSummaryCardList(svSummary);
  const fiItems = buildSummaryCardList(fiSummary);

  const enFiHistIdx = enItems.findIndex((it) => it.kind === "fiHistory");
  assert.ok(enFiHistIdx > 0);
  const ref = describeSummaryCard(enItems[enFiHistIdx], enSummary);

  const svMapped = mapSummaryCard(ref, svItems, svSummary, compareData);
  assert.equal(svItems[svMapped].kind, "fiHistory");

  const fiMapped = mapSummaryCard(ref, fiItems, fiSummary, compareData);
  assert.equal(fiItems[fiMapped].kind, "section");
});

test("031 same-article mapping uses section no and ghost after_no + from_year + heading", () => {
  const { fiSummary } = makeTalvisotaFixtures();
  const fiItems = buildSummaryCardList(fiSummary);

  const translatedFiSummary = {
    ...fiSummary,
    out_lang: "sv",
    variant: "translated",
    sections: fiSummary.sections.map((s) => ({
      no: s.no,
      heading: s.no === 5 ? "Freden i Moskva" : s.heading,
    })),
  };
  const translatedItems = buildSummaryCardList(translatedFiSummary);

  const sec5Idx = fiItems.findIndex((it) => it.kind === "section" && it.section.no === 5);
  const secRef = describeSummaryCard(fiItems[sec5Idx], fiSummary);
  const mappedSecIdx = mapSummaryCard(secRef, translatedItems, translatedFiSummary, null);
  assert.equal(translatedItems[mappedSecIdx].kind, "section");
  assert.equal(translatedItems[mappedSecIdx].section.no, 5);

  const ghostIdx = fiItems.findIndex(
    (it) => it.kind === "ghost" && it.ghost.heading === "Talvisodan tausta"
  );
  const ghostRef = describeSummaryCard(fiItems[ghostIdx], fiSummary);
  const mappedGhostIdx = mapSummaryCard(ghostRef, translatedItems, translatedFiSummary, null);
  assert.equal(translatedItems[mappedGhostIdx].kind, "ghost");
  assert.equal(translatedItems[mappedGhostIdx].ghost.heading, "Talvisodan tausta");
});

test("031 fi ghost maps across articles by after_no + from_year + oldid, else nearest kept section", () => {
  const { fiSummary, svSummary, enSummary } = makeTalvisotaFixtures();
  const fiItems = buildSummaryCardList(fiSummary);
  const svItems = buildSummaryCardList(svSummary);
  const enItems = buildSummaryCardList(enSummary);

  // fi -> sv (interleaved -> after fiHistory), distinguishing shared oldid by heading
  const fiGhostIdx = fiItems.findIndex(
    (it) => it.kind === "ghost" && it.ghost.heading === "Talvisodan tausta"
  );
  const fiGhostRef = describeSummaryCard(fiItems[fiGhostIdx], fiSummary);
  const svMapped = mapSummaryCard(fiGhostRef, svItems, svSummary, null);
  assert.equal(svItems[svMapped].kind, "ghost");
  assert.equal(svItems[svMapped].ghost.heading, "Talvisodan tausta");
  assert.equal(svItems[svMapped].ghost.oldid, 6022332);

  // sv -> fi (after fiHistory -> interleaved)
  const svGhostIdx = svItems.findIndex(
    (it) => it.kind === "ghost" && it.ghost.heading === "Talvisodan merkityksestä"
  );
  const svGhostRef = describeSummaryCard(svItems[svGhostIdx], svSummary);
  const fiMapped = mapSummaryCard(svGhostRef, fiItems, fiSummary, null);
  assert.equal(fiItems[fiMapped].kind, "ghost");
  assert.equal(fiItems[fiMapped].ghost.oldid, 658274);

  // Not found in target -> rule 5 using ghost's after_no (never lands on a ghost)
  const enWithoutMatchingGhost = {
    ...enSummary,
    fi_history: {
      article: { lang: "fi", page_id: 1256, title: "Talvisota" },
      ghost_sections: [],
    },
  };
  const enNoGhostItems = buildSummaryCardList(enWithoutMatchingGhost);
  const missingRef = describeSummaryCard(fiItems[fiGhostIdx], fiSummary);
  const fallbackIdx = mapSummaryCard(missingRef, enNoGhostItems, enWithoutMatchingGhost, null);
  assert.equal(enNoGhostItems[fallbackIdx].kind, "section");
  assert.equal(enNoGhostItems[fallbackIdx].section.no, 1);

  // Ghost with after_no=8 out of 13 -> ~round(8/12 * 8) = 5 -> 6th en section
  const fiGhost8Idx = fiItems.findIndex(
    (it) => it.kind === "ghost" && it.ghost.heading === "Talvisodan merkityksestä"
  );
  const ref8 = describeSummaryCard(fiItems[fiGhost8Idx], fiSummary);
  const fallback8Idx = mapSummaryCard(ref8, enNoGhostItems, enWithoutMatchingGhost, null);
  assert.equal(enNoGhostItems[fallback8Idx].kind, "section");
  assert.equal(enNoGhostItems[fallback8Idx].section.no, 6);
  // Check round-trip into enItems finds it cleanly when present
  const foundInEn = mapSummaryCard(ref8, enItems, enSummary, null);
  assert.equal(enItems[foundInEn].kind, "ghost");
});

test("031 en->sv and sv->fi cross-language compare mapping (trim + casefold)", () => {
  const { fiSummary, svSummary, enSummary, compareData } = makeTalvisotaFixtures();
  // Model en section matching Moskovan rauha -> sv Fredsavtalet
  compareData.sections[2].en = { match: true, section: "Peace treaty" };
  enSummary.sections[6] = { no: 7, heading: "  peace treaty  " };
  svSummary.sections[3] = { no: 4, heading: "  Fredsavtalet " };

  const fiItems = buildSummaryCardList(fiSummary);
  const svItems = buildSummaryCardList(svSummary);
  const enItems = buildSummaryCardList(enSummary);

  // en -> sv through compare
  const enSecIdx = enItems.findIndex((it) => it.kind === "section" && it.section.no === 7);
  const enRef = describeSummaryCard(enItems[enSecIdx], enSummary);
  const svIdx = mapSummaryCard(enRef, svItems, svSummary, compareData);
  assert.equal(svItems[svIdx].kind, "section");
  assert.equal(svItems[svIdx].section.no, 4);
  assert.equal(svItems[svIdx].section.heading.trim(), "Fredsavtalet");

  // sv -> fi through compare
  const svRef = describeSummaryCard(svItems[svIdx], svSummary);
  const fiIdx = mapSummaryCard(svRef, fiItems, fiSummary, compareData);
  assert.equal(fiItems[fiIdx].kind, "section");
  assert.equal(fiItems[fiIdx].section.no, 5);
  assert.equal(fiItems[fiIdx].section.heading, "Moskovan rauha");
});

test("031 no match / match:false and null compareData fall back to nearest kept section, never a ghost", () => {
  const { fiSummary, svSummary, compareData } = makeTalvisotaFixtures();
  const fiItems = buildSummaryCardList(fiSummary);
  const svItems = buildSummaryCardList(svSummary);

  // fi section 7 has match: false in both sv and en
  const sec7Idx = fiItems.findIndex((it) => it.kind === "section" && it.section.no === 7);
  const sec7Ref = describeSummaryCard(fiItems[sec7Idx], fiSummary);
  const svIdx = mapSummaryCard(sec7Ref, svItems, svSummary, compareData);
  assert.equal(svItems[svIdx].kind, "section");
  // pos = 6, n_src = 13, n_tgt = 6 -> round(6/12 * 5) = 3 -> 4th sv section (no=4)
  assert.equal(svItems[svIdx].section.no, 4);

  // sv section 1 -> fi with compareData = null (fiItems[1..2] are ghosts! must still pick section no=1)
  const svSec1Idx = svItems.findIndex((it) => it.kind === "section" && it.section.no === 1);
  const svSec1Ref = describeSummaryCard(svItems[svSec1Idx], svSummary);
  const fiFromNull = mapSummaryCard(svSec1Ref, fiItems, fiSummary, null);
  assert.equal(fiItems[fiFromNull].kind, "section");
  assert.equal(fiItems[fiFromNull].section.no, 1);

  // sv section 6 (last) -> fi with compareData = null -> last kept section (no=13)
  const svSec6Idx = svItems.findIndex((it) => it.kind === "section" && it.section.no === 6);
  const svSec6Ref = describeSummaryCard(svItems[svSec6Idx], svSummary);
  const fiLast = mapSummaryCard(svSec6Ref, fiItems, fiSummary, null);
  assert.equal(fiItems[fiLast].kind, "section");
  assert.equal(fiItems[fiLast].section.no, 13);
});

test("031 target with 0 sections falls back to overview", () => {
  const { fiSummary } = makeTalvisotaFixtures();
  const fiItems = buildSummaryCardList(fiSummary);
  const sec5Idx = fiItems.findIndex((it) => it.kind === "section" && it.section.no === 5);
  const sec5Ref = describeSummaryCard(fiItems[sec5Idx], fiSummary);

  const shortSvSummary = {
    requested: { lang: "fi", page_id: 1256, title: "Talvisota" },
    article: { lang: "sv", page_id: 99999, title: "Kort artikel" },
    sections: [],
    ghost_sections: [{ after_no: 0, from_year: 2005, removed_year: 2006, oldid: 1, heading: "X" }],
  };
  const shortItems = buildSummaryCardList(shortSvSummary);
  assert.equal(mapSummaryCard(sec5Ref, shortItems, shortSvSummary, null), 0);
});
