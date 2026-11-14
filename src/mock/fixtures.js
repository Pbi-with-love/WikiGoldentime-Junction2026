// Rich hand-written fixtures for the 3 rehearsable demo paths + SVT diff & timeline generators.
// All mock prose is explicitly prefixed with "[mock]" so it is never mistaken for live Wikipedia text.

export const ANNUAL_VERSIONS_CALIBRATION = {
  2003: 16,
  2004: 435,
  2005: 1757,
  2006: 2729,
  2007: 2840,
  2008: 2487,
  2009: 1772,
  2010: 1430,
  2011: 1403,
  2012: 1005,
  2013: 742,
  2014: 865,
  2015: 884,
  2016: 745,
  2017: 863,
  2018: 1455,
  2019: 1210,
  2020: 1683,
  2021: 1393,
  2022: 1263,
  2023: 1667,
  2024: 1318,
  2025: 1281,
  2026: 605, // to 1 Oct (10 months)
};

// Monthly weight template (12 months) that sums to 1.0
const MONTH_WEIGHTS_12 = [0.09, 0.085, 0.095, 0.08, 0.075, 0.065, 0.065, 0.075, 0.085, 0.095, 0.10, 0.09];
const MONTH_WEIGHTS_10 = [0.11, 0.10, 0.11, 0.10, 0.09, 0.08, 0.08, 0.10, 0.11, 0.12];

let cachedGlobalTimeline = null;

export function buildGlobalTimeline() {
  if (cachedGlobalTimeline) return cachedGlobalTimeline;
  const months = [];

  for (let year = 2003; year <= 2026; year++) {
    const yearTotal = ANNUAL_VERSIONS_CALIBRATION[year] || 0;
    const maxMonth = year === 2026 ? 10 : 12;
    const weights = year === 2026 ? MONTH_WEIGHTS_10 : MONTH_WEIGHTS_12;

    let allocated = 0;
    for (let m = 1; m <= maxMonth; m++) {
      const isLast = m === maxMonth;
      const edits = isLast
        ? Math.max(0, yearTotal - allocated)
        : Math.round(yearTotal * weights[m - 1]);
      allocated += edits;

      const reverts = Math.round(edits * 0.14);
      const isWarPeak =
        (year >= 2006 && year <= 2008 && (m === 2 || m === 3 || m === 11)) ||
        (year === 2014 && m === 3) ||
        (year === 2018 && m === 4) ||
        (year === 2022 && m === 3);
      const disputes = isWarPeak ? Math.max(3, Math.round(reverts * 0.36)) : Math.min(2, Math.floor(reverts * 0.2));

      months.push({
        month: `${year}-${String(m).padStart(2, "0")}`,
        edits,
        reverts,
        disputes,
      });
    }
  }

  cachedGlobalTimeline = { months };
  return cachedGlobalTimeline;
}

