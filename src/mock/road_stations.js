// Station-based Article Road ("Talvitie") fixtures for GET /api/road/{lang}/{page_id}.
// All mock prose is prefixed with "[mock]" so it is never mistaken for live Wikipedia text.

export const TALVISOTA_ROAD_FIXTURE = {
  article: {
    lang: "fi",
    page_id: 1256,
    wikidata_id: "Q134949",
    title: "Talvisota",
    url: "https://fi.wikipedia.org/wiki/Talvisota",
    words: 8395,
    reading_minutes: 35,
    has_history: true,
  },
  stations: [
    {
      no: 1,
      heading: "Tausta",
      words: 2978,
      reading_minutes: 12,
      summary:
        "[mock] Talvisodan taustalla olivat Euroopan kiristynyt suurvaltapoliittinen tilanne ja Saksan sekä Neuvostoliiton elokuussa 1939 solmima Molotov–Ribbentrop-sopimus, jonka salaisessa lisäpöytäkirjassa Suomi määriteltiin Neuvostoliiton etupiiriin. Syksyn 1939 tuloksettomien alueluovutusneuvottelujen ja Mainilan laukausten (26.11.1939) jälkeen puna-armeija hyökkäsi Suomeen ilman sodanjulistusta 30. marraskuuta 1939.",
      facts: [
        { label: "Molotov–Ribbentrop", value: "23 Aug 1939" },
        { label: "Mainila incident", value: "26 Nov 1939" },
        { label: "Attack began", value: "30 Nov 1939" },
      ],
      years: [1918, 1920, 1932, 1938, 1939],
      posts: [
        { heading: "Suurvallat Saksa ja Neuvostoliitto", words: 340 },
        { heading: "Suomen ja Neuvostoliiton suhteet", words: 310 },
        { heading: "Suomen ja Saksan suhteet", words: 265 },
        { heading: "Pohjoismainen suuntaus ja puolueettomuus", words: 295 },
        { heading: "Jartsev-neuvottelut Suomessa", words: 380 },
        { heading: "Moskovan neuvottelut Suomen alueesta", words: 490 },
        { heading: "Neuvostoliiton hyökkäysvalmistelut", words: 320 },
        { heading: "Propagandahyökkäys sodan aattopäivinä", words: 268 },
        { heading: "Sotilaallinen ja poliittinen hyökkäys", words: 310 },
      ],
      text: [
        "## Tausta",
        "[mock] Tarton rauhassa 1920 vahvistettu Karjalankannaksen rajalinja kulki Rajajoella vain 32 kilometrin päässä Leningradista. 1930-luvun jälkipuoliskolla Suomi haki turvaa pohjoismaisesta puolueettomuussuuntauksesta, mutta elokuun 23. päivänä 1939 solmittu Molotov–Ribbentrop-sopimus muutti Itämeren turvallisuusjärjestelmän perusteellisesti.",
        "### Suurvallat Saksa ja Neuvostoliitto",
        "[mock] Saksan ja Neuvostoliiton hyökkäämättömyyssopimuksen salainen lisäpöytäkirja jakoi Itä-Euroopan etupiireihin ja sijoitti Suomen, Baltian maat sekä Bessarabian Neuvostoliiton vaikutuspiiriin.",
        "### Jartsev-neuvottelut Suomessa",
        "[mock] Lähetystösihteeri Boris Jartsev esitti jo keväästä 1938 lähtien epävirallisia tunnusteluja Suomenlahden saarten varustamisesta ja Leningradin luoteispuolisen meriväylän turvaamisesta.",
        "### Moskovan neuvottelut Suomen alueesta",
        "[mock] Lokakuussa ja marraskuussa 1939 J. K. Paasikiven ja Väinö Tannerin johtama valtuuskunta neuvotteli kolmesti Moskovassa. Stalin vaati rajan siirtämistä Karjalankannaksella sekä tukikohtaa Hangosta, mihin Suomen hallitus ei puolueettomuuden ja puolustuslinjan vuoksi voinut suostua.",
        "### Propagandahyökkäys sodan aattopäivinä",
        "[mock] Marraskuun 26. päivänä 1939 puna-armeijan tykistö ampui Mainilan rajakylän suuntaan seitsemän laukausta ja syytti välikohtauksesta Suomea. Neuvostoliitto irtisanoi vuoden 1932 hyökkäämättömyyssopimuksen ja käynnisti hyökkäyksen 30.11.1939 samalla kun Otto Wille Kuusisen johtama Terijoen hallitus asetettiin nukkehallitukseksi.",
      ].join("\n\n"),
      history: { added_year: 2003, changes: 14, war_years: [2007, 2014] },
      lanes: { fi: true, sv: 0.88, en: 0.92 },
      branches: [
        { lang: "fi", page_id: 194063, title: "Mainilan laukaukset", reason: "26 Nov 1939 border provocation" },
        { lang: "fi", page_id: 8901, title: "Tarton rauha", reason: "1920 Finno-Soviet border treaty" },
      ],
    },
    {
      no: 2,
      heading: "Joukot",
      words: 320,
      reading_minutes: 2,
      summary:
        "[mock] Sodan syttyessä Suomen kenttäarmeijan vahvuus oli noin 250 000 miestä ja ylipäällikkönä toimi sotamarsalkka C. G. E. Mannerheim, mutta raskasta tykistöä, panssarintorjunta-aseita ja lentokoneita oli erittäin niukasti. Puna-armeija keskitti Suomen rintamalle aluksi yli 425 000 sotilasta, tuhansia panssarivaunuja ja ylivoimaisen ilmavoimien kaluston.",
      facts: [
        { label: "Finnish strength", value: "250,000–340,000" },
        { label: "Soviet strength", value: "425,000–760,000" },
        { label: "Commander-in-Chief", value: "C. G. E. Mannerheim" },
      ],
      years: [1939, 1940],
      posts: [
        { heading: "Suomen puolustusvoimat", words: 165 },
        { heading: "Puna-armeijan hyökkäysjoukot", words: 155 },
      ],
      text: [
        "## Joukot",
        "[mock] Lokakuussa 1939 toimeenpantujen ylimääräisten harjoitusten (YH) ansiosta Suomen kenttäarmeija oli ehtinyt ryhmittyä puolustusasemiin ennen hyökkäyksen alkua.",
        "### Suomen puolustusvoimat",
        "[mock] Ylipäällikkö Mannerheimin alaisuudessa Kannaksen armeijaa komensi kenraaliluutnantti Hugo Österman ja Laatokan Karjalan IV armeijakuntaa kenraalimajuri Woldemar Hägglund. Suurimpana puutteena olivat panssarintorjuntatykit ja tykistön ampumatarvikkeet.",
        "### Puna-armeijan hyökkäysjoukot",
        "[mock] Leningradin sotilaspiirin komentaja Kirill Meretskov johti neljää armeijaa (7., 8., 9. ja 14. armeija), jotka hyökkäsivät Karjalankannakselta aina Petsamoon ulottuvalla rintamalla.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 8, war_years: [2008] },
      lanes: { fi: true, sv: 0.79, en: 0.86 },
      branches: [
        { lang: "fi", page_id: 6021, title: "Carl Gustaf Emil Mannerheim", reason: "Finnish Commander-in-Chief" },
      ],
    },
    {
      no: 3,
      heading: "Suomen torjuntavoitot joulu- ja tammikuussa",
      words: 504,
      reading_minutes: 2,
      summary:
        "[mock] Joulukuussa 1939 Suomen joukot pysäyttivät puna-armeijan läpimurtoyritykset Karjalankannaksen Mannerheim-linjalla sekä löivät neuvostojoukot Tolvajärvellä. Tammikuun alussa 1940 eversti Hjalmar Siilasvuon johtama 9. divisioona tuhosi saarrostustaisteluissa kaksi neuvostodivisioonaa Suomussalmella ja Raatteen tiellä.",
      facts: [
        { label: "Main defense line", value: "Mannerheim-linja" },
        { label: "Tolvajärvi victory", value: "12 Dec 1939" },
        { label: "Raate Road", value: "1–7 Jan 1940" },
      ],
      years: [1939, 1940],
      posts: [
        { heading: "Karjalankannas ja Mannerheim-linja", words: 184 },
        { heading: "Laatokan Karjala ja Tolvajärvi", words: 150 },
        { heading: "Suomussalmi ja Raatteen tie", words: 170 },
      ],
      text: [
        "## Suomen torjuntavoitot joulu- ja tammikuussa",
        "[mock] Suojajoukkotaistelujen jälkeen suomalaiset torjuivat 7. armeijan suoran rintamahyökkäyksen Taipaleessa ja Summassa joulukuun puolivälissä 1939. Samaan aikaan Kannaksen armeijan epäonnistunut vastahyökkäys 23.12. osoitti suomalaisten raskaiden aseiden puutteen.",
        "### Laatokan Karjala ja Tolvajärvi",
        "[mock] Eversti Paavo Talvelan ja everstiluutnantti Aaro Pajarin joukot saavuttivat Tolvajärvellä 12. joulukuuta ensimmäisen merkittävän hyökkäysvoiton, joka vakautti koko Laatokan pohjoispuolisen rintaman ja Kollaanjoen puolustuksen.",
        "### Suomussalmi ja Raatteen tie",
        "[mock] Kainuussa suomalaiset katkaisivat puna-armeijan 163. ja 44. divisioonan huoltoyhteydet, pilkkoivat kolonnat motteihin ja saivat Raatteen tieltä runsaan sotasaaliin.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 11, war_years: [2006, 2007] },
      lanes: { fi: true, sv: 0.84, en: 0.91 },
      branches: [
        { lang: "fi", page_id: 194044, title: "Raatteen tien taistelu", reason: "Motti encirclement victory in Jan 1940" },
        { lang: "fi", page_id: 34207, title: "Mannerheim-linja", reason: "Main Karelian Isthmus fortifications" },
      ],
    },
    {
      no: 4,
      heading: "Puna-armeijan suurhyökkäys helmikuussa",
      words: 663,
      reading_minutes: 3,
      summary:
        "[mock] Tammikuussa 1940 Neuvostoliitto perusti Luoteisrintaman komentajanaan Semjon Timošenko ja keskitti Karjalankannakselle valtavan tykistö- ja panssariylivoiman. Helmikuun 1. päivänä alkanut suurhyökkäys mursi Mannerheim-linjan Lähteen lohkolla Summassa 11.–15. helmikuuta, minkä jälkeen suomalaiset vetäytyivät viivyttäen väliasemaan ja taka-asemaan Viipurin tasalle.",
      facts: [
        { label: "Offensive start", value: "1 Feb 1940" },
        { label: "Summa breakthrough", value: "11–15 Feb 1940" },
        { label: "Vyborg Bay ice", value: "Mar 1940" },
      ],
      years: [1940],
      posts: [
        { heading: "Summan murtuminen ja vetäytyminen väliasemaan", words: 353 },
        { heading: "Viipurinlahden ja taka-aseman taistelut", words: 310 },
      ],
      text: [
        "## Puna-armeijan suurhyökkäys helmikuussa",
        "[mock] Tammikuun aikana puna-armeija uudisti hyökkäystaktiikkansa: jalkaväki, panssarivaunut, pioneerit ja suora-ammuntatykistö harjoittelivat linnoitettujen pesäkkeiden järjestelmällistä tuhoamista.",
        "### Summan murtuminen ja vetäytyminen väliasemaan",
        "[mock] Kymmenen päivän keskeytymättömän tulivalmistelun jälkeen 7. armeija murtautui 11. helmikuuta 1940 Lähteen lohkolla pääpuolustuslinjan läpi, ja Mannerheim antoi 15. helmikuuta luvan vetäytyä väliasemaan.",
        "### Viipurinlahden ja taka-aseman taistelut",
        "[mock] Maaliskuun alussa taistelut siirtyivät taka-asemaan, Viipurin esikaupunkeihin ja jäätyneelle Viipurinlahdelle, missä suomalaiset estivät rintaman murtumisen rauhantekoon saakka.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 9, war_years: [2008] },
      lanes: { fi: true, sv: 0.81, en: 0.89 },
      branches: [
        { lang: "fi", page_id: 194065, title: "Kollaan taistelu", reason: "Kollaa front held through March 1940" },
      ],
    },
    {
      no: 5,
      heading: "Moskovan rauha",
      words: 842,
      reading_minutes: 4,
      summary:
        "[mock] Ruotsin välityksellä käynnistyneet rauhantunnustelut johtivat pääministeri Risto Rytin johtaman valtuuskunnan matkaan Moskovaan maaliskuussa 1940. Moskovan rauhansopimus allekirjoitettiin 12. maaliskuuta 1940 myöhään illalla ja taistelut päättyivät 13. maaliskuuta klo 11, jolloin Suomi säilytti itsenäisyytensä mutta joutui luovuttamaan laajoja raja-alueita.",
      facts: [
        { label: "Signed", value: "12 Mar 1940" },
        { label: "Ceasefire", value: "13 Mar 1940 at 11:00" },
        { label: "Territory ceded", value: "11% of Finland" },
      ],
      years: [1940],
      posts: [
        { heading: "Rauhanneuvottelut ja ulkovaltojen interventiosuunnitelmat", words: 432 },
        { heading: "Rauhansopimuksen ehdot", words: 410 },
      ],
      text: [
        "## Moskovan rauha",
        "[mock] Tammikuun lopussa 1940 Neuvostoliitto luopui Terijoen hallituksesta ja ilmoitti Tukholman-lähettiläs Aleksandra Kollontain kautta olevansa valmis neuvottelemaan Rytin–Tannerin hallituksen kanssa.",
        "### Rauhanneuvottelut ja ulkovaltojen interventiosuunnitelmat",
        "[mock] Ranska ja Iso-Britannia tarjosivat sotilaallista apuretkikuntaa Pohjois-Ruotsin ja Norjan kautta, mutta ylipäällikkö Mannerheimin rintama-arvion perusteella hallitus katsoi avun saapuvan liian myöhään ja päätti hyväksyä Moskovan raskaat rauhanehdot.",
        "### Rauhansopimuksen ehdot",
        "[mock] Rauhansopimus allekirjoitettiin 12.3.1940. Suomi luovutti Karjalankannaksen, Viipurin, Laatokan Karjalan, Suomenlahden ulkosaaret sekä osia Sallasta ja Kuusamosta ja vuokrasi Hangon laivastotukikohdaksi 30 vuodeksi.",
      ].join("\n\n"),
      history: { added_year: 2003, changes: 12, war_years: [2007, 2014] },
      lanes: { fi: true, sv: 0.90, en: 0.94 },
      branches: [
        { lang: "fi", page_id: 52097, title: "Moskovan rauhansopimus (1940)", reason: "Full Moscow Peace Treaty article" },
        { lang: "fi", page_id: 194047, title: "Risto Ryti", reason: "Prime Minister and chief peace negotiator" },
      ],
    },
    {
      no: 6,
      heading: "Osapuolten heikkoudet ja vahvuudet",
      words: 761,
      reading_minutes: 3,
      summary:
        "[mock] Puna-armeijan toimintaa vaikeuttivat sodan alkuvaiheessa Stalinin upseeripuhdistusten jälkeinen jäykkä johtamisjärjestelmä, tieverkoston kapeus ja puutteellinen talvivarustus. Suomen armeijan vahvuuksia olivat paikallistuntemus, hiihtojoukkojen liikkuvuus, mottitaktiikka sekä korkea puolustustahto, vaikka ammus- ja kalustopula kiristyi sodan loppuvaiheessa äärimmilleen.",
      facts: [
        { label: "Finnish tactic", value: "Motti encirclement" },
        { label: "Winter cold", value: "-30 °C to -43 °C" },
        { label: "Critical deficit", value: "Artillery ammunition" },
      ],
      years: [1939, 1940],
      posts: [
        { heading: "Puna-armeijan talvisodankäynnin haasteet", words: 390 },
        { heading: "Suomen armeijan mottitaktiikka ja maastokelpoisuus", words: 371 },
      ],
      text: [
        "## Osapuolten heikkoudet ja vahvuudet",
        "[mock] Talvisota käytiin poikkeuksellisen ankarassa pakkastalvessa, jossa lämpötila laski tammi–helmikuussa 1940 useilla rintamalohkoilla alle −40 celsiusasteen.",
        "### Puna-armeijan talvisodankäynnin haasteet",
        "[mock] Mekanisoidut neuvostodivisioonat olivat sidottuja harvoihin teihin, ja vuosien 1937–1938 upseeripuhdistukset heikensivät yhtymien aloitekykyä ja aselajien yhteistoimintaa joulukuun hyökkäyksissä.",
        "### Suomen armeijan mottitaktiikka ja maastokelpoisuus",
        "[mock] Suomalaiset hyödynsivät metsämaastoa, suksia, kamiinatelttoja ja tilapäisiä panssarintorjuntavälineitä kuten polttopulloja eristäen viholliskolonnat huollosta.",
      ].join("\n\n"),
      history: { added_year: 2006, changes: 7, war_years: [2008] },
      lanes: { fi: true, sv: 0.72, en: 0.85 },
      branches: [
        { lang: "fi", page_id: 194045, title: "Simo Häyhä", reason: "Finnish winter infantry & sniper tactics" },
      ],
    },
    {
      no: 7,
      heading: "Talvisodan sotatalous Suomessa",
      words: 163,
      reading_minutes: 1,
      summary:
        "[mock] Sotatalous perustui syksyllä 1939 käynnistettyyn elintarvikkeiden ja polttoaineiden säännöstelyyn sekä kotirintaman tuotannon uudelleensuuntaamiseen. Puolustusmenot rahoitettiin valtion puolustuslainoilla, veronkorotuksilla, ulkomaisilla luotoilla ja Suomen Pankin setelirahoituksella.",
      facts: [
        { label: "Rationing", value: "Oct 1939 onward" },
        { label: "Financing", value: "Defense bonds & central bank" },
      ],
      years: [1939, 1940],
      posts: [],
      text: [
        "## Talvisodan sotatalous Suomessa",
        "[mock] Säännöstelyjärjestelmä otettiin käyttöön jo lokakuussa 1939 sokerin ja kahvin osalta. Naisten ja nuorten työpanos teollisuudessa, maataloudessa ja Lotta Svärd -järjestössä piti yhteiskunnan perustoiminnot käynnissä kenttäarmeijan mobilisaation aikana.",
      ].join("\n\n"),
      history: { added_year: 2009, changes: 4, war_years: [] },
      lanes: { fi: true, sv: null, en: 0.64 },
      branches: [
        { lang: "fi", page_id: 194049, title: "Väinö Tanner", reason: "Wartime cabinet & economic mobilization" },
      ],
    },
    {
      no: 8,
      heading: "Osapuolten tappiot",
      words: 345,
      reading_minutes: 2,
      summary:
        "[mock] Kansallisarkiston menehtyneiden tietokannan mukaan talvisodassa kaatui, katosi tai kuoli haavoihinsa 25 904 suomalaista sotilasta, ja haavoittuneita oli 43 557; lisäksi ilmapommituksissa kuoli noin tuhat siviiliä. Neuvostoliiton arkistolähteisiin perustuvien tutkimusten mukaan puna-armeijan kaatuneiden ja kadonneiden määrä oli 126 875–167 976 sotilasta.",
      facts: [
        { label: "Finnish dead/missing", value: "25,904 soldiers" },
        { label: "Finnish wounded", value: "43,557 soldiers" },
        { label: "Soviet dead/missing", value: "126,875–167,976" },
      ],
      years: [1939, 1940],
      posts: [
        { heading: "Suomen tappiot", words: 175 },
        { heading: "Neuvostoliiton tappiot", words: 170 },
      ],
      text: [
        "## Osapuolten tappiot",
        "[mock] Talvisodan 105 päivää vaativat raskaat henkilö- ja kalustotappiot molemmilta osapuolilta, erityisesti helmikuun ja maaliskuun 1940 suurtaisteluissa Karjalankannaksella.",
        "### Suomen tappiot",
        "[mock] Suomen puolustusvoimien tappiot olivat 25 904 kuollutta tai kadonnutta ja 43 557 haavoittunutta. Kotirintaman ilmapommituksissa menehtyi 957–1 029 siviiliä.",
        "### Neuvostoliiton tappiot",
        "[mock] Neuvostoliitto ilmoitti vuonna 1940 kaatuneiksi 48 745 miestä, mutta 1990-luvulla avattujen venäläisten arkistojen nimilistojen perusteella kuolleita ja kadonneita oli 126 875–167 976 ja haavoittuneita tai paleltuneita yli 260 000.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 15, war_years: [2007, 2014, 2022] },
      lanes: { fi: true, sv: 0.87, en: 0.93 },
      branches: [
        { lang: "fi", page_id: 194064, title: "Suomussalmen taistelu", reason: "Heavy divisional losses on the northern front" },
      ],
    },
    {
      no: 9,
      heading: "Alueluovutukset ja väestön uudelleensijoitus",
      words: 63,
      reading_minutes: 1,
      summary:
        "[mock] Moskovan rauhassa luovutetuilta alueilta evakuoitiin kaikkiaan noin 422 000 ihmistä eli lähes 12 prosenttia Suomen väestöstä. Siirtoväen asuttamista varten säädettiin kesällä 1940 pika-asutuslaki.",
      facts: [
        { label: "Evacuees", value: "422,000 Karelians" },
        { label: "Population share", value: "~12% of Finland" },
      ],
      years: [1940],
      posts: [],
      text: [
        "## Alueluovutukset ja väestön uudelleensijoitus",
        "[mock] Luovutettujen alueiden koko väestö – noin 422 000 henkeä Karjalasta, Sallasta, Kuusamosta ja Hangosta – siirtyi muualle Suomeen, missä heille muodostettiin uusia tiloja pika-asutuslain nojalla.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 5, war_years: [] },
      lanes: { fi: true, sv: 0.78, en: 0.83 },
      branches: [
        { lang: "fi", page_id: 218476, title: "Siirtoväki", reason: "422,000 Karelian evacuees" },
        { lang: "fi", page_id: 194042, title: "Luovutettu Karjala", reason: "Ceded Karelian municipalities" },
      ],
    },
    {
      no: 10,
      heading: "Ulkomaiden roolit ja apu",
      words: 399,
      reading_minutes: 2,
      summary:
        "[mock] Kansainliitto erotti Neuvostoliiton järjestöstä 14. joulukuuta 1939 hyökkäyksen johdosta, ja Suomi sai laajaa kansainvälistä myötätuntoa. Merkittävin suora apu saatiin Ruotsista, josta saapui yli 8 700 vapaaehtoista (Svenska Frivilligkåren), lentolaivue F 19 sekä runsaasti aseita, ammuksia ja humanitaarista tukea.",
      facts: [
        { label: "League of Nations", value: "USSR expelled 14 Dec 1939" },
        { label: "Swedish volunteers", value: "~8,760 men (SFK)" },
        { label: "Total volunteers", value: "~11,660 foreign men" },
      ],
      years: [1939, 1940],
      posts: [
        { heading: "Ruotsin vapaaehtoiset ja materiaaliapu", words: 210 },
        { heading: "Ranskan ja Ison-Britannian interventiosuunnitelma", words: 189 },
      ],
      text: [
        "## Ulkomaiden roolit ja apu",
        "[mock] Ulkomaisia vapaaehtoisia saapui Suomeen yhteensä noin 11 660 miestä, joista valtaosa Ruotsista, Tanskasta, Norjasta, Unkarista ja amerikan-suomalaisten keskuudesta.",
        "### Ruotsin vapaaehtoiset ja materiaaliapu",
        "[mock] Svenska Frivilligkåren otti helmikuun lopulla 1940 rintamavastuun Sallan suunnalla ja ruotsalainen lentorykmentti F 19 vastasi Pohjois-Suomen ilmapuolustuksesta.",
        "### Ranskan ja Ison-Britannian interventiosuunnitelma",
        "[mock] Länsiliittoutuneiden suunnitteleman retkikunnan strategisena päätavoitteena oli Pohjois-Ruotsin rautamalmikenttien haltuunotto Saksan sotatalouden heikentämiseksi.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 7, war_years: [] },
      lanes: { fi: true, sv: 0.91, en: 0.88 },
      branches: [
        { lang: "fi", page_id: 194048, title: "Kyösti Kallio", reason: "Wartime President and appeals for foreign aid" },
      ],
    },
    {
      no: 11,
      heading: "Talvisodan seurauksista ja merkityksestä",
      words: 761,
      reading_minutes: 3,
      summary:
        "[mock] Talvisodassa Suomi torjui miehityksen ja säilytti demokraattisen yhteiskuntajärjestyksensä, ja yhteinen puolustustaistelu synnytti sisällissodan jakolinjoja kurovan 'talvisodan hengen'. Raskaat alueluovutukset ja Neuvostoliiton jatkuva painostus välirauhan (1940–1941) aikana johtivat kuitenkin siihen, että Suomi haki turvaa Saksasta ennen jatkosodan syttymistä kesäkuussa 1941.",
      facts: [
        { label: "National unity", value: "Talvisodan henki" },
        { label: "Interim Peace", value: "Mar 1940 – Jun 1941" },
        { label: "Next conflict", value: "Continuation War (1941)" },
      ],
      years: [1918, 1939, 1940, 1941],
      posts: [
        { heading: "Talvisodan henki ja kansallinen eheytyminen", words: 381 },
        { heading: "Tie välirauhaan ja jatkosotaan", words: 380 },
      ],
      text: [
        "## Talvisodan seurauksista ja merkityksestä",
        "[mock] Talvisota osoitti sekä Neuvostoliitolle että muulle maailmalle, että Suomen miehittäminen vaatisi suhteettoman suuren sotilaallisen panoksen.",
        "### Talvisodan henki ja kansallinen eheytyminen",
        "[mock] Vuoden 1918 sisällissodan jättämä poliittinen kuilu kaventui ratkaisevasti, kun työväenliike ja porvarilliset piirit puolustivat yhdessä maan itsenäisyyttä; tammikuun kihlaus (1940) vahvisti työmarkkinajärjestöjen keskinäisen tunnustamisen.",
        "### Tie välirauhaan ja jatkosotaan",
        "[mock] Moskovan rauhaa seurannut 15 kuukauden välirauha koettiin Suomessa epävarmaksi aselevoksi, mikä johti sotilaalliseen lähentymiseen Saksan kanssa syksystä 1940 alkaen.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 10, war_years: [2018] },
      lanes: { fi: true, sv: 0.76, en: 0.84 },
      branches: [
        { lang: "fi", page_id: 194041, title: "Välirauha", reason: "15-month Interim Peace (1940–1941)" },
        { lang: "fi", page_id: 440, title: "Jatkosota", reason: "Continuation War (1941–1944)" },
      ],
    },
    {
      no: 12,
      heading: "Kunniamerkit",
      words: 38,
      reading_minutes: 1,
      summary:
        "[mock] Talvisodan taisteluihin ja kotirintaman maanpuolustustyöhön osallistuneille myönnettiin Talvisodan muistomitali, jonka soljet osoittivat rintamalohkon tai aselajin. Myös ulkomaalaisille vapaaehtoisille lyötiin erikoismitaleita.",
      facts: [
        { label: "Medal", value: "Talvisodan muistomitali" },
      ],
      years: [],
      posts: [],
      text: [
        "## Kunniamerkit",
        "[mock] Talvisodan muistomitali jaettiin kaikille sotaan osallistuneille sotilaille ja kotirintaman maanpuolustustehtävissä palvelleille, usein miekkojen ja rintamasoljen (esim. Summa, Taipale, Suomussalmi, Kollaa) kera.",
      ].join("\n\n"),
      history: { added_year: 2008, changes: 2, war_years: [] },
      lanes: { fi: true, sv: null, en: null },
      branches: [],
    },
    {
      no: 13,
      heading: "Talvisota taiteessa ja viihteessä",
      words: 117,
      reading_minutes: 1,
      summary:
        "[mock] Talvisotaa on käsitelty laajasti suomalaisessa kirjallisuudessa ja elokuvassa, tunnetuimpina Antti Tuurin romaani Talvisota (1985) ja Pekka Parikan ohjaama samanniminen elokuva (1989). Myös Erkki Tiesmaan ja Aarne Nopsasen sotavalokuvat ovat muokanneet sodan visuaalista muistia.",
      facts: [
        { label: "Novel (1985)", value: "Antti Tuuri: Talvisota" },
        { label: "Film (1989)", value: "Pekka Parikka: Talvisota" },
      ],
      years: [1985, 1989],
      posts: [],
      text: [
        "## Talvisota taiteessa ja viihteessä",
        "[mock] Talvisotaa kuvaavista teoksista keskeisimpiä ovat Yrjö Jylhän runokokoelma Kiirastuli (1941), Antti Tuurin dokumenttiromaani Talvisota (1985) sekä Pekka Parikan ohjaama suur-elokuva Talvisota (1989).",
      ].join("\n\n"),
      history: { added_year: 2007, changes: 4, war_years: [] },
      lanes: { fi: true, sv: 0.62, en: 0.71 },
      branches: [],
    },
  ],
  ghost_stations: [
    {
      after_no: 5,
      heading: "Arviot Neuvostoliiton lopullisista tavoitteista",
      from_year: 2007,
      removed_year: 2015,
      text: "[mock] Tässä jaksossa käsiteltiin vuosina 2007–2015 kiisteltyä tulkintaa siitä, pyrkikö Neuvostoliitto koko Suomen välittömään miehitykseen vielä maaliskuussa 1940 vai tyytyikö se strategisiin rajasiirtoihin Leningradin suojaksi ennen länsivaltojen väliintulouhkaa.",
    },
  ],
};

export const SISALLISSOTA_ROAD_FIXTURE = {
  article: {
    lang: "fi",
    page_id: 1150,
    wikidata_id: "Q211855",
    title: "Suomen sisällissota",
    url: "https://fi.wikipedia.org/wiki/Suomen_sis%C3%A4llissota",
    words: 13399,
    reading_minutes: 56,
    has_history: true,
  },
  stations: [
    {
      no: 1,
      heading: "Sodan nimitykset",
      words: 163,
      reading_minutes: 1,
      summary:
        "[mock] Vuoden 1918 sodasta on käytetty Suomessa poliittisesta näkökulmasta ja aikakaudesta riippuen useita eri nimityksiä, kuten vapaussota, luokkasota, punakapina, kansalaissota ja veljessota. Nykyisessä historiantutkimuksessa vakiintunut ja neutraali yleisnimitys on Suomen sisällissota.",
      facts: [
        { label: "Standard term", value: "Suomen sisällissota" },
        { label: "Historical names", value: "Vapaussota, kansalaissota" },
      ],
      years: [1918],
      posts: [],
      text: [
        "## Sodan nimitykset",
        "[mock] Sodan voittanut valkoinen osapuoli kutsui konfliktia vapaussodaksi ja kapinaksi, kun taas hävinnyt punainen osapuoli puhui luokkasodasta ja vallankumouksesta. 1960-luvulta lähtien kansalaissota ja myöhemmin sisällissota vakiintuivat tutkimuskäyttöön.",
      ].join("\n\n"),
      history: { added_year: 2003, changes: 11, war_years: [2005, 2006, 2008] },
      lanes: { fi: true, sv: 0.85, en: 0.88 },
      branches: [],
    },
    {
      no: 2,
      heading: "Sodan juuret",
      words: 671,
      reading_minutes: 3,
      summary:
        "[mock] Sisällissodan pitkän aikavälin juuret ulottuivat 1800-luvun lopun teollistumiseen, maaseudun tilattoman väestön kasvuun ja sääty-yhteiskunnan murrokseen. Venäjän sortokaudet (1899–1905 ja 1908–1917), vuoden 1905 suurlakko ja vuoden 1906 eduskuntauudistus nostivat työväenliikkeen suurimmaksi poliittiseksi voimaksi, mutta yhteiskunnalliset uudistukset pysähtyivät keisarin hajottaessa eduskunnan toistuvasti.",
      facts: [
        { label: "General strike", value: "Nov 1905" },
        { label: "Parliament reform", value: "1906 unicameral" },
      ],
      years: [1899, 1905, 1906],
      posts: [
        { heading: "Sääty-yhteiskunnan murros ja teollistuminen", words: 340 },
        { heading: "Sortokaudet ja poliittinen polarisaatio", words: 331 },
      ],
      text: [
        "## Sodan juuret",
        "[mock] Suomi muuttui 1800-luvun jälkipuoliskolla nopeasti agraarisesta sääty-yhteiskunnasta teollistuvaksi kansalaisyhteiskunnaksi, mutta torpparikysymys ja kunnallisen äänioikeuden epätasa-arvo ylläpitivät jännitteitä.",
        "### Sääty-yhteiskunnan murros ja teollistuminen",
        "[mock] Metsäteollisuuden ja kaupungistumisen myötä syntyi järjestäytynyt työväestö, kun taas maaseudulla torpparit ja mäkitupalaiset vaativat vuokraehtojen turvaamista.",
        "### Sortokaudet ja poliittinen polarisaatio",
        "[mock] Vuoden 1905 suurlakon yhteydessä perustettiin ensimmäiset punakaartit ja suojeluskuntien edeltäjät, ja Hakaniemen mellakka 1906 antoi esimakua aseellisesta vastakkainasettelusta.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 8, war_years: [] },
      lanes: { fi: true, sv: 0.79, en: 0.84 },
      branches: [
        { lang: "fi", page_id: 194059, title: "Suurlakko 1905", reason: "1905 general strike and civic guards" },
        { lang: "fi", page_id: 194060, title: "Eduskuntauudistus 1906", reason: "1906 Parliament Act and universal suffrage" },
      ],
    },
    {
      no: 3,
      heading: "Sotaa edeltäneet tapahtumat",
      words: 4000,
      reading_minutes: 17,
      summary:
        "[mock] Venäjän maaliskuun vallankumous 1917 romahdutti keisarivallan sekä poliisi- ja järjestysvallan Suomessa, mikä synnytti valtatyhjiön ja kiihtyvän elintarvikepulan. Valtalain kaatuminen, eduskunnan hajottaminen ja marraskuun 1917 yleislakko syvensivät kuilua porvarillisen senaatin ja radikalisoituvien punakaartien välillä, eikä joulukuun 6. päivän itsenäisyysjulistus enää kyennyt pysäyttämään kilpavarustelua.",
      facts: [
        { label: "Power Act", value: "18 Jul 1917 (Valtalaki)" },
        { label: "General strike", value: "14–20 Nov 1917" },
        { label: "Independence", value: "6 Dec 1917" },
      ],
      years: [1917, 1918],
      posts: [
        { heading: "Helmikuun vallankumous ja Tokoin senaatti", words: 1120 },
        { heading: "Valtalaki ja eduskunnan hajottaminen", words: 980 },
        { heading: "Marraskuun yleislakko ja järjestyskaartit", words: 1050 },
        { heading: "Itsenäistyminen ja aseistautuminen", words: 850 },
      ],
      text: [
        "## Sotaa edeltäneet tapahtumat",
        "[mock] Vuosi 1917 oli Suomessa poliittisen murroksen, lakkojen ja järjestysvallan hajoamisen aikaa.",
        "### Helmikuun vallankumous ja Tokoin senaatti",
        "[mock] Oskari Tokoin johtama koalitiosenaatti pyrki keväällä 1917 vakauttamaan olot, mutta venäläisen sotaväen kurittomuus ja elintarvikepula kärjistivät paikallisia yhteenottoja.",
        "### Valtalaki ja eduskunnan hajottaminen",
        "[mock] SDP:n enemmistöllä hyväksytty valtalaki kaatui, kun Venäjän väliaikainen hallitus hajotti eduskunnan porvaripuolueiden myötävaikutuksella, ja lokakuun vaaleissa SDP menetti ehdottoman enemmistönsä.",
        "### Marraskuun yleislakko ja järjestyskaartit",
        "[mock] Marraskuun 1917 yleislakon aikana työväen järjestyskaartit käyttivät valtaa Etelä-Suomen kaupungeissa ja väkivaltaisuuksissa sai surmansa yli kolmekymmentä ihmistä.",
        "### Itsenäistyminen ja aseistautuminen",
        "[mock] P. E. Svinhufvudin senaatti antoi itsenäisyysjulistuksen 6.12.1917 ja julisti tammikuussa 1918 suojeluskunnat hallituksen virallisiksi joukoiksi, mikä johti avoimeen yhteenottoon Viipurissa ja Pohjanmaalla.",
      ].join("\n\n"),
      history: { added_year: 2003, changes: 16, war_years: [2006, 2007] },
      lanes: { fi: true, sv: 0.83, en: 0.90 },
      branches: [
        { lang: "fi", page_id: 162670, title: "Suomen itsenäisyysjulistus", reason: "Declaration of Independence (6 Dec 1917)" },
        { lang: "fi", page_id: 11444, title: "P. E. Svinhufvud", reason: "Chairman of the Independence Senate" },
      ],
    },
    {
      no: 4,
      heading: "Sodan osapuolten tavoitteita",
      words: 858,
      reading_minutes: 4,
      summary:
        "[mock] Valkoinen Suomi ja Vaasaan siirtynyt senaatti pyrkivät palauttamaan laillisen yhteiskuntajärjestyksen, karkottamaan maassa olleet venäläiset joukot ja turvaamaan porvarillisen valtiomuodon. Helsingissä valtaan noussut Suomen kansanvaltuuskunta tavoitteli demokraattis-sosialistista työläistasavaltaa ja laajoja yhteiskunnallisia uudistuksia.",
      facts: [
        { label: "White capital", value: "Vaasa Senate" },
        { label: "Red capital", value: "Helsinki (Kansanvaltuuskunta)" },
      ],
      years: [1918],
      posts: [
        { heading: "Valkoisen Suomen ja Vaasan senaatin päämäärät", words: 430 },
        { heading: "Kansanvaltuuskunnan ja punaisen Suomen tavoitteet", words: 428 },
      ],
      text: [
        "## Sodan osapuolten tavoitteita",
        "[mock] Maa jakautui tammikuun lopussa 1918 teollistuneeseen punaiseen Etelä-Suomeen ja maatalousvaltaiseen valkoiseen Keski- ja Pohjois-Suomeen.",
        "### Valkoisen Suomen ja Vaasan senaatin päämäärät",
        "[mock] Vaasan senaatti tukeutui suojeluskuntiin, helmikuussa kutsuttuihin asevelvollisiin ja Saksassa koulutettuihin jääkäreihin, jotka saapuivat Vaasaan 25. helmikuuta 1918.",
        "### Kansanvaltuuskunnan ja punaisen Suomen tavoitteet",
        "[mock] Kullervo Mannerin johtama kansanvaltuuskunta julkaisi helmikuussa 1918 valtiosääntöehdotuksen, joka korosti eduskuntavaltaa, kansanäänestyksiä ja torpparien vapauttamista.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 12, war_years: [2006, 2008] },
      lanes: { fi: true, sv: 0.77, en: 0.82 },
      branches: [
        { lang: "fi", page_id: 194054, title: "Punakaarti", reason: "Red Guards organization and command" },
        { lang: "fi", page_id: 194055, title: "Suojeluskuntajärjestö", reason: "White Civil Guard forces" },
      ],
    },
    {
      no: 5,
      heading: "Sodan kulku",
      words: 4500,
      reading_minutes: 19,
      summary:
        "[mock] Sota alkoi 27.–28. tammikuuta 1918, kun punakaartit ottivat vallan Helsingissä ja kenraali Mannerheimin johtamat suojeluskunnat riisuivat venäläiset varuskunnat aseista Pohjanmaalla. Maaliskuun puolivälissä alkanut valkoisten suurhyökkäys ratkaisi sodan Tampereen taistelussa (6.4.1918), minkä jälkeen kenraalimajuri Rüdiger von der Goltzin saksalainen Itämeren-divisioona valtasi Helsingin ja valkoiset Viipurin.",
      facts: [
        { label: "War dates", value: "27 Jan – 15 May 1918" },
        { label: "Battle of Tampere", value: "16 Mar – 6 Apr 1918" },
        { label: "German landing", value: "3 Apr 1918 (Hanko)" },
      ],
      years: [1918],
      posts: [
        { heading: "Rintamalinjan muodostuminen ja aseidenriisunta Pohjanmaalla", words: 920 },
        { heading: "Punaisen hyökkäysvaihe helmikuussa ja maaliskuussa", words: 960 },
        { heading: "Tampereen suurtaistelu", words: 1120 },
        { heading: "Itämeren-divisioonan maihinnousu ja Helsingin valtaus", words: 780 },
        { heading: "Viipurin taistelu ja sodan päättyminen", words: 720 },
      ],
      text: [
        "## Sodan kulku",
        "[mock] Rintamalinja vakiintui helmikuun 1918 alussa linjalle Pori–Ikaalinen–Vilppula–Heinola–Lappeenranta–Rautu.",
        "### Rintamalinjan muodostuminen ja aseidenriisunta Pohjanmaalla",
        "[mock] Mannerheimin joukot varmistivat muutamassa päivässä Pohjanmaan rautatiet ja asevarikot, kun taas punaiset saivat haltuunsa Etelä-Suomen teollisuuskeskukset.",
        "### Tampereen suurtaistelu",
        "[mock] Maaliskuussa 1918 valkoiset saartoivat punaisen Suomen sotilaallisen keskuksen Tampereen. Kalevankankaan verisen taistelun ja kiivaiden korttelitaistelujen jälkeen Tampere antautui 6. huhtikuuta.",
        "### Itämeren-divisioonan maihinnousu ja Helsingin valtaus",
        "[mock] Saksan Itämeren-divisioona nousi maihin Hangossa 3.4. ja valtasi Helsingin 12.–13. huhtikuuta, ja punaisten viimeiset suuret osastot antautuivat Lahden–Kosken alueella sekä Viipurissa huhti–toukokuun vaihteessa.",
      ].join("\n\n"),
      history: { added_year: 2003, changes: 19, war_years: [2006, 2007, 2018] },
      lanes: { fi: true, sv: 0.89, en: 0.94 },
      branches: [
        { lang: "fi", page_id: 194053, title: "Tampereen taistelu 1918", reason: "Decisive battle of the Finnish Civil War" },
        { lang: "fi", page_id: 6021, title: "Carl Gustaf Emil Mannerheim", reason: "Commander of the White Army" },
      ],
    },
    {
      no: 6,
      heading: "Sodanjälkeiset tapahtumat",
      words: 1420,
      reading_minutes: 6,
      summary:
        "[mock] Sodan päätyttyä toukokuussa 1918 vankileireille koottiin noin 80 000 punaista vankia, joista yli 12 000 menehtyi nälkään, kulkutauteihin ja teloituksiin kesän ja syksyn 1918 aikana. Saksan keisarikunnan tappio ensimmäisessä maailmansodassa marraskuussa 1918 kaatoi suomalaisen monarkiahankkeen, ja K. J. Ståhlbergin johdolla Suomi sääti tasavaltalaisen hallitusmuodon heinäkuussa 1919.",
      facts: [
        { label: "Prisoners held", value: "~80,000 Red prisoners" },
        { label: "Camp mortality", value: "~12,500–13,500 deaths" },
        { label: "Republic Act", value: "17 Jul 1919" },
      ],
      years: [1918, 1919],
      posts: [
        { heading: "Vankileirit ja valtiorikosoikeudet", words: 740 },
        { heading: "Monarkiahanke ja tasavaltalainen hallitusmuoto", words: 680 },
      ],
      text: [
        "## Sodanjälkeiset tapahtumat",
        "[mock] Kevään ja kesän 1918 aikana Tammisaaren, Hämeenlinnan, Hennalan, Suomenlinnan ja Viipurin vankileireillä kuolleisuus kohosi katastrofaaliseksi elintarvikepulan ja espanjantaudin vuoksi.",
        "### Vankileirit ja valtiorikosoikeudet",
        "[mock] Valtiorikosoikeudet käsittelivät yli 75 000 syytetyn tapaukset, mutta syksystä 1918 alkaen valtionhoitaja Svinhufvud ja myöhemmin presidentti Ståhlberg myönsivät laajoja armahduksia.",
        "### Monarkiahanke ja tasavaltalainen hallitusmuoto",
        "[mock] Hessenin prinssi Friedrich Karlin valinta Suomen kuninkaaksi raukesi Saksan romahdukseen, ja maaliskuun 1919 eduskuntavaalien jälkeen säädettiin tasavaltalainen hallitusmuoto sekä torpparivapautuslaki.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 13, war_years: [2007, 2018] },
      lanes: { fi: true, sv: 0.82, en: 0.87 },
      branches: [
        { lang: "fi", page_id: 7650, title: "K. J. Ståhlberg", reason: "First President and 1919 Constitution architect" },
      ],
    },
    {
      no: 7,
      heading: "Spekulaatio sodan toteutumattomista vaihtoehtoisista lopputuloksista",
      words: 353,
      reading_minutes: 2,
      summary:
        "[mock] Historiantutkijat ovat arvioineet, että punaisten voitto olisi todennäköisesti johtanut läheiseen liittosuhteeseen tai liittämiseen Neuvosto-Venäjään sekä uuteen yhteenottoon Saksan kanssa. Toisaalta ilman Saksan väliintuloa sota olisi saattanut pitkittyä kuluttavaksi asemasodaksi Etelä-Suomessa.",
      facts: [
        { label: "Perspective", value: "Counterfactual historiography" },
      ],
      years: [],
      posts: [],
      text: [
        "## Spekulaatio sodan toteutumattomista vaihtoehtoisista lopputuloksista",
        "[mock] Kontrafaktuaalisessa keskustelussa on pohdittu yhtäältä kansanvaltuuskunnan valtiosääntöluonnoksen demokraattisuutta ja toisaalta bolševikkien kasvavaa vaikutusvaltaa rajan takana.",
      ].join("\n\n"),
      history: { added_year: 2008, changes: 6, war_years: [2008] },
      lanes: { fi: true, sv: null, en: 0.65 },
      branches: [],
    },
    {
      no: 8,
      heading: "Sodan uhrit",
      words: 420,
      reading_minutes: 2,
      summary:
        "[mock] Valtioneuvoston asettaman Suomen sotasurmat 1914–1922 -tutkimushankkeen mukaan sisällissodassa ja sen jälkiselvittelyissä menehtyi yhteensä noin 36 640 ihmistä. Kuolleista noin 27 000 kuului punaiseen osapuoleen, 5 100 valkoiseen osapuoleen ja loput olivat poliittisesti sitoutumattomia tai ulkomaalaisia.",
      facts: [
        { label: "Total fatalities", value: "~36,640 people" },
        { label: "Red fatalities", value: "~27,088 people" },
        { label: "White fatalities", value: "~5,179 people" },
      ],
      years: [1918, 1998, 2004],
      posts: [
        { heading: "Sotasurmatutkimus ja uhriluvut", words: 420 },
      ],
      text: [
        "## Sodan uhrit",
        "[mock] Vuosina 1998–2004 toteutettu Suomen sotasurmat -arkistohanke kokosi nimikohtaisen tietokannan kaikista sodan uhreista.",
        "### Sotasurmatutkimus ja uhriluvut",
        "[mock] Taisteluissa kaatui noin 9 300 henkeä, punaisessa ja valkoisessa terrorissa teloitettiin tai murhattiin noin 11 600 henkeä, ja vankileireillä menehtyi yli 13 400 henkeä.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 14, war_years: [2006, 2007, 2018] },
      lanes: { fi: true, sv: 0.88, en: 0.91 },
      branches: [],
    },
    {
      no: 9,
      heading: "Sisällissodan veteraanit",
      words: 69,
      reading_minutes: 1,
      summary:
        "[mock] Valkoisen puolen rintamamiehet järjestäytyivät Vapaussodan Rintamamiesliittoon, kun taas punaisten invalidien ja leskien huolto jäi pitkään työväenjärjestöjen avustuskassojen varaan. Vasta talvisodan jälkeen 1940-luvulla valtiollinen sotilasvammahuolto ulotettiin koskemaan molempien osapuolten invalideja.",
      facts: [
        { label: "Equal pension", value: "Extended in 1940s" },
      ],
      years: [1918, 1939],
      posts: [],
      text: [
        "## Sisällissodan veteraanit",
        "[mock] Sisällissodan veteraanien ja sotaorpojen aseman tasa-arvoistaminen eteni vaiheittain Väinö Tannerin johtaman SDP:n vähemmistöhallituksen (1926–1927) ja punamultayhteistyön (1937) myötä.",
      ].join("\n\n"),
      history: { added_year: 2009, changes: 3, war_years: [] },
      lanes: { fi: true, sv: null, en: null },
      branches: [
        { lang: "fi", page_id: 194050, title: "Miina Sillanpää", reason: "First female minister & social welfare reform" },
      ],
    },
    {
      no: 10,
      heading: "Kunniamerkit",
      words: 81,
      reading_minutes: 1,
      summary:
        "[mock] Vaasan senaatti perusti 4. maaliskuuta 1918 kenraali Mannerheimin aloitteesta Vapaudenristin ritarikunnan, jonka merkit suunnitteli Akseli Gallen-Kallela. Lisäksi sotaan osallistuneille jaettiin Vapaussodan muistomitali.",
      facts: [
        { label: "Order", value: "Vapaudenristin ritarikunta" },
      ],
      years: [],
      posts: [],
      text: [
        "## Kunniamerkit",
        "[mock] Vapaudenristin ritarikunnan kunniamerkeistä ja Vapaudenmitalista muodostui myöhemmin myös talvi- ja jatkosodan keskeinen palkitsemisjärjestelmä.",
      ].join("\n\n"),
      history: { added_year: 2008, changes: 2, war_years: [] },
      lanes: { fi: true, sv: null, en: null },
      branches: [],
    },
    {
      no: 11,
      heading: "Sisällissota fiktiossa",
      words: 555,
      reading_minutes: 2,
      summary:
        "[mock] Sisällissotaa käsiteltiin tuoreeltaan F. E. Sillanpään romaanissa Hurskas kurjuus (1919), mutta vuosikymmenien ajan julkinen muistikulttuuri painotti valkoista tulkintaa. Väinö Linnan trilogia Täällä Pohjantähden alla (1959–1962) avasi hävinneen osapuolen kokemuksen osaksi kansallista suurta kertomusta.",
      facts: [
        { label: "1919 novel", value: "Sillanpää: Hurskas kurjuus" },
        { label: "1959–1962 trilogy", value: "Linna: Täällä Pohjantähden alla" },
      ],
      years: [1919, 1959, 1960],
      posts: [
        { heading: "Kaunokirjallisuus ja elokuvat", words: 555 },
      ],
      text: [
        "## Sisällissota fiktiossa",
        "[mock] Kaunokirjallisuus toimi Suomessa pitkään sisällissodan trauman keskeisenä tulkkina.",
        "### Kaunokirjallisuus ja elokuvat",
        "[mock] F. E. Sillanpään, Joel Lehtosen, Väinö Linnan, Veijo Meren ja Kjell Westön teokset sekä Edvin Laineen ja Timo Koivusalon elokuvasovitukset ovat muovanneet suomalaisten kuvaa vuodesta 1918.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 6, war_years: [] },
      lanes: { fi: true, sv: 0.74, en: 0.78 },
      branches: [],
    },
  ],
  ghost_stations: [
    {
      after_no: 4,
      heading: "Punaisen ja valkoisen terrorin rinnastuskeskustelu",
      from_year: 2006,
      removed_year: 2014,
      text: "[mock] Vuosina 2006–2014 artikkelissa oli erillinen alaluku, joka vertasi suoraan osapuolten väkivaltaa ilman maakuntakohtaista lähdeaineistoa. Osio yhdistettiin myöhemmin Suomen sotasurmat -tietokantaan pohjautuvaan Sodan uhrit -lukuun.",
    },
  ],
};

export const MOSKOVAN_RAUHA_ROAD_FIXTURE = {
  article: {
    lang: "fi",
    page_id: 52097,
    wikidata_id: "Q695285",
    title: "Moskovan rauhansopimus (1940)",
    url: "https://fi.wikipedia.org/wiki/Moskovan_rauhansopimus_(1940)",
    words: 2150,
    reading_minutes: 9,
    has_history: true,
  },
  stations: [
    {
      no: 1,
      heading: "Neuvottelutunnustelut ja valtuuskunta",
      words: 480,
      reading_minutes: 2,
      summary:
        "[mock] Tammikuussa 1940 käynnistyneet rauhantunnustelut kulkivat Tukholman kautta, kun Neuvostoliitto luopui Terijoen hallituksesta ja suostui neuvottelemaan Rytin–Tannerin hallituksen kanssa. Pääministeri Risto Rytin ja valtioneuvos J. K. Paasikiven johtama valtuuskunta matkusti Moskovaan 6. maaliskuuta 1940.",
      facts: [
        { label: "Delegation chair", value: "Risto Ryti" },
        { label: "Departure", value: "6 Mar 1940" },
      ],
      years: [1940],
      posts: [
        { heading: "Tukholman välitys ja Moskovan matka", words: 240 },
        { heading: "Suomen rauhanvaltuuskunta", words: 240 },
      ],
      text: [
        "## Neuvottelutunnustelut ja valtuuskunta",
        "[mock] Kirjailija Hella Wuolijoen ja lähettiläs Aleksandra Kollontain Tukholmassa käymät keskustelut avasivat diplomaattisen yhteyden Helsingin ja Moskovan välille.",
        "### Suomen rauhanvaltuuskunta",
        "[mock] Valtuuskuntaan kuuluivat Risto Ryti, J. K. Paasikivi, kenraali Rudolf Walden ja professori Väinö Voionmaa.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 6, war_years: [] },
      lanes: { fi: true, sv: 0.75, en: 0.84 },
      branches: [
        { lang: "fi", page_id: 194047, title: "Risto Ryti", reason: "Prime Minister and chief negotiator" },
        { lang: "fi", page_id: 11446, title: "Juho Kusti Paasikivi", reason: "Key peace negotiator in Moscow" },
      ],
    },
    {
      no: 2,
      heading: "Rauhansopimuksen allekirjoittaminen ja voimaantulo",
      words: 410,
      reading_minutes: 2,
      summary:
        "[mock] Moskovan rauhansopimus allekirjoitettiin Kremlissä 12. maaliskuuta 1940 myöhään illalla, vaikka asiakirjaan merkittiin päivämääräksi 12. maaliskuuta. Vihollisuudet rintamilla päättyivät sopimuksen mukaisesti 13. maaliskuuta klo 11 Suomen aikaa.",
      facts: [
        { label: "Signed", value: "12 Mar 1940" },
        { label: "Ceasefire", value: "13 Mar 1940, 11:00" },
      ],
      years: [1940],
      posts: [
        { heading: "Allekirjoitus Moskovassa 12.–13. maaliskuuta", words: 410 },
      ],
      text: [
        "## Rauhansopimuksen allekirjoittaminen ja voimaantulo",
        "[mock] Eduskunnan ulkoasiainvaliokunta ja hallitus hyväksyivät raskaat rauhanehdot ylipäällikkö Mannerheimin annettua realistisen tilannearvion Karjalankannaksen ja Viipurinlahden rintamatilanteesta.",
      ].join("\n\n"),
      history: { added_year: 2004, changes: 8, war_years: [2007] },
      lanes: { fi: true, sv: 0.82, en: 0.89 },
      branches: [
        { lang: "fi", page_id: 1256, title: "Talvisota", reason: "Ended the 105-day Winter War" },
      ],
    },
    {
      no: 3,
      heading: "Alueluovutukset ja Hangon vuokra-alue",
      words: 540,
      reading_minutes: 2,
      summary:
        "[mock] Sopimuksessa Suomi luovutti Neuvostoliitolle Karjalankannaksen, Viipurin, Käkisalmen, Sortavalan, Laatokan Karjalan, Suomenlahden ulkosaaret, Sallan ja Kuusamon itäosat sekä osan Kalastajasaarennosta. Lisäksi Hankoniemi ympäröivine merialueineen vuokrattiin Neuvostoliitolle laivastotukikohdaksi 30 vuodeksi.",
      facts: [
        { label: "Territory ceded", value: "~35,000 km² (11%)" },
        { label: "Hanko lease", value: "30 years" },
      ],
      years: [1920, 1940],
      posts: [
        { heading: "Karjalankannas, Laatokan Karjala ja Salla", words: 310 },
        { heading: "Hangon laivastotukikohta", words: 230 },
      ],
      text: [
        "## Alueluovutukset ja Hangon vuokra-alue",
        "[mock] Uusi valtakunnanraja noudatti pääpiirteissään Pietari Suuren vuoden 1721 Uudenkaupungin rauhan rajaa, mutta jätti Enson teollisuusalueen Neuvostoliiton puolelle.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 9, war_years: [2014] },
      lanes: { fi: true, sv: 0.79, en: 0.86 },
      branches: [
        { lang: "fi", page_id: 194042, title: "Luovutettu Karjala", reason: "Ceded Karelian municipalities" },
      ],
    },
    {
      no: 4,
      heading: "Siirtoväen evakuointi ja taloudelliset menetykset",
      words: 390,
      reading_minutes: 2,
      summary:
        "[mock] Luovutettujen alueiden tyhjentämiselle varattiin vain 10–14 vuorokautta, minkä aikana 422 000 suomalaista joutui jättämään kotinsa. Alueluovutusten mukana Suomi menetti yli kymmenesosan viljelysmaastaan, metsävaroistaan ja teollisuuskapasiteetistaan.",
      facts: [
        { label: "Evacuees", value: "422,000 people" },
        { label: "Evacuation time", value: "10–14 days" },
      ],
      years: [1940],
      posts: [
        { heading: "Pikainen evakuointi ja pika-asutuslaki", words: 390 },
      ],
      text: [
        "## Siirtoväen evakuointi ja taloudelliset menetykset",
        "[mock] Lähes koko luovutetun alueen väestö siirtyi uuden rajan länsipuolelle, ja heidän sijoittamisekseen säädettiin kesäkuussa 1940 siirtoväen pika-asutuslaki.",
      ].join("\n\n"),
      history: { added_year: 2005, changes: 7, war_years: [] },
      lanes: { fi: true, sv: 0.71, en: 0.80 },
      branches: [
        { lang: "fi", page_id: 218476, title: "Siirtoväki", reason: "422,000 Karelian evacuees" },
      ],
    },
    {
      no: 5,
      heading: "Sopimuksen seuraukset ja välirauhan aika",
      words: 330,
      reading_minutes: 1,
      summary:
        "[mock] Moskovan rauha käynnisti 15 kuukautta kestäneen välirauhan (1940–1941), jonka aikana Suomi linnoitti Salpalinjaa ja haki ulkopoliittista tukea Neuvostoliiton painostusta vastaan. Vuoden 1940 rajanvedot vahvistettiin myöhemmin Moskovan välirauhassa 1944 ja Pariisin rauhansopimuksessa 1947.",
      facts: [
        { label: "Interim Peace", value: "Mar 1940 – Jun 1941" },
        { label: "Confirmed in", value: "1944 & 1947 treaties" },
      ],
      years: [1940, 1941, 1944, 1947],
      posts: [],
      text: [
        "## Sopimuksen seuraukset ja välirauhan aika",
        "[mock] Rauhanehtojen ankaruus ja Neuvostoliiton uudet vaatimukset välirauhan aikana vaikuttivat keskeisesti siihen, että Suomi lähentyi Saksaa ja lähti jatkosotaan kesällä 1941.",
      ].join("\n\n"),
      history: { added_year: 2006, changes: 6, war_years: [2020] },
      lanes: { fi: true, sv: 0.68, en: 0.77 },
      branches: [
        { lang: "fi", page_id: 194041, title: "Välirauha", reason: "15-month Interim Peace (1940–1941)" },
        { lang: "fi", page_id: 440, title: "Jatkosota", reason: "Continuation War (1941–1944)" },
      ],
    },
  ],
  ghost_stations: [
    {
      after_no: 3,
      heading: "Karjalan palautuskeskustelu ja rajakysymys kylmän sodan jälkeen",
      from_year: 2007,
      removed_year: 2014,
      text: "[mock] Vuosina 2007–2014 artikkelissa oli erillinen luku Neuvostoliiton hajoamisen jälkeisestä Karjalan palautuskeskustelusta, ennen kuin aihe siirrettiin omaan erillisartikkeliinsa.",
    },
  ],
};

function makeJatkosotaStation(no, heading, words, years, posts, oneLine, summary, history) {
  return {
    no,
    heading,
    words,
    reading_minutes: Math.max(1, Math.round(words / 240)),
    one_line: oneLine,
    summary,
    facts: [],
    years,
    posts: posts.map((p) => ({ heading: p, words: Math.max(40, Math.round(words / Math.max(1, posts.length))) })),
    text: [
      `## ${heading}`,
      summary,
      ...posts.map((p) => `### ${p}\n\n[mock] Alaluku "${p}" käsittelee osion **${heading}** tapahtumia osana jatkosodan historiaa.`),
    ].join("\n\n"),
    history,
    lanes: { fi: true, sv: 0.79, en: 0.85 },
    branches: [],
  };
}

export const JATKOSOTA_ROAD_FIXTURE = {
  article: {
    lang: "fi",
    page_id: 440,
    wikidata_id: "Q188022",
    title: "Jatkosota",
    url: "https://fi.wikipedia.org/wiki/Jatkosota",
    words: 12990,
    reading_minutes: 54,
    has_history: true,
  },
  stations: [
    makeJatkosotaStation(
      1,
      "Sodan nimi",
      95,
      [1941],
      [],
      "[mock] Jatkosota-nimitys vakiintui jo sodan aikana kuvaamaan sen koettua jatkuvuutta talvisodalle.",
      "[mock] Suomessa vuosien 1941–1944 sotaa kutsuttiin jo aikalaislehdistössä jatkosodaksi, jotta se erottuisi Saksan laajemmasta itärintamasodasta. Neuvostoliitossa sama rintamaosuus luettiin osaksi suurta isänmaallista sotaa.",
      { added_year: 2004, changes: 6, war_years: [] }
    ),
    makeJatkosotaStation(
      2,
      "Tausta",
      1420,
      [1940, 1941],
      ["Välirauhan aika", "Suomen ja Saksan lähentyminen", "Sodan syttyminen"],
      "[mock] Välirauhan turvallisuuspaine ajoi Suomen lähentymään Saksaa ja valmistautumaan kesän 1941 sotatoimiin.",
      "[mock] Moskovan rauhan raskaat ehdot ja Neuvostoliiton painostus vuosina 1940–1941 muuttivat Suomen ulko- ja turvallisuuspolitiikkaa. Operaatio Barbarossan käynnistyttyä Suomi joutui Saksan rinnalle ja totesi 25.6.1941 olevansa sodassa Neuvostoliittoa vastaan.",
      { added_year: 2003, changes: 15, war_years: [2007, 2015] }
    ),
    makeJatkosotaStation(
      3,
      "Hyökkäysvaihe",
      2840,
      [1941],
      ["Karjalankannas ja Laatokan Karjala", "Itä-Karjalan valtaus"],
      "[mock] Kesän ja syksyn 1941 hyökkäyksessä Suomi valtasi menetetyt alueet ja eteni Itä-Karjalaan.",
      "[mock] Heinäkuussa 1941 alkanut hyökkäysvaihe eteni Laatokan Karjalaan, Karjalankannakselle ja Syvärille sekä Äänislinnaan. Joulukuuhun 1941 mennessä eteneminen pysäytettiin poliittisen ja sotilaallisen tilanteen muuttuessa.",
      { added_year: 2003, changes: 13, war_years: [2008] }
    ),
    makeJatkosotaStation(
      4,
      "Asemasotavaihe",
      2650,
      [1941, 1942, 1943],
      ["Rintamalinjat vakiintuvat", "Itä-Karjalan sotilashallinto"],
      "[mock] Asemasotavaihe kesti vuoden 1941 lopulta kesäkuuhun 1944 asti ilman suuria rintamasiirtymiä.",
      "[mock] Yli kaksi ja puoli vuotta kestäneen asemasodan aikana puolustusta linnoitettiin ja osa joukoista kotiutettiin kotirintaman työtehtäviin. Samalla saksalaisten heikentyminen idässä pakotti Suomen etsimään rauhantunnusteluja.",
      { added_year: 2004, changes: 11, war_years: [2011] }
    ),
    makeJatkosotaStation(
      5,
      "Neuvostoliiton suurhyökkäys kesällä 1944",
      2190,
      [1944],
      ["Karjalankannaksen murtuminen", "Tali–Ihantala ja Viipuri"],
      "[mock] Kesäkuun 1944 suurhyökkäys mursi pääpuolustusaseman ennen kuin eteneminen torjuttiin Tali–Ihantalassa.",
      "[mock] Puna-armeija käynnisti 9. kesäkuuta 1944 massiivisen suurhyökkäyksen Karjalankannaksella ja myöhemmin Itä-Karjalassa. Suomen armeija menetti Viipurin, mutta pystyi torjumaan läpimurron Tali–Ihantalassa, Vuosalmella ja Ilomantsissa.",
      { added_year: 2003, changes: 17, war_years: [2007, 2014, 2019] }
    ),
    makeJatkosotaStation(
      6,
      "Sotatalous ja kotirintama",
      920,
      [1941, 1943, 1944],
      ["Elintarvikesäännöstely", "Kotirintaman työvoima"],
      "[mock] Pitkittynyt sota piti maan työvoiman ja elintarvikehuollon tiukassa säännöstelyssä.",
      "[mock] Naisten ja nuorten työpanos sekä lottajärjestö ylläpitivät maataloutta, teollisuutta ja huoltoa miesten ollessa rintamalla. Vuosien 1941–1942 heikot sadot ja tuontikatkokset kiristivät elintarvikesäännöstelyä.",
      { added_year: 2005, changes: 7, war_years: [] }
    ),
    makeJatkosotaStation(
      7,
      "Moskovan välirauha",
      1140,
      [1944],
      ["Risto Rytin ja Mannerheimin ratkaisut", "Rauhansopimuksen ehdot"],
      "[mock] Syyskuussa 1944 solmittu Moskovan välirauha lopetti vihollisuudet raskain alueluovutuksin ja sotakorvauksin.",
      "[mock] Presidentiksi valitun Mannerheimin ja Paasikiven linja johti aselepopyyntöön ja Moskovan välirauhaan 19. syyskuuta 1944. Suomi menetti Petsamon, vuokrasi Porkkalan ja sitoutui karkottamaan saksalaiset joukot Lapista.",
      { added_year: 2004, changes: 10, war_years: [2016] }
    ),
    makeJatkosotaStation(
      8,
      "Osapuolten tappiot",
      560,
      [1941, 1944],
      ["Suomen ja Neuvostoliiton menetykset"],
      "[mock] Jatkosodassa kaatui yli 63 000 suomalaista ja haavoittui noin 158 000 sotilasta.",
      "[mock] Kolme vuotta kestänyt sota vaati Suomelta yli kaksinkertaiset henkilötappiot talvisotaan verrattuna ja johti yli 400 000 karjalaisen uuteen evakkoon. Myös puna-armeijan ja siviilien menetykset rintamalohkoilla olivat satojatuhansia.",
      { added_year: 2005, changes: 8, war_years: [2014] }
    ),
    makeJatkosotaStation(
      9,
      "Sodan seuraukset ja merkitys",
      880,
      [1944, 1947, 1948],
      ["Sotakorvaukset ja Pariisin rauha", "Ulkopoliittinen suunnanmuutos"],
      "[mock] Sota säilytti Suomen itsenäisyyden mutta johti valvontakomissioon, sotakorvauksiin ja Paasikiven linjaan.",
      "[mock] Välirauhan jälkeen Suomessa toimi liittoutuneiden valvontakomissio ja pantiin toimeen sotasyyllisyysoikeudenkäynnit. Teollisuus maksoi Neuvostoliitolle 300 miljoonan sotakorvausdollarin tavaratoimitukset vuoteen 1952 mennessä.",
      { added_year: 2004, changes: 9, war_years: [] }
    ),
    makeJatkosotaStation(
      10,
      "Jatkosota taiteessa ja tutkimuksessa",
      295,
      [1954, 2004],
      ["Tuntematon sotilas ja historiankirjoitus"],
      "[mock] Väinö Linnan Tuntematon sotilas ja arkistolähteiden avautuminen muovasivat kuvaa jatkosodasta.",
      "[mock] Sodan jälkeen Väinö Linnan romaani ja sen filmatisoinnit loivat vahvan kollektiivisen muistin suomalaisesta rintamasodasta. 2000-luvun tutkimus on tarkastellut erityisesti sota-ajan diplomatiaa, sotavankileirejä ja kotirintamaa.",
      { added_year: 2006, changes: 5, war_years: [] }
    ),
  ],
  ghost_stations: [
    {
      after_no: 4,
      heading: "Suur-Suomi-hankkeet miehitetyssä Itä-Karjalassa",
      from_year: 2006,
      removed_year: 2016,
      text: "[mock] Vuosina 2006–2016 artikkelissa oli erillinen osio miehityshallinnon ja poliittisen johdon Suur-Suomi-kaavailuista ennen kuin sisältö liitettiin tiivistettynä Asemasotavaihe-lukuun.",
    },
  ],
};

export function buildRoadForStar(star, siblings = [], branchTargets = []) {
  if (star.lang === "fi" && star.page_id === 1256) {
    return structuredClone(TALVISOTA_ROAD_FIXTURE);
  }
  if (star.lang === "fi" && star.page_id === 1150) {
    return structuredClone(SISALLISSOTA_ROAD_FIXTURE);
  }
  if (star.lang === "fi" && star.page_id === 440) {
    return structuredClone(JATKOSOTA_ROAD_FIXTURE);
  }
  if (star.lang === "fi" && star.page_id === 52097) {
    return structuredClone(MOSKOVAN_RAUHA_ROAD_FIXTURE);
  }

  const hasSv = star.lang === "sv" || siblings.some((s) => s.lang === "sv");
  const hasEn = star.lang === "en" || siblings.some((s) => s.lang === "en");
  const isLong = star.length >= 9000;

  if (!isLong) {
    const totalWords = Math.min(1200, Math.max(120, Math.round(star.length / 6)));
    const w1 = Math.round(totalWords * 0.55);
    const w2 = Math.max(40, totalWords - w1);
    return {
      article: {
        lang: star.lang,
        page_id: star.page_id,
        wikidata_id: star.wikidata_id,
        title: star.title,
        url: star.url,
        words: totalWords,
        reading_minutes: 2,
        has_history: Boolean(star.has_history),
      },
      stations: [
        {
          no: 1,
          heading: "Tausta ja vaiheet",
          words: w1,
          reading_minutes: 1,
          summary: `[mock] ${star.title} liittyy teemaan ${star.category || "Suomen historia"}. Tämä tiivis katsaus esittelee aiheen keskeiset lähtökohdat.`,
          facts: [
            { label: "Ajankohta", value: String(star.event_year || 1918) },
          ],
          years: star.event_year ? [star.event_year] : [],
          posts: [],
          text: `## Tausta ja vaiheet\n\n[mock] ${star.title} sijoittuu vuoteen ${star.event_year || 1918} osana kokonaisuutta ${star.category || "Suomen historia"}.`,
          history: star.has_history
            ? { added_year: star.first_edit_year || 2005, changes: 3, war_years: [] }
            : null,
          lanes: {
            fi: true,
            sv: hasSv ? 0.72 : null,
            en: hasEn ? 0.78 : null,
          },
          branches: branchTargets.slice(0, 1),
        },
        {
          no: 2,
          heading: "Merkitys",
          words: w2,
          reading_minutes: 1,
          summary: `[mock] Aiheen historiallinen merkitys nivoutuu osaksi laajempaa ${star.category || "Suomen historian"} kehityskulkua.`,
          facts: [],
          years: [],
          posts: [],
          text: `## Merkitys\n\n[mock] ${star.title} täydentää lähdeaineistoa aihepiirissä ${star.category || "Suomen historia"}.`,
          history: star.has_history
            ? { added_year: (star.first_edit_year || 2005) + 1, changes: 2, war_years: [] }
            : null,
          lanes: {
            fi: true,
            sv: hasSv ? 0.65 : null,
            en: hasEn ? 0.70 : null,
          },
          branches: [],
        },
      ],
      ghost_stations: [],
    };
  }

  // Long article (>= 9000 bytes / >= 1500 words): 5 stations
  const totalWords = Math.max(1550, Math.round(star.length / 6));
  const readingMinutes = Math.max(6, Math.round(totalWords / 240));
  const baseYear = star.event_year || 1918;
  const firstEditYear = star.first_edit_year || 2004;

  const sectionSpecs = [
    {
      heading: "Historiallinen tausta",
      share: 0.24,
      years: [baseYear - 5, baseYear],
      posts: ["Yhteiskunnalliset lähtökohdat", "Poliittinen asetelma"],
      warYears: star.has_history ? [2007] : [],
    },
    {
      heading: "Keskeiset vaiheet",
      share: 0.28,
      years: [baseYear, baseYear + 1],
      posts: ["Alkuvaihe", "Ratkaisuvaihe"],
      warYears: star.has_history ? [2008, 2014] : [],
    },
    {
      heading: "Toimijat ja rakenteet",
      share: 0.18,
      years: [baseYear],
      posts: ["Keskeiset instituutiot"],
      warYears: [],
    },
    {
      heading: "Vaikutukset ja seuraukset",
      share: 0.18,
      years: [baseYear + 1, baseYear + 5],
      posts: ["Pitkän aikavälin vaikutukset"],
      warYears: [],
    },
    {
      heading: "Historiografinen tulkinta ja muisto",
      share: 0.12,
      years: [],
      posts: [],
      warYears: [],
    },
  ];

  let allocated = 0;
  const stations = sectionSpecs.map((spec, idx) => {
    const isLast = idx === sectionSpecs.length - 1;
    const words = isLast
      ? Math.max(150, totalWords - allocated)
      : Math.round(totalWords * spec.share);
    allocated += words;
    const postWords = spec.posts.length > 0 ? Math.round(words / spec.posts.length) : 0;

    return {
      no: idx + 1,
      heading: spec.heading,
      words,
      reading_minutes: Math.max(1, Math.round(words / 240)),
      summary: `[mock] Osiossa "${spec.heading}" tarkastellaan artikkelin ${star.title} kehitystä teemassa ${star.category || "Suomen historia"}. Luku kokoaa keskeiset arkistolähteet ja tapahtumakulut vuosilta ${baseYear}–${baseYear + 1}.`,
      facts: [
        { label: "Teema", value: star.category || "Suomen historia" },
        { label: "Ajanjakso", value: `${baseYear}` },
      ],
      years: spec.years,
      posts: spec.posts.map((p) => ({ heading: p, words: postWords })),
      text: [
        `## ${spec.heading}`,
        `[mock] **${star.title}** (${spec.heading}): tämä luku käsittelee aihepiiriä *${star.category || "Suomen historia"}* osana suomenkielisen Wikipedian historia-aineistoa.`,
        ...spec.posts.map(
          (p) => `### ${p}\n\n[mock] Alaluku "${p}" syventää artikkelin ${star.title} kuvaa vuodelta ${baseYear}.`
        ),
      ].join("\n\n"),
      history: star.has_history
        ? {
            added_year: Math.min(2012, firstEditYear + idx),
            changes: 5 + ((star.page_id + idx) % 8),
            war_years: spec.warYears,
          }
        : null,
      lanes: {
        fi: true,
        sv: hasSv ? Number((0.74 + (idx % 3) * 0.06).toFixed(2)) : null,
        en: hasEn ? Number((0.81 + (idx % 3) * 0.05).toFixed(2)) : null,
      },
      branches: idx < branchTargets.length ? [branchTargets[idx]] : [],
    };
  });

  const ghost_stations = star.has_history
    ? [
        {
          after_no: 3,
          heading: `Aiempi tulkintaluku aiheesta ${star.title}`,
          from_year: 2007,
          removed_year: 2015,
          text: `[mock] Vuosina 2007–2015 artikkelissa ${star.title} oli erillinen osio, joka yhdistettiin myöhemmin lähdeviitteiden tarkistuksen yhteydessä varsinaisiin päälukuihin.`,
        },
      ]
    : [];

  return {
    article: {
      lang: star.lang,
      page_id: star.page_id,
      wikidata_id: star.wikidata_id,
      title: star.title,
      url: star.url,
      words: totalWords,
      reading_minutes: readingMinutes,
      has_history: Boolean(star.has_history),
    },
    stations,
    ghost_stations,
  };
}

const SUMMARY_OVERVIEW_FIXTURES = {
  1256: {
    tldr:
      "[mock] Talvisota käytiin Suomen ja Neuvostoliiton välillä 30. marraskuuta 1939 – 13. maaliskuuta 1940 osana toisen maailmansodan alkunäytöstä. Huolimatta puna-armeijan murskaavasta mies- ja kalustoylivoimasta Suomi kykeni torjumaan ratkaisevan läpimurron 105 päivän ajan. Sota päättyi Moskovan rauhansopimukseen, jossa Suomi menetti noin kymmenesosan maa-alueestaan mutta säilytti itsenäisyytensä.",
    facts: [
      { label: "Dates", value: "30 Nov 1939 – 13 Mar 1940" },
      { label: "Duration", value: "105 days" },
      { label: "Peace", value: "Treaty of Moscow (12 Mar 1940)" },
    ],
  },
  1150: {
    tldr:
      "[mock] Suomen sisällissota käytiin keväällä 1918 senaatin johtamien valkoisten ja Suomen kansanvaltuuskunnan johtamien punaisten välillä pian itsenäistymisen jälkeen. Venäjän vallankumouksen ja kotimaisten kriisien kärjistämä konflikti vaati noin 38 000 uhria ja jakoi yhteiskunnan vuosikymmeniksi. Valkoisten voiton ja Saksan väliintulon jälkeen Suomi suuntautui parlamentaariseen tasavaltaan.",
    facts: [
      { label: "Dates", value: "27 Jan – 15 May 1918" },
      { label: "Casualties", value: "~38,000 deaths" },
      { label: "Outcome", value: "White Senate victory" },
    ],
  },
  440: {
    tldr:
      "[mock] Jatkosota käytiin Suomen ja Neuvostoliiton välillä vuosina 1941–1944 Suomen tavoitellessa talvisodassa menetettyjen alueiden palauttamista Saksan operaatio Barbarossan rinnalla. Kahden ja puolen vuoden asemasodan jälkeen puna-armeijan kesän 1944 suurhyökkäys torjuttiin ratkaisevissa torjuntataisteluissa Karjalankannaksella. Syyskuussa 1944 solmittu Moskovan välirauha palautti vuoden 1940 rajat, määräsi sotakorvaukset ja johti Lapin sotaan.",
    facts: [
      { label: "Dates", value: "25 Jun 1941 – 19 Sep 1944" },
      { label: "Decisive defence", value: "Tali–Ihantala (1944)" },
      { label: "End", value: "Moscow Armistice (19 Sep 1944)" },
    ],
  },
};

function extractFirstSentence(text, fallbackTitle) {
  const raw = String(text || "").trim();
  if (!raw) return `[mock] Concise overview of ${fallbackTitle}.`;
  // Split after sentence-ending punctuation followed by whitespace and a capital letter / bracket, preserving DD.MM.YYYY
  const match = raw.match(/^([\s\S]+?(?<=[a-zäöå0-9\])])\.)(?:\s+(?=[A-ZÄÖÅ\[])|$)/);
  if (match) return match[1].trim();
  return raw;
}

export function buildSummaryForStar(star, siblings = [], branchTargets = []) {
  const road = buildRoadForStar(star, siblings, branchTargets);
  const art = road.article;
  const fixtureMeta = star.lang === "fi" ? SUMMARY_OVERVIEW_FIXTURES[star.page_id] : null;

  const isLong = road.stations.length >= 4 && art.words >= 1500;
  const baseYear = star.event_year || star.first_edit_year || 1918;
  const cat = star.category || "Suomen historia";

  const tldr = fixtureMeta
    ? fixtureMeta.tldr
    : [
        `[mock] **${star.title}** (${art.lang.toUpperCase()}) on artikkelikokonaisuus teemassa ${cat}, joka tarkastelee vuoden ${baseYear} ympärille sijoittuvia historiallisia tapahtumia.`,
        `[mock] Artikkeli kattaa noin ${art.words.toLocaleString("en-US")} sanaa (${art.reading_minutes} min lukuaika) ja kokoaa yhteen keskeiset toimijat, lähteet sekä ajalliset käänteet.`,
        art.has_history
          ? `[mock] Tällä suomenkielisellä artikkelilla on tallennettuna täysi muokkaushistoria vuodesta ${star.first_edit_year || 2004} vuoteen 2026.`
          : `[mock] Artikkelista on mukana nykyversio kieltenvälisenä vertailutähtenä ilman muokkaushistoriaa.`,
      ].join(" ");

  const defaultFacts = [
    { label: "Theme", value: cat },
    { label: "Focus year", value: String(baseYear) },
    { label: "Length", value: `${art.words.toLocaleString("en-US")} words (${art.reading_minutes} min)` },
  ].slice(0, 3);

  const facts = fixtureMeta ? fixtureMeta.facts.slice(0, 3) : defaultFacts;

  const sections = isLong
    ? road.stations.map((st) => ({
        no: st.no,
        heading: st.heading,
        words: st.words,
        reading_minutes: st.reading_minutes,
        one_line: st.one_line || extractFirstSentence(st.summary, st.heading),
        summary: st.summary,
        text: st.text,
        history: st.history ? { ...st.history, war_years: [...(st.history.war_years || [])] } : null,
      }))
    : [];

  const ghost_sections = isLong
    ? (road.ghost_stations || []).map((g) => ({
        after_no: g.after_no,
        heading: g.heading,
        from_year: g.from_year,
        removed_year: g.removed_year,
        text: g.text,
      }))
    : [];

  return {
    article: art,
    tldr,
    facts,
    sections,
    ghost_sections,
  };
}
