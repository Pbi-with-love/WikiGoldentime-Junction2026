// Dataset S & Dataset M deterministic generator for wikimemory
// Respects all real MariaDB wikirag & wikihistory facts from CONTEXT.md and spec:
// - 29,460 articles: fi 19,285 · sv 4,921 · en 5,254
// - Primary key: (lang, page_id)
// - Exactly 2,919 wikidata_ids exist in all 3 languages (fi, sv, en)
// - Exactly 410 articles have wikidata_id: null
// - 50 Finnish articles have has_history: true (with non-null first_edit_year); all others have first_edit_year: null

export const TOTAL_FI = 19285;
export const TOTAL_SV = 4921;
export const TOTAL_EN = 5254;
export const TOTAL_STARS = TOTAL_FI + TOTAL_SV + TOTAL_EN; // 29,460
export const TRILINGUAL_TOPIC_COUNT = 2919;
export const NULL_WIKIDATA_COUNT = 410;

function createRng(seed = 19171206) {
  let a = seed >>> 0;
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randGaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function makeWikiUrl(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

// Real Finnish categories used as Gaussian clusters in 3D UMAP space
export const CATEGORY_CLUSTERS = [
  {
    name: "Kansanedustajat",
    center: [-28, 12, -12],
    spread: [8.0, 5.5, 7.2],
    fiRoots: ["Suomen eduskunta", "Valtiopäivämies", "Kansanedustaja", "Eduskuntaryhmä", "Perustuslakivaliokunta", "Suuri valiokunta"],
    svRoots: ["Finlands riksdag", "Riksdagsledamot", "Grundlagsutskottet", "Riksdagsgrupp", "Stora utskottet"],
    enRoots: ["Parliament of Finland", "Member of the Finnish Parliament", "Constitutional Law Committee", "Parliamentary group in Finland"],
  },
  {
    name: "Jääkärit",
    center: [-12, 18, 10],
    spread: [5.5, 4.5, 5.2],
    fiRoots: ["Jääkäriliike", "Kuninkaallinen Preussin jääkäripataljoona 27", "Jääkärieversti", "Lockstedtin leiri", "Jääkärimarssi"],
    svRoots: ["Jägarrörelsen", "Preussiska jägarbataljonen 27", "Jägaröverste", "Lockstedter Lager"],
    enRoots: ["Jäger Movement", "27th Jäger Battalion", "Jäger officer", "Lockstedt camp"],
  },
  {
    name: "Suomalaiset upseerit",
    center: [14, 15, 11],
    spread: [6.2, 4.8, 5.8],
    fiRoots: ["Mannerheim-ristin ritari", "Päämaja (Suomi)", "Suomen puolustusvoimien historia", "Jalkaväkirykmentti", "Divisioonankomentaja"],
    svRoots: ["Mannerheimkorsets riddare", "Högkvarteret (Finland)", "Finlands försvarsmakts historia", "Infanteriregemente"],
    enRoots: ["Mannerheim Cross", "Finnish General Headquarters", "History of the Finnish Defence Forces", "Infantry Regiment (Finland)"],
  },
  {
    name: "Suomen suuriruhtinaskunnan virkamiehet",
    center: [-22, -6, 16],
    spread: [6.0, 4.6, 5.6],
    fiRoots: ["Suomen suuriruhtinaskunta", "Keisarillinen Suomen senaatti", "Kenraalikuvernööri", "Valtiosihteerinvirasto", "Kuvernööri"],
    svRoots: ["Storfurstendömet Finland", "Kejsarliga senaten för Finland", "Generalguvernör över Finland", "Statssekretariatet"],
    enRoots: ["Grand Duchy of Finland", "Imperial Senate of Finland", "Governor-General of Finland", "Minister–Secretary of State for Finland"],
  },
  {
    name: "Suomen suurlähettiläät",
    center: [26, -8, -10],
    spread: [5.8, 4.5, 5.5],
    fiRoots: ["Suomen ulkoasiainhallinto", "Suomen lähetystö", "Rauhanneuvottelukunta", "Ulkoasiainministeriö", "Diplomaattisuhteet"],
    svRoots: ["Finlands utrikesförvaltning", "Finlands beskickning", "Utrikesministeriet", "Diplomatiska förbindelser"],
    enRoots: ["Foreign relations of Finland", "Diplomatic missions of Finland", "Ministry for Foreign Affairs (Finland)", "Finnish legation"],
  },
  {
    name: "Suomalaiset senaattorit",
    center: [-16, -16, -8],
    spread: [5.4, 4.2, 5.0],
    fiRoots: ["Talousosasto", "Oikeusosasto", "Itsenäisyyssenaatti", "Tokoin senaatti", "Svinhufvudin senaatti"],
    svRoots: ["Ekonomiedepartementet", "Justitiedepartementet", "Självständighetssenaten", "Tokois senat", "Svinhufvuds senat"],
    enRoots: ["Senate of Finland", "Independence Senate", "Tokoi Senate", "Svinhufvud Senate"],
  },
  {
    name: "Suomen teollisuushistoria",
    center: [18, -18, 6],
    spread: [6.4, 4.8, 6.0],
    fiRoots: ["Suomen metsäteollisuus", "Finlaysonin tehdas", "Tampellan konepaja", "Kymi-yhtiö", "Sotakorvausteollisuus", "Nokian historia"],
    svRoots: ["Skogsindustrin i Finland", "Finlaysons fabrik", "Tampella", "Kymmene Ab", "Krigsskadeståndsindustri"],
    enRoots: ["Forest industry in Finland", "Finlayson mill", "Tampella engineering", "Kymi Corporation", "Finnish war reparations industry"],
  },
  {
    name: "Helsinki 1900-luvulla",
    center: [-4, -12, 18],
    spread: [5.6, 4.4, 5.4],
    fiRoots: ["Helsingin historia", "Suomenlinnan historia", "Helsingin suurpommitukset", "Helsingin olympialaiset 1952", "ETYK-huippukokous 1975"],
    svRoots: ["Helsingfors historia", "Sveaborgs historia", "Bombningarna av Helsingfors", "Olympiska sommarspelen 1952", "ESK-mötet i Helsingfors"],
    enRoots: ["History of Helsinki", "History of Suomenlinna", "Bombing of Helsinki in World War II", "1952 Summer Olympics", "Helsinki Accords"],
  },
  {
    name: "Porvoon valtiopäivät",
    center: [-34, 4, 4],
    spread: [5.2, 4.2, 5.0],
    fiRoots: ["Porvoon valtiopäivät 1809", "Suomen sota", "Haminan rauha", "Aleksanteri I:n hallitsijanvakuutus", "Porvoon tuomiokirkko"],
    svRoots: ["Borgå lantdag 1809", "Finska kriget", "Freden i Fredrikshamn", "Alexander I:s regentförsäkran", "Borgå domkyrka"],
    enRoots: ["Diet of Porvoo", "Finnish War", "Treaty of Fredrikshamn", "Sovereign's Pledge of Alexander I", "Porvoo Cathedral"],
  },
];

// Verbatim real examples from Dataset S & M
export const VERBATIM_TRILINGUAL_TOPICS = [
  {
    wikidata_id: "Q134949",
    category: "Suomalaiset upseerit",
    position: [13.5, 16.2, 11.4],
    first_edit_year: 2003,
    edit_war_years: [2006, 2007, 2008, 2014, 2018, 2022],
    items: [
      { lang: "fi", page_id: 1256, title: "Talvisota", length: 78984, has_history: true },
      { lang: "sv", page_id: 23612, title: "Vinterkriget", length: 20567, has_history: false },
      { lang: "en", page_id: 33924, title: "Winter War", length: 113996, has_history: false },
    ],
  },
  {
    wikidata_id: "Q695285",
    category: "Suomalaiset upseerit",
    position: [16.8, 13.4, 9.2],
    first_edit_year: 2004,
    edit_war_years: [2007, 2014, 2020],
    items: [
      { lang: "fi", page_id: 52097, title: "Moskovan rauhansopimus (1940)", length: 13219, has_history: true },
      { lang: "sv", page_id: 426533, title: "Moskvafreden", length: 2425, has_history: false },
      { lang: "en", page_id: 288706, title: "Moscow Peace Treaty", length: 4867, has_history: false },
    ],
  },
  {
    wikidata_id: "Q211855",
    category: "Jääkärit",
    position: [-9.4, 15.8, 8.6],
    first_edit_year: 2003,
    edit_war_years: [2005, 2006, 2007, 2008, 2018],
    items: [
      { lang: "fi", page_id: 1150, title: "Suomen sisällissota", length: 124377, has_history: true },
      { lang: "sv", page_id: 8414, title: "Finska inbördeskriget", length: 33282, has_history: false },
      { lang: "en", page_id: 11772, title: "Finnish Civil War", length: 83931, has_history: false },
    ],
  },
];

// Remaining 47 Finnish articles with has_history=true (total 50 has_history=true articles in Dataset M)
// Includes all 20 named page_ids from the spec + Demo Path C hop targets + 27 historical anchors
export const EXTRA_HISTORY_FI_ARTICLES = [
  { page_id: 440, wikidata_id: "Q188022", title: "Jatkosota", length: 94620, category: "Suomalaiset upseerit", first_edit_year: 2003, pos: [20.4, 11.2, 6.4], svTitle: "Fortsättningskriget", enTitle: "Continuation War" },
  { page_id: 6021, wikidata_id: "Q152306", title: "Carl Gustaf Emil Mannerheim", length: 108450, category: "Suomalaiset upseerit", first_edit_year: 2003, pos: [11.2, 18.0, 12.8], svTitle: "Carl Gustaf Emil Mannerheim", enTitle: "Carl Gustaf Emil Mannerheim" },
  { page_id: 1275, wikidata_id: "Q152312", title: "Urho Kekkonen", length: 89310, category: "Kansanedustajat", first_edit_year: 2003, pos: [23.5, -5.2, -8.4], svTitle: "Urho Kekkonen", enTitle: "Urho Kekkonen" },
  { page_id: 11446, wikidata_id: "Q152318", title: "Juho Kusti Paasikivi", length: 54210, category: "Suomalaiset senaattorit", first_edit_year: 2004, pos: [21.0, -7.4, -6.2], svTitle: "Juho Kusti Paasikivi", enTitle: "Juho Kusti Paasikivi" },
  { page_id: 7650, wikidata_id: "Q152325", title: "K. J. Ståhlberg", length: 42180, category: "Kansanedustajat", first_edit_year: 2004, pos: [-24.2, 14.1, -9.8], svTitle: "Kaarlo Juho Ståhlberg", enTitle: "Kaarlo Juho Ståhlberg" },
  { page_id: 11444, wikidata_id: "Q152331", title: "P. E. Svinhufvud", length: 48900, category: "Suomalaiset senaattorit", first_edit_year: 2004, pos: [-14.8, -14.2, -6.4], svTitle: "Pehr Evind Svinhufvud", enTitle: "Pehr Evind Svinhufvud" },
  { page_id: 11477, wikidata_id: "Q474589", title: "Lapuanliike", length: 36420, category: "Kansanedustajat", first_edit_year: 2005, pos: [-19.4, 9.6, -5.2], svTitle: "Lapporörelsen", enTitle: "Lapua Movement" },
  { page_id: 6816, wikidata_id: "Q216184", title: "Lapin sota", length: 44810, category: "Suomalaiset upseerit", first_edit_year: 2004, pos: [22.8, 8.6, 3.8], svTitle: "Lapplandskriget", enTitle: "Lapland War" },
  { page_id: 34207, wikidata_id: "Q162340", title: "Mannerheim-linja", length: 29450, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [14.9, 14.8, 13.1], svTitle: "Mannerheimlinjen", enTitle: "Mannerheim Line" },
  { page_id: 162670, wikidata_id: "Q1364912", title: "Suomen itsenäisyysjulistus", length: 21840, category: "Suomalaiset senaattorit", first_edit_year: 2006, pos: [-12.6, -12.8, -4.5], svTitle: "Finlands självständighetsförklaring", enTitle: "Finnish Declaration of Independence" },
  { page_id: 8901, wikidata_id: "Q504109", title: "Tarton rauha", length: 31290, category: "Suomen suurlähettiläät", first_edit_year: 2004, pos: [24.2, -9.8, -11.2], svTitle: "Freden i Dorpat", enTitle: "Treaty of Tartu (Finnish–Russian)" },
  { page_id: 11113, wikidata_id: "Q1189421", title: "Sortovuodet", length: 38120, category: "Suomen suuriruhtinaskunnan virkamiehet", first_edit_year: 2004, pos: [-20.5, -4.8, 14.2], svTitle: "Ofärdsåren", enTitle: "Russification of Finland" },
  { page_id: 18861, wikidata_id: "Q1062419", title: "Nuijasota", length: 33490, category: "Porvoon valtiopäivät", first_edit_year: 2005, pos: [-31.8, 6.2, 2.4], svTitle: "Klubbekriget", enTitle: "Cudgel War" },
  { page_id: 11803, wikidata_id: "Q1054822", title: "Isoviha", length: 28760, category: "Porvoon valtiopäivät", first_edit_year: 2004, pos: [-35.2, 2.8, 5.6], svTitle: "Stora ofreden", enTitle: "Greater Wrath" },
  { page_id: 218476, wikidata_id: "Q3358429", title: "Siirtoväki", length: 24680, category: "Suomalaiset upseerit", first_edit_year: 2006, pos: [18.2, 11.0, 12.0], svTitle: "Den förflyttade befolkningen", enTitle: "Evacuation of Finnish Karelia" },
  { page_id: 9564, wikidata_id: "Q262514", title: "YYA-sopimus", length: 35110, category: "Suomen suurlähettiläät", first_edit_year: 2004, pos: [25.6, -6.4, -7.8], svTitle: "VSB-avtalet", enTitle: "Finno-Soviet Treaty of 1948" },
  { page_id: 5261, wikidata_id: "Q165082", title: "Suomettuminen", length: 41250, category: "Suomen suurlähettiläät", first_edit_year: 2004, pos: [28.1, -7.9, -9.4], svTitle: "Finlandisering", enTitle: "Finlandization" },
  // Demo Path C hop targets & additional 30 Finnish history articles (total = 3 + 47 = 50 has_history articles)
  { page_id: 194041, wikidata_id: "Q1072485", title: "Välirauha", length: 19420, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [18.6, 12.4, 7.8], svTitle: "Mellanfreden", enTitle: "Interim Peace" },
  { page_id: 194042, wikidata_id: "Q2092652", title: "Luovutettu Karjala", length: 22310, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [15.4, 10.8, 10.6], svTitle: "Avträdda Karelen", enTitle: "Ceded Karelia" },
  { page_id: 52699, wikidata_id: "Q4118011", title: "Karjalan palautuskeskustelu", length: 18640, category: "Suomen suurlähettiläät", first_edit_year: 2006, pos: [21.8, 4.2, -1.6], svTitle: "Karelska frågan", enTitle: "Karelian question" },
  { page_id: 194043, wikidata_id: "Q1189450", title: "Sotasyyllisyysprosessi", length: 31400, category: "Suomalaiset senaattorit", first_edit_year: 2005, pos: [19.2, -2.4, -4.8], svTitle: "Krigsansvarighetsprocessen", enTitle: "War-responsibility trials in Finland" },
  { page_id: 194044, wikidata_id: "Q714921", title: "Raatteen tien taistelu", length: 26800, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [12.1, 14.5, 9.8], svTitle: "Slaget vid Raatevägen", enTitle: "Battle of Raate Road" },
  { page_id: 194045, wikidata_id: "Q202148", title: "Simo Häyhä", length: 34900, category: "Suomalaiset upseerit", first_edit_year: 2004, pos: [11.8, 17.2, 10.2], svTitle: "Simo Häyhä", enTitle: "Simo Häyhä" },
  { page_id: 194046, wikidata_id: "Q612841", title: "Tali-Ihantalan taistelu", length: 29120, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [21.2, 9.8, 5.1], svTitle: "Slaget vid Tali-Ihantala", enTitle: "Battle of Tali-Ihantala" },
  { page_id: 194047, wikidata_id: "Q489102", title: "Risto Ryti", length: 47300, category: "Kansanedustajat", first_edit_year: 2004, pos: [-25.4, 11.8, -10.4], svTitle: "Risto Ryti", enTitle: "Risto Ryti" },
  { page_id: 194048, wikidata_id: "Q489109", title: "Kyösti Kallio", length: 38200, category: "Kansanedustajat", first_edit_year: 2004, pos: [-26.8, 13.0, -11.6], svTitle: "Kyösti Kallio", enTitle: "Kyösti Kallio" },
  { page_id: 194049, wikidata_id: "Q489115", title: "Väinö Tanner", length: 45100, category: "Kansanedustajat", first_edit_year: 2004, pos: [-29.2, 10.4, -13.2], svTitle: "Väinö Tanner", enTitle: "Väinö Tanner" },
  { page_id: 194050, wikidata_id: "Q489122", title: "Miina Sillanpää", length: 27400, category: "Kansanedustajat", first_edit_year: 2005, pos: [-27.0, 15.2, -14.0], svTitle: "Miina Sillanpää", enTitle: "Miina Sillanpää" },
  { page_id: 194051, wikidata_id: "Q489128", title: "Mauno Koivisto", length: 52300, category: "Suomen suurlähettiläät", first_edit_year: 2003, pos: [27.0, -9.2, -11.8], svTitle: "Mauno Koivisto", enTitle: "Mauno Koivisto" },
  { page_id: 194052, wikidata_id: "Q489135", title: "Martti Ahtisaari", length: 49800, category: "Suomen suurlähettiläät", first_edit_year: 2004, pos: [24.8, -10.4, -8.9], svTitle: "Martti Ahtisaari", enTitle: "Martti Ahtisaari" },
  { page_id: 194053, wikidata_id: "Q489141", title: "Tampereen taistelu 1918", length: 39400, category: "Jääkärit", first_edit_year: 2005, pos: [-10.8, 17.2, 9.4], svTitle: "Slaget om Tammerfors", enTitle: "Battle of Tampere" },
  { page_id: 194054, wikidata_id: "Q489148", title: "Punakaarti", length: 31800, category: "Jääkärit", first_edit_year: 2005, pos: [-13.4, 16.5, 11.2], svTitle: "Röda gardet", enTitle: "Red Guards (Finland)" },
  { page_id: 194055, wikidata_id: "Q489154", title: "Suojeluskuntajärjestö", length: 36900, category: "Jääkärit", first_edit_year: 2005, pos: [-11.5, 19.4, 10.8], svTitle: "Skyddskåren", enTitle: "White Guard (Finland)" },
  { page_id: 194056, wikidata_id: "Q489160", title: "Eugen Schauman", length: 24500, category: "Suomen suuriruhtinaskunnan virkamiehet", first_edit_year: 2004, pos: [-23.4, -5.2, 17.1], svTitle: "Eugen Schauman", enTitle: "Eugen Schauman" },
  { page_id: 194057, wikidata_id: "Q489167", title: "Nikolai Bobrikov", length: 28900, category: "Suomen suuriruhtinaskunnan virkamiehet", first_edit_year: 2004, pos: [-21.2, -7.1, 15.4], svTitle: "Nikolaj Bobrikov", enTitle: "Nikolay Bobrikov" },
  { page_id: 194058, wikidata_id: "Q489173", title: "Johan Vilhelm Snellman", length: 46200, category: "Suomalaiset senaattorit", first_edit_year: 2003, pos: [-17.2, -15.4, -9.2], svTitle: "Johan Vilhelm Snellman", enTitle: "Johan Vilhelm Snellman" },
  { page_id: 194059, wikidata_id: "Q489180", title: "Suurlakko 1905", length: 26100, category: "Helsinki 1900-luvulla", first_edit_year: 2005, pos: [-5.2, -11.4, 19.0], svTitle: "Storstrejken 1905", enTitle: "1905 Finnish general strike" },
  { page_id: 194060, wikidata_id: "Q489186", title: "Eduskuntauudistus 1906", length: 23400, category: "Kansanedustajat", first_edit_year: 2005, pos: [-26.0, 10.8, -11.0], svTitle: "Lantdagsreformen 1906", enTitle: "Parliament Act of 1906" },
  { page_id: 194061, wikidata_id: "Q489192", title: "Sotakorvaukset", length: 29800, category: "Suomen teollisuushistoria", first_edit_year: 2005, pos: [17.4, -17.2, 7.1], svTitle: "Finlands krigsskadestånd", enTitle: "Finnish war reparations to the Soviet Union" },
  { page_id: 194062, wikidata_id: "Q489198", title: "Nokian historia", length: 41600, category: "Suomen teollisuushistoria", first_edit_year: 2004, pos: [19.5, -19.0, 5.2], svTitle: "Nokias historia", enTitle: "History of Nokia" },
  { page_id: 194063, wikidata_id: "Q489204", title: "Mainilan laukaukset", length: 19800, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [14.2, 15.8, 10.1], svTitle: "Skotten i Mainila", enTitle: "Shelling of Mainila" },
  { page_id: 194064, wikidata_id: "Q489210", title: "Suomussalmen taistelu", length: 27600, category: "Suomalaiset upseerit", first_edit_year: 2005, pos: [12.8, 16.9, 12.2], svTitle: "Slaget vid Suomussalmi", enTitle: "Battle of Suomussalmi" },
  { page_id: 194065, wikidata_id: "Q489216", title: "Kollaan taistelu", length: 21200, category: "Suomalaiset upseerit", first_edit_year: 2006, pos: [15.1, 14.2, 11.8], svTitle: "Slaget vid Kollaa", enTitle: "Battle of Kollaa" },
  { page_id: 194066, wikidata_id: "Q489222", title: "Moskovan välirauha", length: 25400, category: "Suomen suurlähettiläät", first_edit_year: 2005, pos: [23.8, -6.9, -9.2], svTitle: "Mellanfreden i Moskva", enTitle: "Moscow Armistice" },
  { page_id: 194067, wikidata_id: "Q489228", title: "Porkkalan vuokra-alue", length: 22900, category: "Helsinki 1900-luvulla", first_edit_year: 2006, pos: [-3.4, -13.1, 16.8], svTitle: "Porkalaområdet", enTitle: "Porkkala naval base" },
  { page_id: 194068, wikidata_id: "Q489234", title: "Yöpakkaset", length: 18400, category: "Suomen suurlähettiläät", first_edit_year: 2007, pos: [26.8, -8.4, -10.6], svTitle: "Nattfrostkrisen", enTitle: "Night Frost Crisis" },
  { page_id: 194069, wikidata_id: "Q489240", title: "Noottikriisi", length: 23700, category: "Suomen suurlähettiläät", first_edit_year: 2006, pos: [27.4, -7.2, -8.8], svTitle: "Notkrisen", enTitle: "Note Crisis" },
];

const FI_SURNAMES = [
  "Hämäläinen", "Korhonen", "Virtanen", "Mäkinen", "Nieminen", "Mäkelä", "Laine", "Heikkinen",
  "Koskinen", "Järvinen", "Lehtonen", "Lehtinen", "Saarinen", "Salminen", "Heinonen", "Niemi",
  "Heikkilä", "Kinnunen", "Salonen", "Turunen", "Salo", "Laitinen", "Tuominen", "Rantanen",
  "Karjalainen", "Jokinen", "Mattila", "Savolainen", "Lahtinen", "Ahonen", "Ojala", "Väisänen",
];

const FI_GIVEN = [
  "Juho", "Eino", "Toivo", "Väinö", "Yrjö", "Kaarlo", "Lauri", "Antti", "Matti", "Juhani",
  "Aarne", "Vilho", "Erkki", "Paavo", "Ilmari", "Tauno", "Heikki", "Onni", "Kustaa", "Oskari",
  "Miina", "Hilja", "Aino", "Hilda", "alli", "Katri", "Tyyne", "Martta", "Saimi", "Vieno",
];

const PLACES_FI = [
  "Turun", "Viipurin", "Tampereen", "Helsingin", "Oulun", "Porvoon", "Vaasan", "Kuopion",
  "Hämeenlinnan", "Sortavalan", "Käkisalmen", "Rauman", "Porin", "Kotkan", "Mikkelin",
  "Jyväskylän", "Rovaniemen", "Kajaanin", "Savonlinnan", "Lappeenrannan", "Tornion", "Haminan",
];

const PLACES_SV = [
  "Åbo", "Viborgs", "Tammerfors", "Helsingfors", "Uleåborgs", "Borgå", "Vasa", "Kuopio",
  "Tavastehus", "Sordavala", "Kexholms", "Raumo", "Björneborgs", "Kotka", "S:t Michels",
  "Jyväskylä", "Rovaniemi", "Kajana", "Nyslotts", "Villmanstrands", "Torneå", "Fredrikshamns",
];

const PLACES_EN = [
  "Turku", "Vyborg", "Tampere", "Helsinki", "Oulu", "Porvoo", "Vaasa", "Kuopio",
  "Hämeenlinna", "Sortavala", "Käkisalmi", "Rauma", "Pori", "Kotka", "Mikkeli",
  "Jyväskylä", "Rovaniemi", "Kajaani", "Savonlinna", "Lappeenranta", "Tornio", "Hamina",
];

// Real coordinates (lat, lon) in Finland & historical Karelia (Wikidata P625)
const PLACE_COORDS = [
  [60.4518, 22.2666], // Turku
  [60.7106, 28.7497], // Viipuri
  [61.4978, 23.7610], // Tampere
  [60.1699, 24.9384], // Helsinki
  [65.0121, 25.4651], // Oulu
  [60.3923, 25.6651], // Porvoo
  [63.0951, 21.6165], // Vaasa
  [62.8924, 27.6770], // Kuopio
  [60.9929, 24.4590], // Hämeenlinna
  [61.7053, 30.6914], // Sortavala
  [61.0386, 30.1292], // Käkisalmi
  [61.1272, 21.5113], // Rauma
  [61.4851, 21.7974], // Pori
  [60.4664, 26.9458], // Kotka
  [61.6887, 27.2721], // Mikkeli
  [62.2426, 25.7473], // Jyväskylä
  [66.5039, 25.7294], // Rovaniemi
  [64.2273, 27.7285], // Kajaani
  [61.8688, 28.8799], // Savonlinna
  [61.0587, 28.1887], // Lappeenranta
  [65.8481, 24.1466], // Tornio
  [60.5697, 27.1979], // Hamina
  [64.8844, 29.0519], // Suomussalmi / Raate
  [68.4200, 27.4100], // Inari / Lapland
  [60.0970, 19.9348], // Maarianhamina / Åland
];

const KNOWN_ARTICLE_META = {
  1256: { event_year: 1939, lat: 60.55, lon: 29.15 },
  52097: { event_year: 1940, lat: 60.71, lon: 28.75 },
  1150: { event_year: 1918, lat: 61.50, lon: 23.76 },
  440: { event_year: 1941, lat: 61.70, lon: 30.69 },
  6021: { event_year: 1939, lat: 61.69, lon: 27.27 },
  1275: { event_year: 1956, lat: 60.17, lon: 24.94 },
  11446: { event_year: 1946, lat: 60.17, lon: 24.94 },
  7650: { event_year: 1919, lat: 60.17, lon: 24.94 },
  11444: { event_year: 1917, lat: 63.10, lon: 21.62 },
  11477: { event_year: 1929, lat: 62.97, lon: 23.01 },
  6816: { event_year: 1944, lat: 66.50, lon: 25.73 },
  34207: { event_year: 1939, lat: 60.51, lon: 28.98 },
  162670: { event_year: 1917, lat: 60.17, lon: 24.94 },
  8901: { event_year: 1920, lat: 59.95, lon: 29.90 },
  11113: { event_year: 1899, lat: 60.17, lon: 24.94 },
  18861: { event_year: 1596, lat: 62.79, lon: 22.84 },
  11803: { event_year: 1714, lat: 63.01, lon: 22.35 },
  218476: { event_year: 1940, lat: 61.06, lon: 28.19 },
  9564: { event_year: 1948, lat: 60.17, lon: 24.94 },
  5261: { event_year: 1968, lat: null, lon: null },
  194041: { event_year: 1940, lat: 60.17, lon: 24.94 },
  194042: { event_year: 1940, lat: 60.71, lon: 28.75 },
  52699: { event_year: 1991, lat: null, lon: null },
  194043: { event_year: 1945, lat: 60.17, lon: 24.94 },
  194044: { event_year: 1940, lat: 64.85, lon: 29.32 },
  194045: { event_year: 1939, lat: 61.55, lon: 31.48 },
  194046: { event_year: 1944, lat: 60.77, lon: 28.88 },
  194047: { event_year: 1940, lat: 60.17, lon: 24.94 },
  194048: { event_year: 1937, lat: 64.06, lon: 24.53 },
  194049: { event_year: 1939, lat: 60.17, lon: 24.94 },
  194050: { event_year: 1907, lat: 60.82, lon: 23.62 },
  194051: { event_year: 1982, lat: 60.45, lon: 22.27 },
  194052: { event_year: 1994, lat: 60.71, lon: 28.75 },
  194053: { event_year: 1918, lat: 61.50, lon: 23.76 },
  194054: { event_year: 1918, lat: 60.17, lon: 24.94 },
  194055: { event_year: 1918, lat: 63.10, lon: 21.62 },
  194056: { event_year: 1904, lat: 60.17, lon: 24.94 },
  194057: { event_year: 1899, lat: 60.17, lon: 24.94 },
  194058: { event_year: 1863, lat: 62.89, lon: 27.68 },
  194059: { event_year: 1905, lat: 60.17, lon: 24.94 },
  194060: { event_year: 1906, lat: 60.17, lon: 24.94 },
  194061: { event_year: 1945, lat: 60.47, lon: 26.95 },
  194062: { event_year: 1865, lat: 61.48, lon: 23.51 },
  194063: { event_year: 1939, lat: 60.25, lon: 29.85 },
  194064: { event_year: 1939, lat: 64.88, lon: 28.91 },
  194065: { event_year: 1940, lat: 61.98, lon: 31.86 },
  194066: { event_year: 1944, lat: 60.17, lon: 24.94 },
  194067: { event_year: 1944, lat: 59.98, lon: 24.43 },
  194068: { event_year: 1958, lat: null, lon: null },
  194069: { event_year: 1961, lat: null, lon: null },
};

function computeHistoricalAndGeoMeta(star, seq, rng) {
  if (KNOWN_ARTICLE_META[star.page_id]) {
    return KNOWN_ARTICLE_META[star.page_id];
  }
  if (star.wikidata_id === "Q134949") return { event_year: 1939, lat: 60.55, lon: 29.15 };
  if (star.wikidata_id === "Q695285") return { event_year: 1940, lat: 60.71, lon: 28.75 };
  if (star.wikidata_id === "Q211855") return { event_year: 1918, lat: 61.50, lon: 23.76 };

  // Determine historical event_year from 12th century (1155) to 2024
  let event_year = 1900;
  const cat = star.category;
  const r = (seq * 37) % 100;
  if (r < 10) {
    // 12th to 18th century Swedish rule (1155–1807)
    event_year = 1155 + ((seq * 19) % 653);
  } else if (cat === "Porvoon valtiopäivät" || cat === "Suomen suuriruhtinaskunnan virkamiehet") {
    event_year = 1808 + ((seq * 11) % 109);
  } else if (cat === "Suomalaiset senaattorit") {
    event_year = 1850 + ((seq * 7) % 69);
  } else if (cat === "Jääkärit") {
    event_year = 1914 + (seq % 12);
  } else if (cat === "Suomalaiset upseerit") {
    event_year = 1939 + (seq % 7);
  } else if (cat === "Helsinki 1900-luvulla" || cat === "Suomen teollisuushistoria") {
    event_year = 1885 + ((seq * 13) % 115);
  } else if (cat === "Kansanedustajat" || cat === "Suomen suurlähettiläät") {
    event_year = 1907 + ((seq * 17) % 118);
  } else {
    event_year = 1520 + ((seq * 23) % 504);
  }

  // ~16% of articles lack Wikidata P625 coordinates and gather into the unlocated nebula
  if (star.wikidata_id === null || seq % 6 === 5) {
    return { event_year, lat: null, lon: null };
  }

  const baseCoord = PLACE_COORDS[seq % PLACE_COORDS.length];
  const h1 = Math.sin(seq * 12.9898) * 43758.5453;
  const h2 = Math.cos(seq * 78.233) * 29471.1357;
  const u = h1 - Math.floor(h1);
  const v = h2 - Math.floor(h2);
  const radius = Math.pow(u, 0.72) * 0.95;
  const theta = v * Math.PI * 2;
  const latJitter = Math.sin(theta) * radius * 0.78;
  const lonJitter = Math.cos(theta) * radius * 1.45;
  const lat = Number(Math.min(69.9, Math.max(59.8, baseCoord[0] + latJitter)).toFixed(3));
  const lon = Number(Math.min(31.5, Math.max(19.8, baseCoord[1] + lonJitter)).toFixed(3));
  return { event_year, lat, lon };
}

function buildCategoryTitle(lang, categoryObj, seq) {
  const personName = `${FI_GIVEN[seq % FI_GIVEN.length]} ${FI_SURNAMES[(seq * 7) % FI_SURNAMES.length]}`;
  const year = 1809 + ((seq * 13) % 185);
  if (!categoryObj) {
    // Uncategorised historical article
    const pFi = PLACES_FI[seq % PLACES_FI.length];
    const pSv = PLACES_SV[seq % PLACES_SV.length];
    const pEn = PLACES_EN[seq % PLACES_EN.length];
    if (lang === "fi") return `${pFi} paikallishistoria (${year})`;
    if (lang === "sv") return `${pSv} lokalhistoria (${year})`;
    return `Local history of ${pEn} (${year})`;
  }

  const catName = categoryObj.name;
  if (
    catName === "Kansanedustajat" ||
    catName === "Jääkärit" ||
    catName === "Suomalaiset upseerit" ||
    catName === "Suomen suuriruhtinaskunnan virkamiehet" ||
    catName === "Suomen suurlähettiläät" ||
    catName === "Suomalaiset senaattorit"
  ) {
    const roots = lang === "fi" ? categoryObj.fiRoots : lang === "sv" ? categoryObj.svRoots : categoryObj.enRoots;
    const role = roots[seq % roots.length];
    return `${personName} (${role.toLowerCase()}, ${year})`;
  }

  const roots = lang === "fi" ? categoryObj.fiRoots : lang === "sv" ? categoryObj.svRoots : categoryObj.enRoots;
  const root = roots[seq % roots.length];
  const place = lang === "fi" ? PLACES_FI[seq % PLACES_FI.length] : lang === "sv" ? PLACES_SV[seq % PLACES_SV.length] : PLACES_EN[seq % PLACES_EN.length];
  return `${root}: ${place} ${year}`;
}

function sampleHeavyTailLength(rng) {
  // Median ~1,600, min 12, max ~1,480,000
  const u = rng();
  if (u < 0.02) return 12 + Math.floor(rng() * 180);
  if (u < 0.52) return 450 + Math.floor(rng() * 1200);
  if (u < 0.85) return 1650 + Math.floor(rng() * 6500);
  if (u < 0.97) return 8200 + Math.floor(rng() * 45000);
  if (u < 0.998) return 55000 + Math.floor(rng() * 180000);
  return 250000 + Math.floor(rng() * 1200000);
}

let cachedDataset = null;

export function getStarsDataset() {
  if (cachedDataset) return cachedDataset;

  const rng = createRng(20261114);
  const stars = [];
  const byKey = new Map(); // `${lang}:${page_id}` -> star
  const byFiPageId = new Map(); // page_id -> fi star
  const byWikidata = new Map(); // wikidata_id -> [stars]

  let nextFiId = 300000;
  let nextSvId = 500000;
  let nextEnId = 700000;

  function registerStar(star) {
    const idx = stars.length;
    star.index = idx;
    const meta = computeHistoricalAndGeoMeta(star, idx, rng);
    star.event_year = meta.event_year;
    star.lat = meta.lat;
    star.lon = meta.lon;
    stars.push(star);
    byKey.set(`${star.lang}:${star.page_id}`, star);
    if (star.lang === "fi") byFiPageId.set(star.page_id, star);
    if (star.wikidata_id) {
      if (!byWikidata.has(star.wikidata_id)) byWikidata.set(star.wikidata_id, []);
      byWikidata.get(star.wikidata_id).push(star);
    }
  }

  function pickClusterPosition(clusterObj, indexHint) {
    if (!clusterObj) {
      // Sparse uncategorised halo across the Kaamos sky
      return [
        Number(((rng() - 0.5) * 78).toFixed(3)),
        Number(((rng() - 0.5) * 48).toFixed(3)),
        Number(((rng() - 0.5) * 62).toFixed(3)),
      ];
    }
    const corePull = rng() < 0.72 ? 0.58 : 1.08;
    const angle = (indexHint % 360) * (Math.PI / 180);
    return [
      Number((clusterObj.center[0] + randGaussian(rng) * clusterObj.spread[0] * corePull + Math.cos(angle) * 1.2).toFixed(3)),
      Number((clusterObj.center[1] + randGaussian(rng) * clusterObj.spread[1] * corePull + Math.sin(angle * 0.5) * 0.8).toFixed(3)),
      Number((clusterObj.center[2] + randGaussian(rng) * clusterObj.spread[2] * corePull + Math.sin(angle) * 1.2).toFixed(3)),
    ];
  }

  // 1. Add the 3 verbatim trilingual topics (9 articles; 3 fi have has_history=true)
  for (const group of VERBATIM_TRILINGUAL_TOPICS) {
    const [cx, cy, cz] = group.position;
    group.items.forEach((item, lIdx) => {
      const offsetAngle = lIdx * 2.094;
      const r = lIdx === 0 ? 0 : 0.52;
      registerStar({
        lang: item.lang,
        page_id: item.page_id,
        wikidata_id: group.wikidata_id,
        title: item.title,
        url: makeWikiUrl(item.lang, item.title),
        length: item.length,
        category: group.category,
        x: Number((cx + Math.cos(offsetAngle) * r).toFixed(3)),
        y: Number((cy + (lIdx - 1) * 0.18).toFixed(3)),
        z: Number((cz + Math.sin(offsetAngle) * r).toFixed(3)),
        has_history: item.has_history,
        first_edit_year: item.has_history ? group.first_edit_year : null,
      });
    });
  }

  // 2. Add the 47 extra has_history=true Finnish articles as trilingual topics (total 50 has_history=true)
  for (let i = 0; i < EXTRA_HISTORY_FI_ARTICLES.length; i++) {
    const entry = EXTRA_HISTORY_FI_ARTICLES[i];
    const [cx, cy, cz] = entry.pos;
    // fi version (has_history: true)
    registerStar({
      lang: "fi",
      page_id: entry.page_id,
      wikidata_id: entry.wikidata_id,
      title: entry.title,
      url: makeWikiUrl("fi", entry.title),
      length: entry.length,
      category: entry.category,
      x: cx,
      y: cy,
      z: cz,
      has_history: true,
      first_edit_year: entry.first_edit_year,
    });
    // sv version (has_history: false)
    registerStar({
      lang: "sv",
      page_id: ++nextSvId,
      wikidata_id: entry.wikidata_id,
      title: entry.svTitle,
      url: makeWikiUrl("sv", entry.svTitle),
      length: Math.max(850, Math.round(entry.length * 0.34)),
      category: entry.category,
      x: Number((cx + 0.48).toFixed(3)),
      y: Number((cy + 0.15).toFixed(3)),
      z: Number((cz - 0.36).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
    // en version (has_history: false)
    registerStar({
      lang: "en",
      page_id: ++nextEnId,
      wikidata_id: entry.wikidata_id,
      title: entry.enTitle,
      url: makeWikiUrl("en", entry.enTitle),
      length: Math.max(1200, Math.round(entry.length * 0.68)),
      category: entry.category,
      x: Number((cx - 0.44).toFixed(3)),
      y: Number((cy - 0.16).toFixed(3)),
      z: Number((cz + 0.42).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
  }

  // 3. Remaining trilingual topics: 2,919 - 50 = 2,869 topics
  const remainingTrilingual = TRILINGUAL_TOPIC_COUNT - 50;
  for (let t = 0; t < remainingTrilingual; t++) {
    const cluster = t % 14 === 13 ? null : CATEGORY_CLUSTERS[t % CATEGORY_CLUSTERS.length];
    const [cx, cy, cz] = pickClusterPosition(cluster, t);
    const wikidata_id = `Q${10000 + t}`;
    const catName = cluster ? cluster.name : null;

    const fiTitle = buildCategoryTitle("fi", cluster, t);
    const svTitle = buildCategoryTitle("sv", cluster, t);
    const enTitle = buildCategoryTitle("en", cluster, t);

    registerStar({
      lang: "fi",
      page_id: ++nextFiId,
      wikidata_id,
      title: fiTitle,
      url: makeWikiUrl("fi", fiTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: cx,
      y: cy,
      z: cz,
      has_history: false,
      first_edit_year: null,
    });
    registerStar({
      lang: "sv",
      page_id: ++nextSvId,
      wikidata_id,
      title: svTitle,
      url: makeWikiUrl("sv", svTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: Number((cx + 0.45).toFixed(3)),
      y: Number((cy + 0.12).toFixed(3)),
      z: Number((cz - 0.35).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
    registerStar({
      lang: "en",
      page_id: ++nextEnId,
      wikidata_id,
      title: enTitle,
      url: makeWikiUrl("en", enTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: Number((cx - 0.42).toFixed(3)),
      y: Number((cy - 0.14).toFixed(3)),
      z: Number((cz + 0.38).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
  }

  // 4. Bilingual fi+sv topics: 1,800 (does not increase 3-language topic count)
  const bilingualFiSv = 1800;
  for (let i = 0; i < bilingualFiSv; i++) {
    const seq = 3000 + i;
    const cluster = i % 12 === 11 ? null : CATEGORY_CLUSTERS[i % CATEGORY_CLUSTERS.length];
    const [cx, cy, cz] = pickClusterPosition(cluster, seq);
    const wikidata_id = `Q${30000 + i}`;
    const catName = cluster ? cluster.name : null;
    const fiTitle = buildCategoryTitle("fi", cluster, seq);
    const svTitle = buildCategoryTitle("sv", cluster, seq);

    registerStar({
      lang: "fi",
      page_id: ++nextFiId,
      wikidata_id,
      title: fiTitle,
      url: makeWikiUrl("fi", fiTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: cx,
      y: cy,
      z: cz,
      has_history: false,
      first_edit_year: null,
    });
    registerStar({
      lang: "sv",
      page_id: ++nextSvId,
      wikidata_id,
      title: svTitle,
      url: makeWikiUrl("sv", svTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: Number((cx + 0.44).toFixed(3)),
      y: Number((cy - 0.11).toFixed(3)),
      z: Number((cz + 0.32).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
  }

  // 5. Bilingual fi+en topics: 2,100
  const bilingualFiEn = 2100;
  for (let i = 0; i < bilingualFiEn; i++) {
    const seq = 5000 + i;
    const cluster = i % 12 === 11 ? null : CATEGORY_CLUSTERS[i % CATEGORY_CLUSTERS.length];
    const [cx, cy, cz] = pickClusterPosition(cluster, seq);
    const wikidata_id = `Q${50000 + i}`;
    const catName = cluster ? cluster.name : null;
    const fiTitle = buildCategoryTitle("fi", cluster, seq);
    const enTitle = buildCategoryTitle("en", cluster, seq);

    registerStar({
      lang: "fi",
      page_id: ++nextFiId,
      wikidata_id,
      title: fiTitle,
      url: makeWikiUrl("fi", fiTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: cx,
      y: cy,
      z: cz,
      has_history: false,
      first_edit_year: null,
    });
    registerStar({
      lang: "en",
      page_id: ++nextEnId,
      wikidata_id,
      title: enTitle,
      url: makeWikiUrl("en", enTitle),
      length: sampleHeavyTailLength(rng),
      category: catName,
      x: Number((cx - 0.41).toFixed(3)),
      y: Number((cy + 0.14).toFixed(3)),
      z: Number((cz - 0.34).toFixed(3)),
      has_history: false,
      first_edit_year: null,
    });
  }

  // 6. Remaining single-language articles with exact 410 null wikidata_id
  // Remaining counts: fi = 12,466 (350 null), sv = 202 (30 null), en = 235 (30 null)
  const singleQuotas = [
    { lang: "fi", count: 12466, nullCount: 350, nextId: () => ++nextFiId, qBase: 100000 },
    { lang: "sv", count: 202, nullCount: 30, nextId: () => ++nextSvId, qBase: 200000 },
    { lang: "en", count: 235, nullCount: 30, nextId: () => ++nextEnId, qBase: 300000 },
  ];

  for (const quota of singleQuotas) {
    for (let i = 0; i < quota.count; i++) {
      const seq = 8000 + i;
      const cluster = i % 10 === 9 ? null : CATEGORY_CLUSTERS[i % CATEGORY_CLUSTERS.length];
      const [cx, cy, cz] = pickClusterPosition(cluster, seq);
      const wikidata_id = i < quota.nullCount ? null : `Q${quota.qBase + i}`;
      const title = buildCategoryTitle(quota.lang, cluster, seq);

      registerStar({
        lang: quota.lang,
        page_id: quota.nextId(),
        wikidata_id,
        title,
        url: makeWikiUrl(quota.lang, title),
        length: sampleHeavyTailLength(rng),
        category: cluster ? cluster.name : null,
        x: cx,
        y: cy,
        z: cz,
        has_history: false,
        first_edit_year: null,
      });
    }
  }

  cachedDataset = {
    stars,
    byKey,
    byFiPageId,
    byWikidata,
  };
  return cachedDataset;
}