// Curated thumbnail data-URIs (offline-safe SVG illustrations in Kaamos palette) + Wikimedia Commons file names
function makeSvgThumbDataUri(label, accent = "#D9B872") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 280">
    <rect width="640" height="280" fill="#101C33"/>
    <path d="M0 210 Q160 175 320 195 T640 180 L640 280 L0 280 Z" fill="#1C2E4D"/>
    <path d="M90 220 L185 110 L275 190 L390 85 L520 215" fill="none" stroke="${accent}" stroke-width="2.5" stroke-opacity="0.7"/>
    <circle cx="390" cy="85" r="5" fill="#EEF2F6"/>
    <circle cx="185" cy="110" r="4" fill="${accent}"/>
    <text x="28" y="46" fill="#8A9BB3" font-family="sans-serif" font-size="15">[mock archival plate] ${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ARTICLE_THUMBS = new Map([
  [1256, { thumb_file: "Talvisota_finnish_ski_troops_1940.jpg", thumb_url: makeSvgThumbDataUri("Talvisota 1939–1940", "#EEF2F6") }],
  [52097, { thumb_file: "Moscow_Peace_Treaty_map_1940.svg", thumb_url: makeSvgThumbDataUri("Moskovan rauhansopimus 12.3.1940", "#D9B872") }],
  [1150, { thumb_file: "Finnish_Civil_War_Tampere_1918.jpg", thumb_url: makeSvgThumbDataUri("Suomen sisällissota 1918", "#D43F55") }],
  [440, { thumb_file: "Continuation_War_Sturmgeschutz_1944.jpg", thumb_url: makeSvgThumbDataUri("Jatkosota 1941–1944", "#8FC3B7") }],
  [6021, { thumb_file: "Mannerheim_1940_headquarters.jpg", thumb_url: makeSvgThumbDataUri("C. G. E. Mannerheim", "#EEF2F6") }],
  [1275, { thumb_file: "Urho_Kekkonen_1975_ETYK.jpg", thumb_url: makeSvgThumbDataUri("Urho Kekkonen", "#D9B872") }],
  [218476, { thumb_file: "Karjalan_siirtovaki_evacuation_1940.jpg", thumb_url: makeSvgThumbDataUri("Karjalan siirtoväki 1940", "#8FC3B7") }],
]);

// Demo Path B: Talvisota (1256) and Moskovan rauhansopimus (52097) version snapshots (asof)
export const ASOF_FIXTURES = {
  1256: [
    {
      fromYear: 2003,
      toYear: 2008,
      title: "Talvisota",
      rev_id: 892341,
      user: "Tbone",
      comment: "Tarkennettu joukkojen vahvuuksia ja Karjalankannaksen torjuntataisteluita",
      row_start: "2006-03-14T18:22:11Z",
      row_end: "2009-01-08T10:04:00Z",
      blocks: [
        ["h", "Talvisota (1939–1940)"],
        ["p", "[mock] Talvisota käytiin Suomen ja Neuvostoliiton välillä 30. marraskuuta 1939 – 13. maaliskuuta 1940. Neuvostoliitto hyökkäsi Suomeen ilman sodanjulistusta Mainilan laukausten jälkeen."],
        ["p", "[mock] Suomen kenttäarmeija torjui puna-armeijan läpimurtoyritykset joulukuussa 1939 Karjalankannaksella ja tuhosi kaksi neuvostodivisioonaa Suomussalmen ja Raatteen tien taisteluissa."],
        ["li", "[mock] Suomalaisia kaatui noin 21 000 miestä ja haavoittui 43 000."],
        ["p", "[mock] Sota päättyi Moskovan rauhaan 13. maaliskuuta 1940, jossa Suomi joutui luovuttamaan Karjalankannaksen ja Viipurin."],
      ],
    },
    {
      fromYear: 2009,
      toYear: 2016,
      title: "Talvisota",
      rev_id: 12094512,
      user: "Peltimikko",
      comment: "Päivitetty tappioluvut arkistolähteiden mukaisiksi ja lisätty ulkovaltojen avun arviointi",
      row_start: "2012-06-19T14:45:03Z",
      row_end: "2017-02-11T08:19:40Z",
      blocks: [
        ["h", "Talvisota (1939–1940)"],
        ["p", "[mock] Talvisota oli 105 päivää kestänyt sota Suomen ja Neuvostoliiton välillä 30. marraskuuta 1939 – 13. maaliskuuta 1940. Hyökkäyksen taustalla olivat Molotov–Ribbentrop-sopimuksen salainen lisäpöytäkirja ja tuloksettomat alueluovutusneuvottelut."],
        ["p", "[mock] Marsalkka C. G. E. Mannerheimin johtama Suomen puolustusvoimat pysäytti hyökkäyksen Mannerheim-linjalle joulukuussa 1939 ja saavutti kaksoisvoiton Suomussalmella ja Raatteen tiellä, mutta helmikuussa 1940 puna-armeijan suurhyökkäys mursi Summan lohkon."],
        ["li", "[mock] Suomalaisten tappiot olivat tutkimusten mukaan 25 904 kaatunutta tai kadonnutta ja 43 557 haavoittunutta."],
        ["p", "[mock] Sota päättyi Moskovan rauhansopimukseen 13. maaliskuuta 1940. Suomi säilytti itsenäisyytensä, mutta menetti noin kymmenesosan maa-alastaan ja 422 000 karjalaista evakuoitiin siirtoväkenä."],
      ],
    },
    {
      fromYear: 2017,
      toYear: 2026,
      title: "Talvisota",
      rev_id: 23981405,
      user: "Risukarhi",
      comment: "Nykyinen konsensusmuotoilu: venäläisten arkistolähteiden tappioarviot ja talvisodan perintö",
      row_start: "2025-08-18T14:12:47Z",
      row_end: null,
      blocks: [
        ["h", "Talvisota (1939–1940)"],
        ["p", "[mock] Talvisota oli 105 päivää kestänyt sota Suomen ja Neuvostoliiton välillä 30. marraskuuta 1939 – 13. maaliskuuta 1940. Konfliktin taustalla olivat Molotov–Ribbentrop-sopimuksen etupiirijako sekä syksyn 1939 neuvottelut Leningradin turvallisuusvyöhykkeestä."],
        ["p", "[mock] Sotamarsalkka C. G. E. Mannerheimin johtama kenttäarmeija torjui puna-armeijan ensihyökkäyksen Mannerheim-linjalla ja saavutti ratkaisevat saarrostusvoitot Suomussalmella ja Raatteen tiellä. Helmikuussa 1940 Luoteisrintaman keskitetty suurhyökkäys pakotti suomalaiset vetäytymään Viipurinlahdelle."],
        ["li", "[mock] Kansallisarkiston tietokannan mukaan Suomelta menehtyi 25 904 sotilasta ja yli 1 000 siviiliä; puna-armeijan kaatuneiden määräksi arvioidaan 126 875–167 976 sotilasta."],
        ["p", "[mock] Sota päättyi Moskovan rauhansopimukseen 13. maaliskuuta 1940. Suomi torjui miehityksen ja säilytti demokraattisen valtiojärjestyksensä, mutta luovutti 11 prosenttia pinta-alastaan ja asutti uudelleen 422 000 karjalaista siirtoväkeä."],
      ],
    },
  ],
  52097: [
    {
      fromYear: 2004,
      toYear: 2009,
      title: "Moskovan rauhansopimus (1940)",
      rev_id: 412098,
      user: "Kahkonen",
      comment: "Perustiedot rauhansopimuksesta ja alueluovutuksista",
      row_start: "2006-05-12T10:15:00Z",
      row_end: "2010-01-01T00:00:00Z",
      blocks: [
        ["h", "Moskovan rauhansopimus (1940)"],
        ["p", "[mock] Moskovan rauha solmittiin 12. maaliskuuta 1940 ja se päätti talvisodan. Suomi luovutti Neuvostoliitolle Karjalankannaksen ja Viipurin sekä vuokrasi Hangon tukikohdaksi."],
        ["p", "[mock] Rauhanehtoja pidettiin Suomessa raskaina, ja luovutetuilta alueilta jouduttiin evakuoimaan koko väestö."],
      ],
    },
    {
      fromYear: 2010,
      toYear: 2017,
      title: "Moskovan rauhansopimus (1940)",
      rev_id: 11845201,
      user: "Peltimikko",
      comment: "Tarkennettu voimaantuloaika, alueluovutusten osuus ja siirtoväen määrä lähteistettynä",
      row_start: "2013-03-13T16:40:22Z",
      row_end: "2018-01-01T00:00:00Z",
      blocks: [
        ["h", "Moskovan rauhansopimus (1940)"],
        ["p", "[mock] Moskovan rauhansopimus allekirjoitettiin 12. maaliskuuta 1940 (tuli voimaan 13.3. klo 11). Suomi menetti noin kymmenesosan pinta-alastaan ja 422 000 karjalaista evakuoitiin siirtoväkenä muualle Suomeen."],
        ["li", "[mock] Luovutettuihin alueisiin kuuluivat Karjalankannas, Laatokan Karjala, Suomenlahden ulkosaaret, osa Sallaa ja Kalastajansaarento."],
        ["p", "[mock] Vuonna 2007–2014 artikkelissa käsiteltiin myös Karjalan palautuskeskustelua ennen osuuden siirtämistä omaan erillisartikkeliinsa."],
      ],
    },
    {
      fromYear: 2018,
      toYear: 2026,
      title: "Moskovan rauhansopimus (1940)",
      rev_id: 22491034,
      user: "Risukarhi",
      comment: "Historiografinen kokonaiskuva välirauhasta ja Moskovan arkistolähteistä",
      row_start: "2025-03-13T11:00:00Z",
      row_end: null,
      blocks: [
        ["h", "Moskovan rauhansopimus (1940)"],
        ["p", "[mock] Moskovan rauhansopimus (12.–13. maaliskuuta 1940) päätti 105 päivää kestäneen talvisodan. Sopimus käynnisti välirauhan ajan (1940–1941), luovutettu Karjala tyhjennettiin kymmenessä päivässä, ja rauhanehtojen ankaruus vaikutti suoraan jatkosodan syttymiseen."],
        ["li", "[mock] Luovutettuihin alueisiin kuuluivat Karjalankannas, Viipuri, Laatokan Karjala, Suomenlahden ulkosaaret sekä Sallan–Kuusamon itäosat; lisäksi Hanko vuokrattiin laivastotukikohdaksi 30 vuodeksi."],
        ["p", "[mock] Yli 422 000 karjalaista eli 12 prosenttia Suomen väestöstä siirtyi pika-asutuslain turvin jäljelle jääneeseen Suomeen."],
      ],
    },
  ],
};

// Word-level diff logic matching SVT history.py / app.py
function diffWords(oldText, newText) {
  const a = oldText.trim().split(/(\s+)/).filter(Boolean);
  const b = newText.trim().split(/(\s+)/).filter(Boolean);
  const n = a.length;
  const m = b.length;

  // LCS matrix
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawOps = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rawOps.push({ t: "eq", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawOps.push({ t: "del", text: a[i] });
      i++;
    } else {
      rawOps.push({ t: "ins", text: b[j] });
      j++;
    }
  }
  while (i < n) rawOps.push({ t: "del", text: a[i++] });
  while (j < m) rawOps.push({ t: "ins", text: b[j++] });

  // Merge adjacent runs of the same op
  const merged = [];
  for (const op of rawOps) {
    const last = merged[merged.length - 1];
    if (last && last.t === op.t) {
      last.text += op.text;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

export function computeBlocksDiff(fromBlocks, toBlocks) {
  const parts = [];
  const maxLen = Math.max(fromBlocks.length, toBlocks.length);
  let sameRun = 0;

  function flushSame() {
    if (sameRun > 0) {
      parts.push({ op: "same", count: sameRun });
      sameRun = 0;
    }
  }

  for (let idx = 0; idx < maxLen; idx++) {
    const fb = fromBlocks[idx];
    const tb = toBlocks[idx];
    if (fb && tb && fb[0] === tb[0] && fb[1] === tb[1]) {
      sameRun++;
    } else if (fb && tb) {
      flushSame();
      parts.push({
        op: "edit",
        words: diffWords(fb[1], tb[1]),
      });
    } else if (fb && !tb) {
      flushSame();
      parts.push({ op: "del", block: fb });
    } else if (!fb && tb) {
      flushSame();
      parts.push({ op: "ins", block: tb });
    }
  }
  flushSame();
  return { parts };
}

// Demo Path A: /api/ask?q=How did the Winter War end (and Vietnamese/Finnish equivalents)
export const WINTER_WAR_END_ASK_FIXTURE = {
  answer:
    "[mock] The Winter War ended on 13 March 1940 with the Moscow Peace Treaty (Moskovan rauhansopimus), signed in Moscow on the evening of 12 March 1940 [1]. Finland preserved its independence and halted Soviet occupation [2], but ceded roughly 11% of its territory—including the Karelian Isthmus, Vyborg, and Ladoga Karelia—and evacuated 422,000 Karelian residents (siirtoväki) into the rest of Finland [3].",
  sources: [
    {
      n: 1,
      lang: "fi",
      page_id: 52097,
      title: "Moskovan rauhansopimus (1940)",
      url: "https://fi.wikipedia.org/wiki/Moskovan_rauhansopimus_(1940)",
    },
    {
      n: 2,
      lang: "fi",
      page_id: 1256,
      title: "Talvisota",
      url: "https://fi.wikipedia.org/wiki/Talvisota",
    },
    {
      n: 3,
      lang: "fi",
      page_id: 218476,
      title: "Siirtoväki",
      url: "https://fi.wikipedia.org/wiki/Siirtov%C3%A4ki",
    },
  ],
  top: { lang: "fi", page_id: 52097 },
  history_available: true,
  milestones: [
    {
      from_year: 2004,
      to_year: 2009,
      answer:
        "[mock] Moskovan rauha solmittiin 12. maaliskuuta 1940 ja se päätti talvisodan. Suomi luovutti Neuvostoliitolle Karjalankannaksen ja Viipurin sekä vuokrasi Hangon tukikohdaksi.",
      rev_id: 412098,
      user: "Kahkonen",
      comment: "Perustiedot rauhansopimuksesta ja alueluovutuksista",
    },
    {
      from_year: 2010,
      to_year: 2017,
      answer:
        "[mock] Moskovan rauhansopimus allekirjoitettiin 12. maaliskuuta 1940 (tuli voimaan 13.3. klo 11). Suomi menetti noin kymmenesosan pinta-alastaan ja 422 000 karjalaista evakuoitiin siirtoväkenä muualle Suomeen.",
      rev_id: 11845201,
      user: "Peltimikko",
      comment: "Tarkennettu voimaantuloaika, alueluovutusten osuus ja siirtoväen määrä lähteistettynä",
    },
    {
      from_year: 2018,
      to_year: 2026,
      answer:
        "[mock] Moskovan rauhansopimus (12.–13. maaliskuuta 1940) päätti 105 päivää kestäneen talvisodan. Sopimus käynnisti välirauhan ajan (1940–1941), luovutettu Karjala tyhjennettiin kymmenessä päivässä, ja rauhanehtojen ankaruus vaikutti suoraan jatkosodan syttymiseen.",
      rev_id: 22491034,
      user: "Risukarhi",
      comment: "Historiografinen kokonaiskuva välirauhasta ja Moskovan arkistolähteistä",
    },
  ],
};

// Demo Path C: 5-hop Memory Threads chain starting at fi/52097 (including ghost threads)
export const CURATED_THREADS_BY_FI_ID = {
  // Talvisota (1256)
  1256: [
    {
      type: "after",
      targetPageId: 52097,
      reason: "Time: 13 March 1940",
      summary: "[mock] The 105-day Winter War ended with the signing of the Moscow Peace Treaty.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "after",
      targetPageId: 194041,
      reason: "Time: 1940–1941",
      summary: "[mock] Followed immediately by the 15-month Interim Peace (Välirauha).",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 218476,
      reason: "Meaning: Karelian evacuees",
      summary: "[mock] Evacuation of 422,000 Karelian residents from ceded border regions.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 52699,
      reason: "Ghost: linked 2007–2014, then removed",
      summary: "[mock] Linked in the aftermath section between 2007 and 2014 before split.",
      first_year: 2007,
      removed_year: 2014,
    },
  ],
  // Hop 0: Moskovan rauhansopimus (1940) -> 194041 (Välirauha), 194042 (Luovutettu Karjala), 218476 (Siirtoväki), 52699 (Ghost: Karjalan palautuskeskustelu)
  52097: [
    {
      type: "after",
      targetPageId: 194041,
      reason: "Time: 1940–1941",
      summary: "[mock] The treaty left a short-lived 15-month Interim Peace (Välirauha 1940–1941).",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 194042,
      reason: "Meaning: ceded territory",
      summary: "[mock] Karelian Isthmus, Vyborg, and Ladoga Karelia ceded under the treaty terms.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 218476,
      reason: "Meaning: 400,000 evacuated",
      summary: "[mock] Over 400,000 Karelian evacuees (siirtoväki) had to leave their homes.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 52699,
      reason: "Ghost: linked 2007–2014, then removed",
      summary: "[mock] Linked in the treaty article from 2007 to 2014, then removed into a separate debate entry.",
      first_year: 2007,
      removed_year: 2014,
    },
  ],
  // Hop 1: Välirauha -> Jatkosota (440)
  194041: [
    {
      type: "after",
      targetPageId: 440,
      reason: "Time: June 1941",
      summary: "[mock] The Interim Peace ended when the Continuation War broke out in June 1941.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "before",
      targetPageId: 1256,
      reason: "Time: 1939–1940",
      summary: "[mock] Preceded directly by the 105-day Winter War campaign.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 218476,
      reason: "Meaning: rapid resettlement",
      summary: "[mock] Emergency resettlement laws enacted during the 1940–1941 peace.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 194067,
      reason: "Ghost: linked 2006–2013, then removed",
      summary: "[mock] Early revisions compared the Hanko lease to the later Porkkala lease.",
      first_year: 2006,
      removed_year: 2013,
    },
  ],
  // Luovutettu Karjala (194042)
  194042: [
    {
      type: "semantic",
      targetPageId: 218476,
      reason: "Meaning: evacuated population",
      summary: "[mock] The entire population of ceded Karelia was evacuated and resettled in Finland.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "after",
      targetPageId: 440,
      reason: "Time: 1941–1944",
      summary: "[mock] Temporarily recaptured during the Continuation War before the 1944 armistice.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "before",
      targetPageId: 52097,
      reason: "Time: March 1940",
      summary: "[mock] Border defined by the 1940 Moscow Peace Treaty.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 52699,
      reason: "Ghost: linked 2007–2014, then removed",
      summary: "[mock] Linked to post-Cold War restitution debates in 2007–2014 revisions.",
      first_year: 2007,
      removed_year: 2014,
    },
  ],
  // Siirtoväki (218476)
  218476: [
    {
      type: "after",
      targetPageId: 440,
      reason: "Time: 1941–1944",
      summary: "[mock] Around 260,000 evacuees returned to Karelia during the Continuation War before the second evacuation in 1944.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 194042,
      reason: "Meaning: lost home municipalities",
      summary: "[mock] Evacuees came from 44 ceded municipalities across Karelia, Salla, and Petsamo.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "after",
      targetPageId: 6816,
      reason: "Time: 1944–1945",
      summary: "[mock] Concurrent evacuation of 168,000 Lapland civilians during the Lapland War.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 52699,
      reason: "Ghost: linked 2007–2014, then removed",
      summary: "[mock] Former see-also link to Karelian restitution debates removed in 2014.",
      first_year: 2007,
      removed_year: 2014,
    },
  ],
  // Hop 2: Jatkosota (440) -> Lapin sota (6816)
  440: [
    {
      type: "after",
      targetPageId: 6816,
      reason: "Time: 1944–1945",
      summary: "[mock] The 1944 Moscow Armistice required Finland to expel German forces in the Lapland War.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 194046,
      reason: "Meaning: decisive battle",
      summary: "[mock] The Battle of Tali-Ihantala in summer 1944 stabilized the Karelian front.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 6021,
      reason: "Meaning: commander-in-chief",
      summary: "[mock] Marshal Mannerheim led the defence forces and became President in August 1944.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 194043,
      reason: "Ghost: linked 2005–2015, then removed",
      summary: "[mock] Lead-section link to the war-responsibility trials removed during structure split.",
      first_year: 2005,
      removed_year: 2015,
    },
  ],
  // Hop 3: Lapin sota (6816) -> YYA-sopimus (9564)
  6816: [
    {
      type: "after",
      targetPageId: 9564,
      reason: "Time: 1948 treaty",
      summary: "[mock] Post-war reconstruction and the 1948 Finno-Soviet Treaty defined Cold War security.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "before",
      targetPageId: 194066,
      reason: "Time: September 1944",
      summary: "[mock] Triggered by Article 2 of the Moscow Armistice signed on 19 September 1944.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 194061,
      reason: "Meaning: post-war burden",
      summary: "[mock] Concurrent war reparations and northern Lapland reconstruction.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 194047,
      reason: "Ghost: linked 2008–2016, then removed",
      summary: "[mock] Linked to President Risto Ryti's resignation during 2008–2016 revisions.",
      first_year: 2008,
      removed_year: 2016,
    },
  ],
  // Hop 4: YYA-sopimus (9564) -> Suomettuminen (5261)
  9564: [
    {
      type: "after",
      targetPageId: 5261,
      reason: "Time: Cold War doctrine",
      summary: "[mock] The 1948 treaty became the legal cornerstone of the Finlandization (Suomettuminen) era.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 11446,
      reason: "Meaning: Paasikivi line",
      summary: "[mock] Negotiated under President Juho Kusti Paasikivi's realist foreign policy.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 1275,
      reason: "Meaning: long presidency",
      summary: "[mock] Extended three times during Urho Kekkonen's presidency (1956–1982).",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 194069,
      reason: "Ghost: linked 2007–2018, then removed",
      summary: "[mock] Direct see-also link to the 1961 Note Crisis removed in 2018.",
      first_year: 2007,
      removed_year: 2018,
    },
  ],
  // Hop 5: Suomettuminen (5261)
  5261: [
    {
      type: "before",
      targetPageId: 1275,
      reason: "Time: 1956–1982",
      summary: "[mock] Closely associated with political practice under President Urho Kekkonen.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "after",
      targetPageId: 194051,
      reason: "Time: parliamentarism",
      summary: "[mock] President Mauno Koivisto shifted constitutional powers back toward parliament.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "semantic",
      targetPageId: 194068,
      reason: "Meaning: Soviet pressure",
      summary: "[mock] The 1958 Night Frost Crisis demonstrated economic and diplomatic leverage.",
      first_year: null,
      removed_year: null,
    },
    {
      type: "ghost",
      targetPageId: 52699,
      reason: "Ghost: linked 2006–2014, then removed",
      summary: "[mock] Connected to post-Cold War Karelian restitution debates until 2014.",
      first_year: 2006,
      removed_year: 2014,
    },
  ],
};

// Talvitie ("Winter Road") fixtures: 3 topics with 12 events each
export const ROAD_FIXTURES = {
  talvisota: {
    topic: {
      title: "Talvisota",
      lang: "fi",
      page_id: 1256,
      category: "Suomalaiset upseerit",
    },
    eras: [
      { from_year: 1809, to_year: 1938, label: "Rajamuodostus ja puolustuslinja" },
      { from_year: 1939, to_year: 1939, label: "Syksyn 1939 kriisi ja sodan alku" },
      { from_year: 1940, to_year: 1940, label: "Torjuntataistelut ja Moskovan rauha" },
      { from_year: 1941, to_year: 1944, label: "Välirauha ja jälkiseuraukset" },
    ],
    events: [
      {
        lang: "fi",
        page_id: 300008,
        wikidata_id: "Q10008",
        title: "Porvoon valtiopäivät 1809",
        url: "https://fi.wikipedia.org/wiki/Porvoon_valtiop%C3%A4iv%C3%A4t_1809",
        event_year: 1809,
        event_label: "29 Mar – 19 Jul 1809",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Keisari Aleksanteri I vahvisti Suomen autonomian ja Karjalan vanhan rajan myöhemmän palautuksen pohjan. Rajalinja Viipurin läänissä muodosti sen maantieteellisen asetelman, josta kiisteltiin vuonna 1939.",
        summary_long: "[mock] Porvoon valtiopäivillä 1809 luotiin Suomen suuriruhtinaskunnan valtio-oikeudellinen asema, ja vuonna 1812 Vanha Suomi eli Viipurin lääni liitettiin takaisin muun Suomen yhteyteen. Tämä Karjalankannaksen rajalinja säilyi Suomen itärajana itsenäistymisen jälkeen aina talvisotaan saakka.",
        thumb_url: makeSvgThumbDataUri("Porvoon valtiopäivät 1809", "#D9B872"),
        thumb_file: "Porvoon_valtiopaivat_1809.jpg",
        has_history: false,
        first_added_year: null,
        changes: null,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 11113, title: "Sortovuodet", reason: "Road: Autonomian aika" },
        ],
      },
      {
        lang: "fi",
        page_id: 8901,
        wikidata_id: "Q504109",
        title: "Tarton rauha",
        url: "https://fi.wikipedia.org/wiki/Tarton_rauha",
        event_year: 1920,
        event_label: "14 Oct 1920",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Tarton rauhansopimus vahvisti itsenäisen Suomen ja Neuvosto-Venäjän välisen rajan Karjalankannaksella sekä Petsamossa. Sopimus määritti talvisotaa edeltäneen kahden vuosikymmenen turvallisuuspolitiikan.",
        summary_long: "[mock] Tarton rauhassa 14. lokakuuta 1920 Suomi ja Neuvosto-Venäjä sopivat virallisesta valtakunnanrajasta, joka kulki Rajajoella vain 32 kilometrin päässä Leningradista. Neuvostoliitto vaati syksyllä 1939 tämän rajan siirtämistä lännemmäksi.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 1150, title: "Suomen sisällissota", reason: "Road: 1918 background" },
        ],
      },
      {
        lang: "fi",
        page_id: 34207,
        wikidata_id: "Q162340",
        title: "Mannerheim-linja",
        url: "https://fi.wikipedia.org/wiki/Mannerheim-linja",
        event_year: 1939,
        event_label: "Oct – Nov 1939",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Karjalankannaksen poikki Suomenlahdelta Laatokkaan rakennettu puolustusasema oli Suomen pääpuolustuslinja. Vapaaehtoiset linnoittajat vahvistivat kenttävarustuksia vielä kesällä ja syksyllä 1939.",
        summary_long: "[mock] Mannerheim-linja oli noin 135 kilometriä pitkä kenttälinnoitteiden, konekiväärikorsujen ja panssariesteiden ketju Karjalankannaksella. Vaikka ulkomainen propaganda kuvasi linjaa Maginot-linjan veroiseksi, se koostui pääosin maa- ja puuvarustuksista sekä muutamasta kymmenestä teräsbetonikorsusta.",
        thumb_url: makeSvgThumbDataUri("Mannerheim-linja 1939", "#EEF2F6"),
        thumb_file: "Mannerheim_line_bunker_1939.jpg",
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [2008],
        branches: [
          { lang: "fi", page_id: 6021, title: "Carl Gustaf Emil Mannerheim", reason: "Defense council" },
        ],
      },
      {
        lang: "fi",
        page_id: 194063,
        wikidata_id: "Q489204",
        title: "Mainilan laukaukset",
        url: "https://fi.wikipedia.org/wiki/Mainilan_laukaukset",
        event_year: 1939,
        event_label: "26 Nov 1939",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Neuvostoliiton lavastama tykistövälikohtaus Mainilan kylässä Rajajoen tuntumassa toimi tekosyynä hyökkäämättömyyssopimuksen irtisanomiselle. Suomi ehdotti puolueetonta rajatutkimusta, johon Moskova ei suostunut.",
        summary_long: "[mock] Marraskuun 26. päivänä 1939 puna-armeijan propagandakoneisto väitti suomalaisen tykistön tulittaneen Mainilan rajakylää. Suomalaiset rajavartiostot havaitsivat ja kirjasivat laukausten tulleen Neuvostoliiton puolelta, ja myöhemmät venäläiset arkistolähteet ovat vahvistaneet provokaation.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 6,
        war_years: [2007, 2014],
        branches: [
          { lang: "fi", page_id: 194049, title: "Väinö Tanner", reason: "Moscow negotiations" },
        ],
      },
      {
        lang: "fi",
        page_id: 1256,
        wikidata_id: "Q134949",
        title: "Talvisota",
        url: "https://fi.wikipedia.org/wiki/Talvisota",
        event_year: 1939,
        event_label: "30 Nov 1939 – 13 Mar 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Puna-armeija hyökkäsi Suomeen ilman sodanjulistusta 30. marraskuuta 1939 ja pommitti Helsinkiä sekä muita kaupunkeja. Sata ja viisi päivää kestänyt puolustustaistelu yhdisti kansakunnan ja torjui maan miehityksen.",
        summary_long: "[mock] Talvisota käytiin Suomen ja Neuvostoliiton välillä 30.11.1939–13.3.1940 osana toisen maailmansodan alkuvaihetta ja Molotov–Ribbentrop-sopimuksen etupiirijakoa. Alivoimainen Suomen kenttäarmeija pysäytti hyökkäyksen Karjalankannaksella, Laatokan Karjalassa, Kainuussa ja Lapissa ankaran pakkastalen keskellä.",
        thumb_url: ARTICLE_THUMBS.get(1256).thumb_url,
        thumb_file: ARTICLE_THUMBS.get(1256).thumb_file,
        has_history: true,
        first_added_year: 2003,
        changes: 9,
        war_years: [2007, 2008, 2014, 2022],
        branches: [
          { lang: "fi", page_id: 194048, title: "Kyösti Kallio", reason: "Wartime president" },
          { lang: "fi", page_id: 194047, title: "Risto Ryti", reason: "Wartime prime minister" },
        ],
      },
      {
        lang: "fi",
        page_id: 6021,
        wikidata_id: "Q152306",
        title: "Carl Gustaf Emil Mannerheim",
        url: "https://fi.wikipedia.org/wiki/Carl_Gustaf_Emil_Mannerheim",
        event_year: 1939,
        event_label: "30 Nov 1939",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Sotamarsalkka Mannerheim nimitettiin puolustusvoimien ylipäälliköksi sodan ensimmäisenä päivänä. Hänen johtamansa Päämaja sijoitettiin Mikkeliin johtamaan rintamien torjuntataisteluja.",
        summary_long: "[mock] Ylipäällikkö C. G. E. Mannerheim johti Suomen puolustusvoimia Mikkelin päämajasta käsin koko talvisodan ajan. Hänen päiväkäskynsä ja kansainväliset yhteytensä vahvistivat kotirintaman kestävyyttä sekä länsimaiden poliittista tukea Suomelle.",
        thumb_url: ARTICLE_THUMBS.get(6021).thumb_url,
        thumb_file: ARTICLE_THUMBS.get(6021).thumb_file,
        has_history: true,
        first_added_year: 2003,
        changes: 7,
        war_years: [2007, 2008],
        branches: [
          { lang: "fi", page_id: 1150, title: "Suomen sisällissota", reason: "Road: 1918 commander" },
        ],
      },
      {
        lang: "fi",
        page_id: 194064,
        wikidata_id: "Q489210",
        title: "Suomussalmen taistelu",
        url: "https://fi.wikipedia.org/wiki/Suomussalmen_taistelu",
        event_year: 1939,
        event_label: "30 Nov 1939 – 8 Jan 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Eversti Hjalmar Siilasvuon johtama 9. divisioona pysäytti puna-armeijan etenemisen Kainuussa, jossa tavoitteena oli katkaista Suomi Oulun korkeudelta. Suomalaiset saartoivat hyökkääjän kirkonkylän alueelle.",
        summary_long: "[mock] Suomussalmen taistelussa suomalaisjoukot estivät puna-armeijan 163. ja 44. divisioonan yrityksen edetä Ouluun ja katkaista Suomen maayhteys Ruotsiin. Liikkuva hiihtojoukkojen mottitaktiikka osoittautui ratkaisevaksi tiettömässä talvimaastossa.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194044, title: "Raatteen tien taistelu", reason: "Encirclement on Raate road" },
        ],
      },
      {
        lang: "fi",
        page_id: 194044,
        wikidata_id: "Q714921",
        title: "Raatteen tien taistelu",
        url: "https://fi.wikipedia.org/wiki/Raatteen_tien_taistelu",
        event_year: 1940,
        event_label: "1 – 7 Jan 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Tammikuun alussa 1940 suomalaiset pilkkoivat Raatteen tielle edenneen neuvostoliittolaisen 44. valiodivisioonan useisiin motteihin. Voitto toi Suomelle runsaan sotasaaliin ja herätti laajaa kansainvälistä huomiota.",
        summary_long: "[mock] Raatteen tien taistelu 1.–7.1.1940 oli talvisodan tunnetuin saarrostusvoitto, jossa kapealle metsätielle pysähtynyt mekanisoitu divisioona katkaistiin hiihtopartioiden ja tiesulkujen avulla. Sotasaaliiksi saatiin kymmeniä panssarivaunuja, kenttätykkejä ja kuorma-autoja.",
        thumb_url: makeSvgThumbDataUri("Raatteen tie tammikuu 1940", "#8FC3B7"),
        thumb_file: "Raate_road_january_1940.jpg",
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 194045,
        wikidata_id: "Q202148",
        title: "Simo Häyhä",
        url: "https://fi.wikipedia.org/wiki/Simo_H%C3%A4yh%C3%A4",
        event_year: 1940,
        event_label: "Dec 1939 – 6 Mar 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Rautjärveläinen tarkka-ampuja Simo Häyhä palveli Kollaan rintamalla Jalkaväkirykmentti 34:ssä ja haavoittui vakavasti sodan loppupäivinä 6. maaliskuuta 1940. Mannerheim ylensi hänet sodan jälkeen suoraan alikersantista vänrikiksi.",
        summary_long: "[mock] Simo Häyhä toimi tarkka-ampujana Laatokan Karjalan Kollaalla avotähtäimisellä pystykorvakiväärillä kovissa pakkasolosuhteissa. Hänestä tuli jo sodan aikana suomalaisen puolustustahdon tunnetuimpia henkilöitä.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 6,
        war_years: [2017],
        branches: [
          { lang: "fi", page_id: 194065, title: "Kollaan taistelu", reason: "Kollaa front" },
        ],
      },
      {
        lang: "fi",
        page_id: 194065,
        wikidata_id: "Q489216",
        title: "Kollaan taistelu",
        url: "https://fi.wikipedia.org/wiki/Kollaan_taistelu",
        event_year: 1940,
        event_label: "7 Dec 1939 – 13 Mar 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Kollaanjoen puolustuslinja Laatokan Karjalassa kesti puna-armeijan moninkertaisen ylivoiman hyökkäykset sodan loppuun saakka. Sanonta \"Kollaa kestää\" muodostui talvisodan torjuntataistelun tunnuslauseeksi.",
        summary_long: "[mock] Kollaan taistelussa suomalainen 12. divisioona piti asemansa yli kolmen kuukauden ajan huolimatta ankarasta tykistötulesta ja panssarihyökkäyksistä. Rintamalinja murtui osittain vasta sodan viimeisinä päivinä, mutta läpimurto kyettiin pysäyttämään.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2006,
        changes: 3,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 52097,
        wikidata_id: "Q695285",
        title: "Moskovan rauhansopimus (1940)",
        url: "https://fi.wikipedia.org/wiki/Moskovan_rauhansopimus_(1940)",
        event_year: 1940,
        event_label: "12 – 13 Mar 1940",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Moskovassa yöllä 12.–13. maaliskuuta 1940 allekirjoitettu rauhansopimus päätti talvisodan 13.3. kello 11. Suomi säilytti itsenäisyytensä, mutta joutui luovuttamaan Karjalankannaksen, Viipurin ja Laatokan Karjalan.",
        summary_long: "[mock] Moskovan rauhansopimus päätti 105 päivää kestäneen talvisodan raskain alueluovutuksin. Suomi menetti noin kymmenesosan pinta-alastaan, mukaan lukien toiseksi suurimman kaupunkinsa Viipurin, ja vuokrasi Hangon laivastotukikohdaksi Neuvostoliitolle.",
        thumb_url: ARTICLE_THUMBS.get(52097).thumb_url,
        thumb_file: ARTICLE_THUMBS.get(52097).thumb_file,
        has_history: true,
        first_added_year: 2004,
        changes: 3,
        war_years: [2008, 2014, 2022],
        branches: [
          { lang: "fi", page_id: 194042, title: "Luovutettu Karjala", reason: "Ceded territories" },
          { lang: "fi", page_id: 52699, title: "Karjalan palautuskeskustelu", reason: "Post-war debate" },
        ],
      },
      {
        lang: "fi",
        page_id: 218476,
        wikidata_id: "Q3358429",
        title: "Siirtoväki",
        url: "https://fi.wikipedia.org/wiki/Siirtov%C3%A4ki",
        event_year: 1940,
        event_label: "Mar 1940 – 1941",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Luovutetuilta alueilta evakuoitiin kiireellisesti yli 422 000 suomalaista, eli noin 12 prosenttia maan väestöstä. Välirauhan aikana säädetty pika-asutuslaki käynnisti siirtoväen asuttamisen jäljelle jääneeseen Suomeen.",
        summary_long: "[mock] Karjalan, Sallan, Kuusamon ja Hangon siirtoväki joutui jättämään kotiseutunsa vain muutaman päivän varoitusajalla maaliskuussa 1940. Asutustoiminta ja korvauslainsäädäntö muovasivat suomalaista yhteiskuntaa vuosikymmenten ajan.",
        thumb_url: ARTICLE_THUMBS.get(218476).thumb_url,
        thumb_file: ARTICLE_THUMBS.get(218476).thumb_file,
        has_history: true,
        first_added_year: 2006,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194041, title: "Välirauha", reason: "Interim Peace 1940–41" },
          { lang: "fi", page_id: 440, title: "Jatkosota", reason: "Continuation War 1941" },
        ],
      },
    ],
  },

  sisallissota: {
    topic: {
      title: "Suomen sisällissota",
      lang: "fi",
      page_id: 1150,
      category: "Jääkärit",
    },
    eras: [
      { from_year: 1863, to_year: 1906, label: "Sääty-yhteiskunta ja äänioikeusuudistus" },
      { from_year: 1914, to_year: 1917, label: "Jääkäriliike ja itsenäistymisvuosi 1917" },
      { from_year: 1918, to_year: 1918, label: "Sisällissota tammi–toukokuu 1918" },
      { from_year: 1919, to_year: 1920, label: "Tasavaltainen hallitusmuoto ja rauha" },
    ],
    events: [
      {
        lang: "fi",
        page_id: 194058,
        wikidata_id: "Q489173",
        title: "Johan Vilhelm Snellman",
        url: "https://fi.wikipedia.org/wiki/Johan_Vilhelm_Snellman",
        event_year: 1863,
        event_label: "1863 kielireskripti",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] J. V. Snellmanin valtiollinen toiminta ja vuoden 1863 kieliasetus käynnistivät suomenkielisen kansalaisyhteiskunnan ja työväestön poliittisen järjestäytymisen. Säätyvaltiopäivien uudistukset loivat pohjan myöhemmälle joukkopolitiikalle.",
        summary_long: "[mock] Snellmanin kansallisfilosofia ja talousuudistukset 1860-luvulla vauhdittivat Suomen teollistumista ja kansansivistystä. Samalla maaseudun tilattoman väestön ja tehdastyöläisten määrä kasvoi nopeasti 1800-luvun loppua kohti.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2003,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 11113, title: "Sortovuodet", reason: "Road: Autonomian aika" },
        ],
      },
      {
        lang: "fi",
        page_id: 194059,
        wikidata_id: "Q489180",
        title: "Suurlakko 1905",
        url: "https://fi.wikipedia.org/wiki/Suurlakko_1905",
        event_year: 1905,
        event_label: "30 Oct – 6 Nov 1905",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Marraskuun 1905 suurlakko pysäytti yhteiskunnan ja päätti ensimmäisen sortokauden. Lakon aikana perustettiin ensimmäiset punakaartit ja suojartioryhmät, joista tuli vuoden 1918 osapuolten esikuvia.",
        summary_long: "[mock] Suurlakko 1905 osoitti järjestäytyneen joukkoliikkeen voiman, mutta paljasti samalla perustuslaillisten ja sosiaalidemokraattien välisen juovan. Tampereen punainen julistus vaati yksikamarista eduskuntaa ja yleistä äänioikeutta.",
        thumb_url: makeSvgThumbDataUri("Suurlakko marraskuu 1905", "#D9B872"),
        thumb_file: "Suurlakko_1905_Helsinki.jpg",
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 194060,
        wikidata_id: "Q489186",
        title: "Eduskuntauudistus 1906",
        url: "https://fi.wikipedia.org/wiki/Eduskuntauudistus_1906",
        event_year: 1906,
        event_label: "1 Jun 1906",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Säätyvaltiopäivät korvattiin yksikamarisella eduskunnalla, ja suomalaiset naiset saivat ensimmäisinä Euroopassa täydet poliittiset oikeudet. Keisarin hajotusoikeus kuitenkin esti yhteiskunnallisten uudistusten toteutumisen.",
        summary_long: "[mock] Vuoden 1906 eduskuntauudistus kymmenkertaisti äänioikeutettujen määrän kertaheitolla. Toisen sortokauden aikana toistuvat eduskunnan hajotukset kuitenkin kärjistivät sosiaalista jännitettä.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 3,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194050, title: "Miina Sillanpää", reason: "First women MPs 1907" },
        ],
      },
      {
        lang: "fi",
        page_id: 300001,
        wikidata_id: "Q10001",
        title: "Jääkäriliike",
        url: "https://fi.wikipedia.org/wiki/J%C3%A4%C3%A4k%C3%A4riliike",
        event_year: 1915,
        event_label: "1915 – Feb 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Ylioppilasaktivistit hakeutuivat salaa Saksaan sotilaskoulutukseen Lockstedtin leirille irrottaakseen Suomen Venäjän vallasta. Kuninkaallinen Preussin jääkäripataljoona 27 muodosti myöhemmin valkoisen armeijan upseeriston rungon.",
        summary_long: "[mock] Jääkäriliike värväsi vuosina 1915–1917 lähes 1 900 suomalaista vapaaehtoista Saksaan. Jääkärien pääjoukko palasi Vaasaan helmikuussa 1918 keskelle alkanutta sisällissotaa.",
        thumb_url: null,
        thumb_file: null,
        has_history: false,
        first_added_year: null,
        changes: null,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 162670,
        wikidata_id: "Q1364912",
        title: "Suomen itsenäisyysjulistus",
        url: "https://fi.wikipedia.org/wiki/Suomen_itsen%C3%A4isyysjulistus",
        event_year: 1917,
        event_label: "6 Dec 1917",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Svinhufvudin senaatti antoi eduskunnalle itsenäisyysjulistuksen, jonka eduskunta hyväksyi 6. joulukuuta 1917. Valtion ulkoinen suvereniteetti saavutettiin, mutta sisäinen järjestysvalta oli samalla hajonnut.",
        summary_long: "[mock] Venäjän helmikuun ja lokakuun vallankumousten jälkeen Suomen eduskunta julistautui korkeimman vallan haltijaksi ja hyväksyi itsenäisyysjulistuksen 6.12.1917. Elintarvikepula, työttömyys ja aseellisten kaartien kasvu johtivat kuitenkin kriisiin.",
        thumb_url: makeSvgThumbDataUri("Itsenäisyysjulistus 6.12.1917", "#EEF2F6"),
        thumb_file: "Finnish_declaration_of_independence_1917.jpg",
        has_history: true,
        first_added_year: 2006,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 11444, title: "P. E. Svinhufvud", reason: "Independence Senate" },
        ],
      },
      {
        lang: "fi",
        page_id: 194054,
        wikidata_id: "Q489148",
        title: "Punakaarti",
        url: "https://fi.wikipedia.org/wiki/Punakaarti",
        event_year: 1918,
        event_label: "27 Jan 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Työväen järjestyskaartit ja punakaartit ottivat vallan Helsingissä ja eteläisen Suomen teollisuuskeskuksissa tammikuun lopulla 1918. Kansanvaltuuskunta perustettiin johtamaan punaista Suomea.",
        summary_long: "[mock] Punakaartien liikekannallepano alkoi yöllä 27.–28. tammikuuta 1918, jolloin Ali Aaltosen ja myöhemmin Eero Haapalaisen sekä Kullervo Mannerin johtamat joukot hallitsivat Etelä-Suomea.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 6,
        war_years: [2007],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 194055,
        wikidata_id: "Q489154",
        title: "Suojeluskuntajärjestö",
        url: "https://fi.wikipedia.org/wiki/Suojeluskuntaj%C3%A4rjest%C3%B6",
        event_year: 1918,
        event_label: "25 Jan 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Senaatti julisti suojeluskunnat hallituksen virallisiksi joukoiksi 25. tammikuuta 1918, ja Mannerheim aloitti venäläisten varuskuntien riisumisen aseista Pohjanmaalla. Vaasasta muodostui valkoisen Suomen hallintokeskus.",
        summary_long: "[mock] Suojeluskuntajoukot ja asevelvollisista koottu valkoinen armeija järjestäytyivät Pohjanmaan, Savon ja Karjalan rintamille kenraali Mannerheimin johdolla.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [2008],
        branches: [
          { lang: "fi", page_id: 6021, title: "Carl Gustaf Emil Mannerheim", reason: "White commander" },
        ],
      },
      {
        lang: "fi",
        page_id: 1150,
        wikidata_id: "Q211855",
        title: "Suomen sisällissota",
        url: "https://fi.wikipedia.org/wiki/Suomen_sis%C3%A4llissota",
        event_year: 1918,
        event_label: "27 Jan – 15 May 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Suomen sisällissota käytiin senaatin johtamien valkoisten ja kansanvaltuuskunnan johtamien punaisten välillä tammi–toukokuussa 1918. Sota ja sen jälkeiset vankileirit vaativat noin 36 600 suomalaisen hengen.",
        summary_long: "[mock] Suomen sisällissota 27.1.–15.5.1918 oli Suomen historian syvin sisäinen murros, johon osallistuivat myös Neuvosto-Venäjän ja keisarillisen Saksan joukot. Valtionterrorin, taistelujen ja vankileirien uhreja tutkittiin kattavasti Suomen sotasurmat 1914–1922 -hankkeessa.",
        thumb_url: ARTICLE_THUMBS.get(1150).thumb_url,
        thumb_file: ARTICLE_THUMBS.get(1150).thumb_file,
        has_history: true,
        first_added_year: 2003,
        changes: 11,
        war_years: [2006, 2007, 2008, 2014, 2018],
        branches: [
          { lang: "fi", page_id: 1256, title: "Talvisota", reason: "Road: Talvisota 1939" },
        ],
      },
      {
        lang: "fi",
        page_id: 194053,
        wikidata_id: "Q489141",
        title: "Tampereen taistelu 1918",
        url: "https://fi.wikipedia.org/wiki/Tampereen_taistelu_1918",
        event_year: 1918,
        event_label: "16 Mar – 6 Apr 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Tampereen suurtaistelu maaliskuun lopussa ja huhtikuun alussa 1918 oli Pohjoismaiden historian suurin kaupunkitaistelu. Valkoisten voitto Tampereella ratkaisi sodan sotilaallisen lopputuloksen.",
        summary_long: "[mock] Tampereen saarrostus ja katutaistelut Kalevankankaalla sekä keskustassa päättyivät punaisten antautumiseen 6. huhtikuuta 1918. Samaan aikaan saksalainen Itämeren-divisioona nousi maihin Hangossa ja valtasi Helsingin.",
        thumb_url: makeSvgThumbDataUri("Tampereen taistelu huhtikuu 1918", "#D43F55"),
        thumb_file: "Tampere_battle_april_1918.jpg",
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [2008],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 11444,
        wikidata_id: "Q152331",
        title: "P. E. Svinhufvud",
        url: "https://fi.wikipedia.org/wiki/P._E._Svinhufvud",
        event_year: 1918,
        event_label: "May – Dec 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Sodan päätyttyä valtionhoitaja P. E. Svinhufvud tuki saksalaissuuntausta ja monarkistista hallitusmuotohanketta. Saksan romahdus marraskuussa 1918 johti kuitenkin suuntauksen hylkäämiseen.",
        summary_long: "[mock] P. E. Svinhufvud toimi itsenäisyyssenaatin puheenjohtajana ja kesästä 1918 Suomen ensimmäisenä valtionhoitajana, kunnes Mannerheim valittiin hänen seuraajakseen länsivaltojen suhteiden normalisoimiseksi.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 11477, title: "Lapuanliike", reason: "1930s crisis" },
        ],
      },
      {
        lang: "fi",
        page_id: 7650,
        wikidata_id: "Q152325",
        title: "K. J. Ståhlberg",
        url: "https://fi.wikipedia.org/wiki/K._J._St%C3%A5hlberg",
        event_year: 1919,
        event_label: "17 Jul 1919",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Vuoden 1919 tasavaltainen hallitusmuoto ja K. J. Ståhlbergin valinta ensimmäiseksi presidentiksi vakiinnuttivat parlamentaarisen demokratian. Armahduslait aloittivat kansallisen eheytymisen.",
        summary_long: "[mock] Oikeustieteilijä K. J. Ståhlberg hahmotteli Suomen vuoden 1919 hallitusmuodon ja johti tasavallan ensimmäisenä presidenttinä 1919–1925 oikeusvaltion ja parlamentarismin vakiinnuttamista sisällissodan jälkeen.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 3,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194049, title: "Väinö Tanner", reason: "Parliamentary integration" },
        ],
      },
      {
        lang: "fi",
        page_id: 8901,
        wikidata_id: "Q504109",
        title: "Tarton rauha",
        url: "https://fi.wikipedia.org/wiki/Tarton_rauha",
        event_year: 1920,
        event_label: "14 Oct 1920",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Tarton rauhansopimus päätti sotatilan Suomen ja Neuvosto-Venäjän välillä sekä vahvisti nuoren tasavallan rajat. Petsamo liitettiin Suomeen ja itäraja vakiintui kahdeksi vuosikymmeneksi.",
        summary_long: "[mock] Tarton rauha 14.10.1920 sinetöi Suomen itsenäistymisvaiheen ulkopoliittisesti ja loi oikeudellisen perustan Suomen kansainväliselle asemalle maailmansotien välisenä aikana.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 1256, title: "Talvisota", reason: "Road: Talvisota 1939" },
        ],
      },
    ],
  },

  autonomia: {
    topic: {
      title: "Autonomian aika",
      lang: "fi",
      page_id: null,
      category: "Autonomian aika",
    },
    eras: [
      { from_year: 1596, to_year: 1721, label: "Ruotsin vallan aika" },
      { from_year: 1808, to_year: 1862, label: "Autonomian synty ja keisarillinen senaatti" },
      { from_year: 1863, to_year: 1898, label: "Valtiopäivätoiminta ja kansallinen herääminen" },
      { from_year: 1899, to_year: 1917, label: "Sortovuodet ja tie itsenäisyyteen" },
    ],
    events: [
      {
        lang: "fi",
        page_id: 18861,
        wikidata_id: "Q1062419",
        title: "Nuijasota",
        url: "https://fi.wikipedia.org/wiki/Nuijasota",
        event_year: 1596,
        event_label: "Nov 1596 – Feb 1597",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Talonpoikien kapina Klaus Flemingin sotaväen linnaleirirasitusta vastaan Pohjanmaalla, Savossa ja Hämeessä oli Ruotsin vallan ajan suurin sisäinen kriisi. Jaakko Ilkan johtama kansannousu kukistettiin verisesti.",
        summary_long: "[mock] Nuijasota 1596–1597 kytkeytyi Ruotsin valtataisteluun Kaarle-herttuan ja kuningas Sigismundin välillä. Talonpoikien kapina osoitti itäisen valtakunnanpuoliskon erityisaseman ja talonpoikaiston poliittisen merkityksen.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 4,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 11803,
        wikidata_id: "Q1054822",
        title: "Isoviha",
        url: "https://fi.wikipedia.org/wiki/Isoviha",
        event_year: 1714,
        event_label: "1713 – 1721",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Suuren Pohjan sodan aikainen venäläismiehitys 1713–1721 päättyi Uudenkaupungin rauhaan, jossa Kaakkois-Suomi ja Viipuri luovutettiin Venäjälle. Ruotsin suurvalta-aseman murtuminen muutti Suomen geopoliittisen aseman pysyvästi.",
        summary_long: "[mock] Isovihan miehityskausi ja vuoden 1721 Uudenkaupungin rauha johtivat Suomen itärajan jakautumiseen, kunnes Vanha Suomi yhdistettiin autonomiseen suuriruhtinaskuntaan vuonna 1812.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 5,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 300008,
        wikidata_id: "Q10008",
        title: "Porvoon valtiopäivät 1809",
        url: "https://fi.wikipedia.org/wiki/Porvoon_valtiop%C3%A4iv%C3%A4t_1809",
        event_year: 1809,
        event_label: "29 Mar – 19 Jul 1809",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Suomen sodan aikana kokoontuneilla Porvoon valtiopäivillä keisari Aleksanteri I antoi hallitsijanvakuutuksen ja vahvisti maan perustuslait sekä uskonnon. Suomesta muodostui autonominen suuriruhtinaskunta omine keskushallintoineen.",
        summary_long: "[mock] Porvoon tuomiokirkossa maaliskuussa 1809 vannottu hallitsijanvakuutus ja säätyjen uskollisuudenvala loivat perustan Suomen autonomialle, omalle hallituskonseljille (myöhemmin senaatille) ja omalle taloudelle.",
        thumb_url: makeSvgThumbDataUri("Porvoon valtiopäivät 1809", "#D9B872"),
        thumb_file: "Porvoon_valtiopaivat_1809.jpg",
        has_history: false,
        first_added_year: null,
        changes: null,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 300003,
        wikidata_id: "Q10003",
        title: "Keisarillinen Suomen senaatti",
        url: "https://fi.wikipedia.org/wiki/Keisarillinen_Suomen_senaatti",
        event_year: 1816,
        event_label: "1816 – 1918",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Hallituskonselji nimettiin vuonna 1816 Keisarilliseksi Suomen senaatiksi ja siirrettiin uuteen pääkaupunkiin Helsinkiin. Senaatin talous- ja oikeusosastot muodostivat maan kotimaisen hallituksen ja korkeimman oikeuden.",
        summary_long: "[mock] Keisarillinen Suomen senaatti toimi autonomian ajan keskeisenä hallintoelimenä, jonka jäseninä olivat suomalaiset senaattorit. Carl Ludvig Engelin suunnittelema Senaatintori symboloi uutta valtiollista keskusta.",
        thumb_url: null,
        thumb_file: null,
        has_history: false,
        first_added_year: null,
        changes: null,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 194058,
        wikidata_id: "Q489173",
        title: "Johan Vilhelm Snellman",
        url: "https://fi.wikipedia.org/wiki/Johan_Vilhelm_Snellman",
        event_year: 1863,
        event_label: "1 Aug 1863",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Senaattori J. V. Snellman hankki keisari Aleksanteri II:lta vuoden 1863 kielireskriptin ja johti oman rahayksikön, markan, sitomista hopeakantaan vuonna 1865. Säännöllinen valtiopäivätoiminta käynnistyi uudelleen yli puolen vuosisadan tauon jälkeen.",
        summary_long: "[mock] Vuoden 1863 valtiopäivät, kieliasetus ja oma markka vahvistivat Suomen taloudellisen ja kulttuurisen autonomian. Snellmanin uudistukset loivat pohjan suomenkieliselle koululaitokselle ja hallinnolle.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2003,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194062, title: "Nokian historia", reason: "Industrialization 1865" },
        ],
      },
      {
        lang: "fi",
        page_id: 194062,
        wikidata_id: "Q489198",
        title: "Nokian historia",
        url: "https://fi.wikipedia.org/wiki/Nokian_historia",
        event_year: 1865,
        event_label: "12 May 1865",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Vuori-insinööri Fredrik Idestam perusti puuhiomon Tammerkosken ja Nokianvirran varrelle vuonna 1865. Metsä-, paperi- ja konepajateollisuuden kasvu uudisti autonomisen Suomen elinkeinorakenteen.",
        summary_long: "[mock] Autonomian ajan lainsäädäntöuudistukset, elinkeinovapaus ja rautatieverkoston rakentaminen vauhdittivat suomalaisen metsäteollisuuden ja teollisuuskaupunkien nousua 1860-luvulta alkaen.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 5,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 11113,
        wikidata_id: "Q1189421",
        title: "Sortovuodet",
        url: "https://fi.wikipedia.org/wiki/Sortovuodet",
        event_year: 1899,
        event_label: "15 Feb 1899 – 1917",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Helmikuun manifesti 1899 käynnisti venäläistämistoimet, joiden tarkoituksena oli kaventaa Suomen erityisasemaa ja liittää suuriruhtinaskunta tiiviimmin keisarikuntaan. Suuri adressi keräsi yli puoli miljoonaa allekirjoitusta perustuslakien puolesta.",
        summary_long: "[mock] Sortovuodet jakautuivat ensimmäiseen (1899–1905) ja toiseen (1908–1917) sortokauteen. Passiivinen ja aktiivinen vastarinta yhdistivät perustuslaillisia ja synnyttivät itsenäisyysliikkeen.",
        thumb_url: makeSvgThumbDataUri("Sortovuodet 1899–1917", "#D43F55"),
        thumb_file: "Suuri_adressi_1899_Helsinki.jpg",
        has_history: true,
        first_added_year: 2004,
        changes: 6,
        war_years: [2007],
        branches: [
          { lang: "fi", page_id: 194057, title: "Nikolai Bobrikov", reason: "Governor-General 1898–1904" },
        ],
      },
      {
        lang: "fi",
        page_id: 194057,
        wikidata_id: "Q489167",
        title: "Nikolai Bobrikov",
        url: "https://fi.wikipedia.org/wiki/Nikolai_Bobrikov",
        event_year: 1900,
        event_label: "1898 – 16 Jun 1904",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Kenraalikuvernööri Nikolai Bobrikov ajoi kielimanifestin, Suomen oman sotaväen lakkauttamisen ja diktatuuriasetuksen toimeenpanoa. Hänen hallintokautensa kärjisti perustuslaillisen vastarinnan äärimmilleen.",
        summary_long: "[mock] Kenraalikuvernööri Bobrikov sai vuonna 1903 poikkeusvaltuudet karkottaa poliittisia vastustajia ja lakkauttaa sanomalehtiä, mikä johti kagaalin maanalaiseen vastarintatyöhön.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194056, title: "Eugen Schauman", reason: "Senate assassination 1904" },
        ],
      },
      {
        lang: "fi",
        page_id: 194056,
        wikidata_id: "Q489160",
        title: "Eugen Schauman",
        url: "https://fi.wikipedia.org/wiki/Eugen_Schauman",
        event_year: 1904,
        event_label: "16 Jun 1904",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Senaatin apukamreeri Eugen Schauman ampui kenraalikuvernööri Bobrikovin Senaatinlinnan portaikossa 16. kesäkuuta 1904 ja surmasi välittömästi itsensä. Hän jätti keisarille kirjeen, jossa hän perusteli tekoaan laittomuuksien vastustamisella.",
        summary_long: "[mock] Bobrikovin murha Helsingin Senaatinlinnassa kesäkuussa 1904 oli aktivistiliikkeen tunnetuin isku ja heijasti passiivisen vastarinnan rinnalle noussutta suoraa toimintaa.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2004,
        changes: 5,
        war_years: [],
        branches: [],
      },
      {
        lang: "fi",
        page_id: 194059,
        wikidata_id: "Q489180",
        title: "Suurlakko 1905",
        url: "https://fi.wikipedia.org/wiki/Suurlakko_1905",
        event_year: 1905,
        event_label: "30 Oct – 6 Nov 1905",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Venäjän–Japanin sodan tappioiden myötä puhjennut suurlakko pakotti keisarin antamaan marraskuun manifestin ja kumoamaan ensimmäisen sortokauden asetukset. Lakko avasi tien eurooppalaisittain poikkeuksellisen radikaalille äänioikeusuudistukselle.",
        summary_long: "[mock] Vuoden 1905 suurlakko päätti ensimmäisen sortokauden ja pakotti keisari Nikolai II:n palauttamaan lailliset olot sekä kutsumaan koolle ylimääräiset valtiopäivät eduskuntauudistusta varten.",
        thumb_url: makeSvgThumbDataUri("Suurlakko marraskuu 1905", "#D9B872"),
        thumb_file: "Suurlakko_1905_Helsinki.jpg",
        has_history: true,
        first_added_year: 2005,
        changes: 5,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 1150, title: "Suomen sisällissota", reason: "Road: Sisällissota 1918" },
        ],
      },
      {
        lang: "fi",
        page_id: 194060,
        wikidata_id: "Q489186",
        title: "Eduskuntauudistus 1906",
        url: "https://fi.wikipedia.org/wiki/Eduskuntauudistus_1906",
        event_year: 1906,
        event_label: "1 Jun 1906",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Yksikamarinen 200-paikkainen eduskunta ja yleinen sekä yhtäläinen äänioikeus toteutuivat vuonna 1906. Kevään 1907 ensimmäisissä eduskuntavaaleissa valittiin maailman ensimmäiset 19 naiskansanedustajaa.",
        summary_long: "[mock] Eduskuntauudistus 1906 muutti Suomen Euroopan vanhakantaisimmasta nelisäätyisestä edustuslaitoksesta moderniksi parlamentaariseksi edustustoksi, jossa myös naiset saivat vaalikelpoisuuden.",
        thumb_url: null,
        thumb_file: null,
        has_history: true,
        first_added_year: 2005,
        changes: 3,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 194050, title: "Miina Sillanpää", reason: "First female minister" },
        ],
      },
      {
        lang: "fi",
        page_id: 162670,
        wikidata_id: "Q1364912",
        title: "Suomen itsenäisyysjulistus",
        url: "https://fi.wikipedia.org/wiki/Suomen_itsen%C3%A4isyysjulistus",
        event_year: 1917,
        event_label: "6 Dec 1917",
        lanes: ["fi", "sv", "en"],
        summary_short: "[mock] Yli sata vuotta kestänyt autonomian aika päättyi, kun eduskunta hyväksyi senaatin itsenäisyysjulistuksen 6. joulukuuta 1917. Autonomian aikana rakennetut omat instituutiot mahdollistivat suvereenin valtion välittömän toiminnan.",
        summary_long: "[mock] Suomen itsenäisyysjulistus 6.12.1917 päätti vuosien 1809–1917 autonomian kauden. Oman lainsäädännön, eduskunnan, keskuspankin ja virkakoneiston ansiosta Suomi siirtyi itsenäisyyteen valmiina valtiona.",
        thumb_url: makeSvgThumbDataUri("Itsenäisyysjulistus 6.12.1917", "#EEF2F6"),
        thumb_file: "Finnish_declaration_of_independence_1917.jpg",
        has_history: true,
        first_added_year: 2006,
        changes: 4,
        war_years: [],
        branches: [
          { lang: "fi", page_id: 1150, title: "Suomen sisällissota", reason: "Road: Sisällissota 1918" },
        ],
      },
    ],
  },
};

