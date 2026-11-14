export const STORAGE_KEY = "wikimemory.lang";
export const SUPPORTED = ["fi", "sv", "en"];

export const LOCALES = {
  fi: "fi-FI",
  sv: "sv-FI",
  en: "en-GB",
};

export const STRINGS = {
  en: {
    "page.title": "WikiMemory — History of Finland on Wikipedia",
    "brand.name": "wikimemory",
    "search.placeholder": "Ask about the history of Finland…",
    "search.submit": "Search",
    "ask.submit": "Ask",
    "status.loading": "Loading…",
    "lens.meaning": "Meaning",
    "lens.history": "History",
    "lens.geography": "Geography",
    "demo.chipLabel": "How did the Winter War end?",
    "demo.askQuery": "How did the Winter War end?",
    "demo.talvisotaSvt": "Talvisota (SVT history)",
    "demo.moscowThreads": "Moskovan rauhansopimus (5-hop threads)",
    "demo.talvitieTalvisota": "Talvitie: Talvisota",
    "demo.winterRoad": "Talvitie",
    "legend.fi": "Finnish",
    "legend.sv": "Swedish",
    "legend.en": "English",
    "legend.dispute": "Edit war",
    "nav.backToSky": "Back to the sky",
    "nav.openArticle": "Open article",
    "nav.openFullArticle": "Open full article",
    "nav.close": "Close",
    "nav.clear": "Clear",
    "nav.prev": "Previous",
    "nav.next": "Next",
    "nav.stepCounter": "{current} / {total}",
    "nav.readMore": "Read original text",
    "nav.hideText": "Hide original text",
    "nav.readSection": "Read section",
    "nav.closeSection": "Hide section",
    "nav.saveConstellation": "Save this constellation",
    "nav.savedConstellation": "Saved: {title}",
    "lang.fi": "Finnish",
    "lang.sv": "Swedish",
    "lang.en": "English",
    "langFrom.fi": "Finnish",
    "langFrom.sv": "Swedish",
    "langFrom.en": "English",
    "mt.from": "Machine-translated from {langs}",
    "fallback.note": "Not yet available in English. Showing the original ({shown}).",
    "error.network": "Couldn't reach the server. Try again.",
    "error.summaryLoad": "Couldn't load the article summary. Try again.",
    "search.noMatches": "No articles match \"{query}\"",
    "search.emptyHint": "No articles match. Try a place, a person or a year.",
    "search.matchCount": {
      one: "{count} matching article",
      other: "{count} matching articles",
    },
    "search.alsoIn": "also in {langs}",
    "search.alsoInPrefix": "also in",
    "ask.kicker": "Historical RAG Answer",
    "ask.loading": "Searching memory & preparing answer…",
    "ask.pendingHint": "Generating translated answer in the background — retry shortly.",
    "ask.preparingHistory": "Preparing the answer from Wikipedia's history…",
    "ask.readingYears": "Reading {count} years of edit history…",
    "ask.translating": "Translating answer into English…",
    "ask.pendingTimeout": "Answer is taking longer than expected.",
    "ask.retry": "Refresh answer",
    "ask.topMatch": "Top article",
    "ask.openTrail": "Open Summary Trail",
    "ask.noHistory": "No edit history for this article yet.",
    "ask.openRevisionTitle": "Open revision {revId} on Finnish Wikipedia",
    "ask.changedTimes": {
      one: "This answer changed {count} time",
      other: "This answer changed {count} times",
    },
    "ask.unchangedSince": "This answer has not changed since {year}",
    "ask.versionSpan": "Version {from}–{to} by {user}",
    "ask.changedBy": "Edited by {user} on {date}",
    "ask.diffToday": "Word diff against today",
    "ask.sources": "Sources",
    "ask.factsHeading": "Key facts",
    "threads.heading": "Memory threads from {title}",
    "panel.overview": "Overview",
    "panel.today": "Today",
    "panel.throughTime": "Through Time",
    "panel.summarize": "Summarize",
    "panel.seeAsRoad": "See as a road",
    "panel.winterRoad": "Winter Road",
    "panel.readOnWikipedia": "Read on Wikipedia",
    "panel.imageCredit": "Image: {artist}, {license}",
    "panel.commonsCredit": "Wikimedia Commons",
    "panel.siblingRead.fi": "Also in Finnish:",
    "panel.siblingRead.sv": "Also in Swedish:",
    "panel.siblingRead.en": "Also in English:",
    "panel.alsoInPrefix": "Also in:",
    "panel.editStats": "Edit stats",
    "panel.versions": {
      one: "{count} version",
      other: "{count} versions",
    },
    "panel.versionsWord": {
      one: "version",
      other: "versions",
    },
    "panel.reverts": {
      one: "{count} revert",
      other: "{count} reverts",
    },
    "panel.revertsWord": {
      one: "revert",
      other: "reverts",
    },
    "panel.disputes": {
      one: "{count} dispute",
      other: "{count} disputes",
    },
    "panel.disputesWord": {
      one: "dispute",
      other: "disputes",
    },
    "panel.monthBarTitle": "{month}: {edits} edits, {disputes} disputes",
    "panel.firstEdit": "First edit: {date}",
    "panel.noArticleThen": "Article had not been created yet in {year}.",
    "panel.editedByOn": "Edited by {user} on {date}",
    "panel.asOfYear": "As of {year}",
    "panel.asOfToday": "As of Today",
    "panel.diffToday": "Word diff against today",
    "panel.todayOldid": "today oldid={id}",
    "panel.unchangedBlocks": {
      one: "{count} unchanged block",
      other: "{count} unchanged blocks",
    },
    "panel.currentRevision": "Current revision",
    "panel.historicalSnapshot": "Snapshot from {year}",
    "summary.modeTag": "Summary Trail",
    "summary.overviewKicker": "Article overview",
    "summary.sectionKicker": "Section {no}",
    "summary.ghostKicker": "Removed section",
    "summary.removedNote": "Removed in {year} (last seen {from}–{to})",
    "summary.historyAdded": "Added {year}",
    "summary.historyChanges": {
      one: "{count} change",
      other: "{count} changes",
    },
    "summary.historyWar": "war {years}",
    "summary.words": {
      one: "{count} word",
      other: "{count} words",
    },
    "summary.minRead": "{count} min read",
    "summary.progress": "Card {current} of {total}",
    "summary.loading": "Loading summary…",
    "summary.unavailable": "Summary unavailable.",
    "summary.subsectionsLabel": "Subsections:",
    "summary.moreSubsections": "+{count} more",
    "summary.timeCompare": "{read} min → {summary} min",
    "summary.ghostShort": "Removed in {year}: {heading}",
    "summary.archivedSectionMeta": "Archived Wikipedia section ({from}–{to}, removed in {removed})",
    "summary.archivedInYear": "Section archived in {year}.",
    "summary.hideArchivedText": "Hide archived text",
    "summary.readMore": "Read more",
    "summary.editWarTitle": "Edit war years",
    "summary.rewrittenTimes": {
      one: "rewritten {formattedCount} time",
      other: "rewritten {formattedCount} times",
    },
    "summary.progressOverview": {
      one: "Overview · {count} section",
      other: "Overview · {count} sections",
    },
    "summary.progressOverviewSingle": "Overview · 1 of 1",
    "summary.sectionOf": "Section {no} of {total}",
    "summary.metaSections": {
      one: "{count} section · {read} min → {summary} min",
      other: "{count} sections · {read} min → {summary} min",
    },
    "summary.metaOverview": "Overview · {read} min",
    "summary.nativeLabel": "Summary of the English Wikipedia article",
    "summary.mtFromWiki.fi": "Machine-translated from Finnish Wikipedia",
    "summary.mtFromWiki.sv": "Machine-translated from Swedish Wikipedia",
    "summary.mtFromWiki.en": "Machine-translated from English Wikipedia",
    "summary.fiHistoryLabel": "Edit history of Finnish Wikipedia",
    "summary.historyBuilding": "Loading edit history…",
    "compare.alsoIn.sv": "Also in Swedish Wikipedia",
    "compare.alsoIn.en": "Also in English Wikipedia",
    "compare.onlyFi": "Only in Finnish Wikipedia",
    "compare.compact.sv": "Also in Swedish",
    "compare.compact.en": "Also in English",
    "compare.compact.onlyFi": "Only in Finnish",
    "compare.onlyFiHintBoth": "No similar passage found in Swedish or English Wikipedia",
    "compare.onlyFiHintSv": "No similar passage found in Swedish Wikipedia",
    "compare.onlyFiHintEn": "No similar passage found in English Wikipedia",
    "compare.sectionPrefix": "Section:",
    "compare.leadLabel": "Lead section",
    "compare.readIn.sv": "Read in Swedish Wikipedia",
    "compare.readIn.en": "Read in English Wikipedia",
    "road.modeTag": "Talvitie winter road",
    "road.topicModeTag": "Topic Road",
    "road.sectionModeTag": "Article Road",
    "road.stationCounter": "Station {current} of {total}",
    "road.timelineMinimap": "Timeline",
    "road.branches": "Side branches:",
    "road.ghostSections": "Removed sections:",
    "road.returnToRoad": "Back to section",
    "road.readFullArticle": "Open full article",
    "road.topicStation": "Station {no}",
    "road.historicalMilestones": {
      one: "{count} historical milestone",
      other: "{count} historical milestones",
    },
    "road.historicalRoadFallback": "Historical road",
    "road.sectionNumbered": "Section {no}",
    "road.milestoneNumbered": "Milestone {no}",
    "road.milestoneCounter": "Milestone {current} of {total}",
    "road.sectionCounter": "Section {current} of {total}",
    "road.wordsAndMins": "{words} words · {mins} min read",
    "road.removedSectionFallback": "Removed section",
    "road.removedInExisted": "Section removed in {removed} (existed {from}–{removed})",
    "road.removedHeadingExisted": "{heading} (existed {from}–{removed})",
    "road.archivedIn": "Archived section text removed from Wikipedia in {year}",
    "road.returnToSection": "Return to section {no}",
    "road.alsoCoveredIn": "Also covered in: {langs}",
    "road.finnishOnly": "Finnish only",
    "road.editWarIn": "Edit war in {years}",
    "road.addedChangedTimes": {
      one: "Added {year} · changed {count} time",
      other: "Added {year} · changed {count} times",
    },
    "road.addedRewrittenTimes": {
      one: "Added {year} · rewritten {count} time",
      other: "Added {year} · rewritten {count} times",
    },
    "road.subsectionsCount": {
      one: "{count} subsection:",
      other: "{count} subsections:",
    },
    "road.showFewer": "Show fewer",
    "road.shortWords": "{count}w",
    "road.stepOfTotal": "{current} of {total}",
    "road.hideDetails": "Hide details",
    "road.readMilestone": "Read milestone",
    "road.readThisSection": "Read this section",
    "road.onlyInWiki.fi": "Only in Finnish Wikipedia",
    "road.onlyInWiki.sv": "Only in Swedish Wikipedia",
    "road.onlyInWiki.en": "Only in English Wikipedia",
    "road.whySeed": "This article",
    "road.whySimilar": "Similar ({pct}%)",
    "road.whySimilarNoPct": "Similar article",
    "road.whySharedCategoryPrefix": "shared category:",
    "road.whyCategoryPrefix": "Category:",
    "timeslider.caption": "Edits per month",
    "timeslider.editsInYear": "{edits} edits in {year}",
    "timeslider.warMonths": {
      one: "{count} edit-war month",
      other: "{count} edit-war months",
    },
    "timeslider.warMonthsWord": {
      one: "edit-war month",
      other: "edit-war months",
    },
    "scene.talvitieSublabel": "Talvitie winter road",
    "scene.unlocated": "Unlocated articles",
    "scene.gapYears": "… {years} years …",
    "scene.sectionRemoved": "Section removed in {year}",
    "scene.era1155": "1155: Crusader era",
    "scene.era1596": "1596: Cudgel War",
    "scene.era1809": "1809: Diet of Porvoo",
    "scene.era1905": "1905: General strike",
    "scene.era1918": "1918: Civil War",
    "scene.era1939": "1939: Winter War",
    "scene.era1948": "1948: Cold War treaty",
    "scene.era1995": "1995: EU era",
  },
  fi: {
    "page.title": "WikiMemory — Suomen historia Wikipediassa",
    "brand.name": "wikimemory",
    "search.placeholder": "Kysy Suomen historiasta tai hae artikkelia…",
    "search.submit": "Hae",
    "ask.submit": "Kysy",
    "status.loading": "Ladataan…",
    "lens.meaning": "Merkitys",
    "lens.history": "Historia",
    "lens.geography": "Maantiede",
    "demo.chipLabel": "Miten talvisota päättyi?",
    "demo.askQuery": "Miten talvisota päättyi?",
    "demo.talvisotaSvt": "Talvisota (SVT-historia)",
    "demo.moscowThreads": "Moskovan rauhansopimus (5 askelen säikeet)",
    "demo.talvitieTalvisota": "Talvitie: Talvisota",
    "demo.winterRoad": "Talvitie",
    "legend.fi": "Suomi",
    "legend.sv": "Ruotsi",
    "legend.en": "Englanti",
    "legend.dispute": "Muokkaussota",
    "nav.backToSky": "Takaisin taivaalle",
    "nav.openArticle": "Avaa artikkeli",
    "nav.openFullArticle": "Lue koko artikkeli",
    "nav.close": "Sulje",
    "nav.clear": "Tyhjennä",
    "nav.prev": "Edellinen",
    "nav.next": "Seuraava",
    "nav.stepCounter": "{current} / {total}",
    "nav.readMore": "Näytä alkuperäinen teksti",
    "nav.hideText": "Piilota alkuperäinen teksti",
    "nav.readSection": "Lue osio",
    "nav.closeSection": "Piilota osio",
    "nav.saveConstellation": "Tallenna tähdistö",
    "nav.savedConstellation": "Tallennettu: {title}",
    "lang.fi": "suomi",
    "lang.sv": "ruotsi",
    "lang.en": "englanti",
    "langFrom.fi": "suomesta",
    "langFrom.sv": "ruotsista",
    "langFrom.en": "englannista",
    "mt.from": "Konekäännös {langs}",
    "fallback.note": "Ei vielä saatavilla suomeksi. Näytetään alkuperäinen ({shown}).",
    "error.network": "Yhteys palvelimeen epäonnistui. Yritä uudelleen.",
    "error.summaryLoad": "Artikkelin tiivistelmää ei voitu ladata. Yritä uudelleen.",
    "search.noMatches": "Ei artikkeleita haulla \"{query}\"",
    "search.emptyHint": "Ei vastaavia artikkeleita. Kokeile paikkaa, henkilöä tai vuotta.",
    "search.matchCount": {
      one: "{count} vastaava artikkeli",
      other: "{count} vastaavaa artikkelia",
    },
    "search.alsoIn": "myös: {langs}",
    "search.alsoInPrefix": "myös:",
    "ask.kicker": "Historiallinen RAG-vastaus",
    "ask.loading": "Haetaan muistista ja valmistellaan vastausta…",
    "ask.pendingHint": "Käännettyä vastausta luodaan taustalla — päivitä hetken kuluttua.",
    "ask.preparingHistory": "Valmistellaan vastausta Wikipedian historiasta…",
    "ask.readingYears": "Luetaan {count} vuoden muokkaushistoriaa…",
    "ask.translating": "Käännetään vastausta suomeksi…",
    "ask.pendingTimeout": "Vastauksen valmistelu kestää tavallista kauemmin.",
    "ask.retry": "Päivitä vastaus",
    "ask.topMatch": "Pääartikkeli",
    "ask.openTrail": "Avaa tiivistelmäpolku",
    "ask.noHistory": "Tällä artikkelilla ei ole vielä muokkaushistoriaa.",
    "ask.openRevisionTitle": "Avaa versio {revId} suomenkielisessä Wikipediassa",
    "ask.changedTimes": {
      one: "Tämä vastaus muuttui {count} kerran",
      other: "Tämä vastaus muuttui {count} kertaa",
    },
    "ask.unchangedSince": "Vastaus ei ole muuttunut vuoden {year} jälkeen",
    "ask.versionSpan": "Versio {from}–{to}, muokkaaja {user}",
    "ask.changedBy": "Muokannut {user} ({date})",
    "ask.diffToday": "Sanavertailu nykypäivään",
    "ask.sources": "Lähteet",
    "ask.factsHeading": "Keskeiset faktat",
    "threads.heading": "Muistisäikeet artikkelista {title}",
    "panel.overview": "Yleiskuva",
    "panel.today": "Tänään",
    "panel.throughTime": "Ajan läpi",
    "panel.summarize": "Tiivistä",
    "panel.seeAsRoad": "Näytä tienä",
    "panel.winterRoad": "Talvitie",
    "panel.readOnWikipedia": "Lue Wikipediassa",
    "panel.imageCredit": "Kuva: {artist}, {license}",
    "panel.commonsCredit": "Wikimedia Commons",
    "panel.siblingRead.fi": "Myös suomeksi:",
    "panel.siblingRead.sv": "Myös ruotsiksi:",
    "panel.siblingRead.en": "Myös englanniksi:",
    "panel.alsoInPrefix": "Myös kielillä:",
    "panel.editStats": "Muokkaustilastot",
    "panel.versions": {
      one: "{count} versio",
      other: "{count} versiota",
    },
    "panel.versionsWord": {
      one: "versio",
      other: "versiota",
    },
    "panel.reverts": {
      one: "{count} palautus",
      other: "{count} palautusta",
    },
    "panel.revertsWord": {
      one: "palautus",
      other: "palautusta",
    },
    "panel.disputes": {
      one: "{count} kiista",
      other: "{count} kiistaa",
    },
    "panel.disputesWord": {
      one: "kiista",
      other: "kiistaa",
    },
    "panel.monthBarTitle": "{month}: {edits} muokkausta, {disputes} kiistaa",
    "panel.firstEdit": "Ensimmäinen muokkaus: {date}",
    "panel.noArticleThen": "Artikkelia ei ollut vielä luotu vuonna {year}.",
    "panel.editedByOn": "Muokkaaja {user}, {date}",
    "panel.asOfYear": "Tilanne {year}",
    "panel.asOfToday": "Tilanne tänään",
    "panel.diffToday": "Sanavertailu nykypäivään",
    "panel.todayOldid": "tänään oldid={id}",
    "panel.unchangedBlocks": {
      one: "{count} muuttumaton kappale",
      other: "{count} muuttumatonta kappaletta",
    },
    "panel.currentRevision": "Nykyinen versio",
    "panel.historicalSnapshot": "Versio vuodelta {year}",
    "summary.modeTag": "Tiivistelmäpolku",
    "summary.overviewKicker": "Artikkelin yleiskuva",
    "summary.sectionKicker": "Osio {no}",
    "summary.ghostKicker": "Poistettu osio",
    "summary.removedNote": "Poistettu {year} (viimeksi {from}–{to})",
    "summary.historyAdded": "Lisätty {year}",
    "summary.historyChanges": {
      one: "{count} muutos",
      other: "{count} muutosta",
    },
    "summary.historyWar": "kiista {years}",
    "summary.words": {
      one: "{count} sana",
      other: "{count} sanaa",
    },
    "summary.minRead": "{count} min lukuaika",
    "summary.progress": "Kortti {current} / {total}",
    "summary.loading": "Ladataan tiivistelmää…",
    "summary.unavailable": "Tiivistelmä ei saatavilla.",
    "summary.subsectionsLabel": "Alaluvut:",
    "summary.moreSubsections": "+{count} muuta",
    "summary.timeCompare": "{read} min → {summary} min",
    "summary.ghostShort": "Poistettu {year}: {heading}",
    "summary.archivedSectionMeta": "Arkistoitu Wikipedia-osio ({from}–{to}, poistettu {removed})",
    "summary.archivedInYear": "Osio arkistoitu vuonna {year}.",
    "summary.hideArchivedText": "Piilota arkistoitu teksti",
    "summary.readMore": "Lue lisää",
    "summary.editWarTitle": "Muokkaussotavuodet",
    "summary.rewrittenTimes": {
      one: "muokattu uudelleen {formattedCount} kerran",
      other: "muokattu uudelleen {formattedCount} kertaa",
    },
    "summary.progressOverview": {
      one: "Yleiskuva · {count} osio",
      other: "Yleiskuva · {count} osiota",
    },
    "summary.progressOverviewSingle": "Yleiskuva · 1 / 1",
    "summary.sectionOf": "Osio {no} / {total}",
    "summary.metaSections": {
      one: "{count} osio · {read} min → {summary} min",
      other: "{count} osiota · {read} min → {summary} min",
    },
    "summary.metaOverview": "Yleiskuva · {read} min",
    "summary.nativeLabel": "Tiivistelmä suomenkielisen Wikipedian artikkelista",
    "summary.mtFromWiki.fi": "Konekäännös suomenkielisestä Wikipediasta",
    "summary.mtFromWiki.sv": "Konekäännös ruotsinkielisestä Wikipediasta",
    "summary.mtFromWiki.en": "Konekäännös englanninkielisestä Wikipediasta",
    "summary.fiHistoryLabel": "Suomenkielisen Wikipedian muokkaushistoria",
    "summary.historyBuilding": "Ladataan muokkaushistoriaa…",
    "compare.alsoIn.sv": "Myös ruotsinkielisessä Wikipediassa",
    "compare.alsoIn.en": "Myös englanninkielisessä Wikipediassa",
    "compare.onlyFi": "Vain suomenkielisessä Wikipediassa",
    "compare.compact.sv": "Myös ruotsiksi",
    "compare.compact.en": "Myös englanniksi",
    "compare.compact.onlyFi": "Vain suomeksi",
    "compare.onlyFiHintBoth": "Samankaltaista kohtaa ei löytynyt ruotsin- tai englanninkielisestä Wikipediasta",
    "compare.onlyFiHintSv": "Samankaltaista kohtaa ei löytynyt ruotsinkielisestä Wikipediasta",
    "compare.onlyFiHintEn": "Samankaltaista kohtaa ei löytynyt englanninkielisestä Wikipediasta",
    "compare.sectionPrefix": "Osio:",
    "compare.leadLabel": "Johdanto",
    "compare.readIn.sv": "Lue ruotsinkielisessä Wikipediassa",
    "compare.readIn.en": "Lue englanninkielisessä Wikipediassa",
    "road.modeTag": "Talvitie-reitti",
    "road.topicModeTag": "Aihereitti",
    "road.sectionModeTag": "Artikkelireitti",
    "road.stationCounter": "Etappi {current} / {total}",
    "road.timelineMinimap": "Aikajana",
    "road.branches": "Sivupolut:",
    "road.ghostSections": "Poistetut osiot:",
    "road.returnToRoad": "Takaisin osioon",
    "road.readFullArticle": "Avaa koko artikkeli",
    "road.topicStation": "Etappi {no}",
    "road.historicalMilestones": {
      one: "{count} historiallinen etappi",
      other: "{count} historiallista etappia",
    },
    "road.historicalRoadFallback": "Historiareitti",
    "road.sectionNumbered": "Osio {no}",
    "road.milestoneNumbered": "Etappi {no}",
    "road.milestoneCounter": "Etappi {current} / {total}",
    "road.sectionCounter": "Osio {current} / {total}",
    "road.wordsAndMins": "{words} sanaa · {mins} min lukuaika",
    "road.removedSectionFallback": "Poistettu osio",
    "road.removedInExisted": "Osio poistettu {removed} (olemassa {from}–{removed})",
    "road.removedHeadingExisted": "{heading} (olemassa {from}–{removed})",
    "road.archivedIn": "Wikipediasta vuonna {year} poistettu arkistoitu osio",
    "road.returnToSection": "Takaisin osioon {no}",
    "road.alsoCoveredIn": "Käsitelty myös kielillä: {langs}",
    "road.finnishOnly": "Vain suomeksi",
    "road.editWarIn": "Muokkaussota vuosina {years}",
    "road.addedChangedTimes": {
      one: "Lisätty {year} · muokattu {count} kerran",
      other: "Lisätty {year} · muokattu {count} kertaa",
    },
    "road.addedRewrittenTimes": {
      one: "Lisätty {year} · kirjoitettu uudelleen {count} kerran",
      other: "Lisätty {year} · kirjoitettu uudelleen {count} kertaa",
    },
    "road.subsectionsCount": {
      one: "{count} alaluku:",
      other: "{count} alalukua:",
    },
    "road.showFewer": "Näytä vähemmän",
    "road.shortWords": "{count} s",
    "road.stepOfTotal": "{current} / {total}",
    "road.hideDetails": "Piilota tiedot",
    "road.readMilestone": "Lue etappi",
    "road.readThisSection": "Lue tämä osio",
    "road.onlyInWiki.fi": "Vain suomenkielisessä Wikipediassa",
    "road.onlyInWiki.sv": "Vain ruotsinkielisessä Wikipediassa",
    "road.onlyInWiki.en": "Vain englanninkielisessä Wikipediassa",
    "road.whySeed": "Tämä artikkeli",
    "road.whySimilar": "Samankaltainen ({pct} %)",
    "road.whySimilarNoPct": "Samankaltainen artikkeli",
    "road.whySharedCategoryPrefix": "yhteinen luokka:",
    "road.whyCategoryPrefix": "Luokka:",
    "timeslider.caption": "Muokkauksia kuukaudessa",
    "timeslider.editsInYear": "{edits} muokkausta vuonna {year}",
    "timeslider.warMonths": {
      one: "{count} muokkaussotakuukausi",
      other: "{count} muokkaussotakuukautta",
    },
    "timeslider.warMonthsWord": {
      one: "muokkaussotakuukausi",
      other: "muokkaussotakuukautta",
    },
    "scene.talvitieSublabel": "Talvitie-reitti",
    "scene.unlocated": "Paikantamattomat artikkelit",
    "scene.gapYears": "… {years} vuotta …",
    "scene.sectionRemoved": "Osio poistettu {year}",
    "scene.era1155": "1155: Ristiretkiaika",
    "scene.era1596": "1596: Nuijasota",
    "scene.era1809": "1809: Porvoon valtiopäivät",
    "scene.era1905": "1905: Suurlakko",
    "scene.era1918": "1918: Sisällissota",
    "scene.era1939": "1939: Talvisota",
    "scene.era1948": "1948: YYA-sopimus",
    "scene.era1995": "1995: EU-jäsenyys",
  },
  sv: {
    "page.title": "WikiMemory — Finlands historia på Wikipedia",
    "brand.name": "wikimemory",
    "search.placeholder": "Fråga om Finlands historia eller sök artikel…",
    "search.submit": "Sök",
    "ask.submit": "Fråga",
    "status.loading": "Laddar…",
    "lens.meaning": "Betydelse",
    "lens.history": "Historia",
    "lens.geography": "Geografi",
    "demo.chipLabel": "Hur slutade vinterkriget?",
    "demo.askQuery": "Hur slutade vinterkriget?",
    "demo.talvisotaSvt": "Vinterkriget (SVT-historik)",
    "demo.moscowThreads": "Moskovan rauhansopimus (5-stegs trådar)",
    "demo.talvitieTalvisota": "Vinterväg: Talvisota",
    "demo.winterRoad": "Vinterväg",
    "legend.fi": "Finska",
    "legend.sv": "Svenska",
    "legend.en": "Engelska",
    "legend.dispute": "Redigeringskrig",
    "nav.backToSky": "Tillbaka till himlen",
    "nav.openArticle": "Öppna artikel",
    "nav.openFullArticle": "Läs hela artikeln",
    "nav.close": "Stäng",
    "nav.clear": "Rensa",
    "nav.prev": "Föregående",
    "nav.next": "Nästa",
    "nav.stepCounter": "{current} / {total}",
    "nav.readMore": "Visa originaltext",
    "nav.hideText": "Dölj originaltext",
    "nav.readSection": "Läs avsnitt",
    "nav.closeSection": "Dölj avsnitt",
    "nav.saveConstellation": "Spara denna stjärnbild",
    "nav.savedConstellation": "Sparad: {title}",
    "lang.fi": "finska",
    "lang.sv": "svenska",
    "lang.en": "engelska",
    "langFrom.fi": "finska",
    "langFrom.sv": "svenska",
    "langFrom.en": "engelska",
    "mt.from": "Maskinöversatt från {langs}",
    "fallback.note": "Inte tillgänglig på svenska ännu. Visar originalet ({shown}).",
    "error.network": "Kunde inte nå servern. Försök igen.",
    "error.summaryLoad": "Kunde inte ladda artikelns sammanfattning. Försök igen.",
    "search.noMatches": "Inga artiklar matchar \"{query}\"",
    "search.emptyHint": "Inga artiklar matchar. Prova en plats, en person eller ett år.",
    "search.matchCount": {
      one: "{count} matchande artikel",
      other: "{count} matchande artiklar",
    },
    "search.alsoIn": "även på {langs}",
    "search.alsoInPrefix": "även på",
    "ask.kicker": "Historiskt RAG-svar",
    "ask.loading": "Söker i minnet och förbereder svar…",
    "ask.pendingHint": "Översatt svar skapas i bakgrunden — försök igen om en stund.",
    "ask.preparingHistory": "Förbereder svaret från Wikipedias historia…",
    "ask.readingYears": "Läser {count} års redigeringshistorik…",
    "ask.translating": "Översätter svaret till svenska…",
    "ask.pendingTimeout": "Svaret tar längre tid än väntat.",
    "ask.retry": "Uppdatera svar",
    "ask.topMatch": "Huvudartikel",
    "ask.openTrail": "Öppna sammanfattningsstig",
    "ask.noHistory": "Den här artikeln har ingen redigeringshistorik ännu.",
    "ask.openRevisionTitle": "Öppna version {revId} på finskspråkiga Wikipedia",
    "ask.changedTimes": {
      one: "Detta svar ändrades {count} gång",
      other: "Detta svar ändrades {count} gånger",
    },
    "ask.unchangedSince": "Svaret har inte ändrats sedan {year}",
    "ask.versionSpan": "Version {from}–{to} av {user}",
    "ask.changedBy": "Ändrad av {user} den {date}",
    "ask.diffToday": "Ordjämförelse mot idag",
    "ask.sources": "Källor",
    "ask.factsHeading": "Viktiga fakta",
    "threads.heading": "Minnestrådar från {title}",
    "panel.overview": "Översikt",
    "panel.today": "Idag",
    "panel.throughTime": "Genom tiden",
    "panel.summarize": "Sammanfatta",
    "panel.seeAsRoad": "Visa som väg",
    "panel.winterRoad": "Vinterväg",
    "panel.readOnWikipedia": "Läs på Wikipedia",
    "panel.imageCredit": "Bild: {artist}, {license}",
    "panel.commonsCredit": "Wikimedia Commons",
    "panel.siblingRead.fi": "Finns även på finska:",
    "panel.siblingRead.sv": "Finns även på svenska:",
    "panel.siblingRead.en": "Finns även på engelska:",
    "panel.alsoInPrefix": "Även på:",
    "panel.editStats": "Redigeringsstatistik",
    "panel.versions": {
      one: "{count} version",
      other: "{count} versioner",
    },
    "panel.versionsWord": {
      one: "version",
      other: "versioner",
    },
    "panel.reverts": {
      one: "{count} återställning",
      other: "{count} återställningar",
    },
    "panel.revertsWord": {
      one: "återställning",
      other: "återställningar",
    },
    "panel.disputes": {
      one: "{count} tvist",
      other: "{count} tvister",
    },
    "panel.disputesWord": {
      one: "tvist",
      other: "tvister",
    },
    "panel.monthBarTitle": "{month}: {edits} redigeringar, {disputes} tvister",
    "panel.firstEdit": "Första redigering: {date}",
    "panel.noArticleThen": "Artikeln hade inte skapats ännu år {year}.",
    "panel.editedByOn": "Redigerad av {user} den {date}",
    "panel.asOfYear": "Per år {year}",
    "panel.asOfToday": "Per idag",
    "panel.diffToday": "Ordjämförelse mot idag",
    "panel.todayOldid": "idag oldid={id}",
    "panel.unchangedBlocks": {
      one: "{count} oförändrat stycke",
      other: "{count} oförändrade stycken",
    },
    "panel.currentRevision": "Aktuell version",
    "panel.historicalSnapshot": "Version från {year}",
    "summary.modeTag": "Sammanfattningsstig",
    "summary.overviewKicker": "Artikelöversikt",
    "summary.sectionKicker": "Avsnitt {no}",
    "summary.ghostKicker": "Borttaget avsnitt",
    "summary.removedNote": "Borttagen {year} (senast sedd {from}–{to})",
    "summary.historyAdded": "Tillagd {year}",
    "summary.historyChanges": {
      one: "{count} ändring",
      other: "{count} ändringar",
    },
    "summary.historyWar": "redigeringskrig {years}",
    "summary.words": {
      one: "{count} ord",
      other: "{count} ord",
    },
    "summary.minRead": "{count} min läsning",
    "summary.progress": "Kort {current} av {total}",
    "summary.loading": "Laddar sammanfattning…",
    "summary.unavailable": "Sammanfattning inte tillgänglig.",
    "summary.subsectionsLabel": "Underavsnitt:",
    "summary.moreSubsections": "+{count} till",
    "summary.timeCompare": "{read} min → {summary} min",
    "summary.ghostShort": "Borttagen {year}: {heading}",
    "summary.archivedSectionMeta": "Arkiverat Wikipedia-avsnitt ({from}–{to}, borttaget {removed})",
    "summary.archivedInYear": "Avsnitt arkiverat år {year}.",
    "summary.hideArchivedText": "Dölj arkiverad text",
    "summary.readMore": "Läs mer",
    "summary.editWarTitle": "År med redigeringskrig",
    "summary.rewrittenTimes": {
      one: "omskriven {formattedCount} gång",
      other: "omskriven {formattedCount} gånger",
    },
    "summary.progressOverview": {
      one: "Översikt · {count} avsnitt",
      other: "Översikt · {count} avsnitt",
    },
    "summary.progressOverviewSingle": "Översikt · 1 av 1",
    "summary.sectionOf": "Avsnitt {no} av {total}",
    "summary.metaSections": {
      one: "{count} avsnitt · {read} min → {summary} min",
      other: "{count} avsnitt · {read} min → {summary} min",
    },
    "summary.metaOverview": "Översikt · {read} min",
    "summary.nativeLabel": "Sammanfattning av artikeln i svenskspråkiga Wikipedia",
    "summary.mtFromWiki.fi": "Maskinöversatt från finskspråkiga Wikipedia",
    "summary.mtFromWiki.sv": "Maskinöversatt från svenskspråkiga Wikipedia",
    "summary.mtFromWiki.en": "Maskinöversatt från engelskspråkiga Wikipedia",
    "summary.fiHistoryLabel": "Redigeringshistorik från finskspråkiga Wikipedia",
    "summary.historyBuilding": "Läser in redigeringshistorik…",
    "compare.alsoIn.sv": "Även i svenskspråkiga Wikipedia",
    "compare.alsoIn.en": "Även i engelskspråkiga Wikipedia",
    "compare.onlyFi": "Bara i finskspråkiga Wikipedia",
    "compare.compact.sv": "Även på svenska",
    "compare.compact.en": "Även på engelska",
    "compare.compact.onlyFi": "Bara på finska",
    "compare.onlyFiHintBoth": "Ingen liknande text hittades i svensk- eller engelskspråkiga Wikipedia",
    "compare.onlyFiHintSv": "Ingen liknande text hittades i svenskspråkiga Wikipedia",
    "compare.onlyFiHintEn": "Ingen liknande text hittades i engelskspråkiga Wikipedia",
    "compare.sectionPrefix": "Avsnitt:",
    "compare.leadLabel": "Inledning",
    "compare.readIn.sv": "Läs på svenskspråkiga Wikipedia",
    "compare.readIn.en": "Läs på engelskspråkiga Wikipedia",
    "road.modeTag": "Vintervägen Talvitie",
    "road.topicModeTag": "Ämnesväg",
    "road.sectionModeTag": "Artikelväg",
    "road.stationCounter": "Station {current} av {total}",
    "road.timelineMinimap": "Tidslinje",
    "road.branches": "Sidospår:",
    "road.ghostSections": "Borttagna avsnitt:",
    "road.returnToRoad": "Tillbaka till avsnitt",
    "road.readFullArticle": "Öppna hela artikeln",
    "road.topicStation": "Station {no}",
    "road.historicalMilestones": {
      one: "{count} historisk milstolpe",
      other: "{count} historiska milstolpar",
    },
    "road.historicalRoadFallback": "Historisk väg",
    "road.sectionNumbered": "Avsnitt {no}",
    "road.milestoneNumbered": "Milstolpe {no}",
    "road.milestoneCounter": "Milstolpe {current} av {total}",
    "road.sectionCounter": "Avsnitt {current} av {total}",
    "road.wordsAndMins": "{words} ord · {mins} min läsning",
    "road.removedSectionFallback": "Borttaget avsnitt",
    "road.removedInExisted": "Avsnitt borttaget {removed} (fanns {from}–{removed})",
    "road.removedHeadingExisted": "{heading} (fanns {from}–{removed})",
    "road.archivedIn": "Arkiverad avsnittstext borttagen från Wikipedia år {year}",
    "road.returnToSection": "Tillbaka till avsnitt {no}",
    "road.alsoCoveredIn": "Behandlas även på: {langs}",
    "road.finnishOnly": "Endast på finska",
    "road.editWarIn": "Redigeringskrig {years}",
    "road.addedChangedTimes": {
      one: "Tillagd {year} · ändrad {count} gång",
      other: "Tillagd {year} · ändrad {count} gånger",
    },
    "road.addedRewrittenTimes": {
      one: "Tillagd {year} · omskriven {count} gång",
      other: "Tillagd {year} · omskriven {count} gånger",
    },
    "road.subsectionsCount": {
      one: "{count} underavsnitt:",
      other: "{count} underavsnitt:",
    },
    "road.showFewer": "Visa färre",
    "road.shortWords": "{count} ord",
    "road.stepOfTotal": "{current} av {total}",
    "road.hideDetails": "Dölj detaljer",
    "road.readMilestone": "Läs milstolpe",
    "road.readThisSection": "Läs detta avsnitt",
    "road.onlyInWiki.fi": "Bara i finskspråkiga Wikipedia",
    "road.onlyInWiki.sv": "Bara i svenskspråkiga Wikipedia",
    "road.onlyInWiki.en": "Bara i engelskspråkiga Wikipedia",
    "road.whySeed": "Denna artikel",
    "road.whySimilar": "Liknande ({pct} %)",
    "road.whySimilarNoPct": "Liknande artikel",
    "road.whySharedCategoryPrefix": "gemensam kategori:",
    "road.whyCategoryPrefix": "Kategori:",
    "timeslider.caption": "Redigeringar per månad",
    "timeslider.editsInYear": "{edits} redigeringar år {year}",
    "timeslider.warMonths": {
      one: "{count} redigeringskrigsmånad",
      other: "{count} redigeringskrigsmånader",
    },
    "timeslider.warMonthsWord": {
      one: "redigeringskrigsmånad",
      other: "redigeringskrigsmånader",
    },
    "scene.talvitieSublabel": "Vintervägen Talvitie",
    "scene.unlocated": "Oplacerade artiklar",
    "scene.gapYears": "… {years} år …",
    "scene.sectionRemoved": "Avsnitt borttaget {year}",
    "scene.era1155": "1155: Korstågstiden",
    "scene.era1596": "1596: Klubbekriget",
    "scene.era1809": "1809: Borgå lantdag",
    "scene.era1905": "1905: Storstrejken",
    "scene.era1918": "1918: Inbördeskriget",
    "scene.era1939": "1939: Vinterkriget",
    "scene.era1948": "1948: VSB-pakten",
    "scene.era1995": "1995: EU-tiden",
  },
};

export function detectLang(
  navLang = typeof navigator !== "undefined" ? navigator.language || navigator.userLanguage || "" : "",
  storage = typeof localStorage !== "undefined" ? localStorage : null,
) {
  try {
    const saved = storage?.getItem?.(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {
    // Ignore restricted/throwing storage.
  }
  const lower = String(navLang || "").toLowerCase();
  if (lower.startsWith("fi")) return "fi";
  if (lower.startsWith("sv")) return "sv";
  return "en";
}

export const lang = detectLang();

export function t(key, vars = {}, targetLang = lang) {
  const table = STRINGS[targetLang] || STRINGS.en;
  let template = table[key] ?? STRINGS.en[key] ?? key;
  if (template && typeof template === "object") {
    const count = Number(vars.count);
    template = count === 1 ? template.one : template.other;
  }
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

export function fmtNumber(n, targetLang = lang) {
  if (n == null || n === "") return "";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat(LOCALES[targetLang] || "en-GB").format(num);
}

function _parseIsoUtcDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
  let raw = String(iso).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    raw = `${raw}T00:00:00Z`;
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    raw = `${raw.replace(" ", "T")}Z`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(iso, targetLang = lang) {
  const d = _parseIsoUtcDate(iso);
  if (!d) return iso ? String(iso) : "";
  return new Intl.DateTimeFormat(LOCALES[targetLang] || "en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(d);
}

const _displayNamesCache = new Map();

export function langName(code, targetLang = lang) {
  if (!code) return "";
  const locale = LOCALES[targetLang] || "en-GB";
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      let dn = _displayNamesCache.get(locale);
      if (!dn) {
        dn = new Intl.DisplayNames([locale], { type: "language" });
        _displayNamesCache.set(locale, dn);
      }
      const formatted = dn.of(code);
      if (formatted) return formatted;
    }
  } catch {
    // Fall back to static table if Intl.DisplayNames is unavailable or rejects code.
  }
  const key = `lang.${code}`;
  const table = STRINGS[targetLang] || STRINGS.en;
  return table[key] || STRINGS.en[key] || String(code);
}

export function mtFromLabel(sourceLangCodes, targetLang = lang) {
  const unique = [];
  for (const code of sourceLangCodes || []) {
    if (code && !unique.includes(code)) unique.push(code);
  }
  if (!unique.length) return "";
  const names = unique.map((c) => {
    const table = STRINGS[targetLang] || STRINGS.en;
    return table[`langFrom.${c}`] || STRINGS.en[`langFrom.${c}`] || c;
  });
  return t("mt.from", { langs: names.join(", ") }, targetLang);
}

export function fallbackNoteText(shownLangCode, targetLang = lang) {
  const target = langName(targetLang, targetLang);
  const shown = langName(shownLangCode, targetLang);
  return t("fallback.note", { target, shown }, targetLang);
}

export function setLang(code) {
  if (!SUPPORTED.includes(code)) return;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, code);
    }
  } catch {
    // Ignore storage failures in private browsing.
  }
  if (typeof location !== "undefined" && typeof location.reload === "function") {
    location.reload();
  }
}

export function applyStatic(root = typeof document !== "undefined" ? document : null) {
  if (!root) return;
  if (root.documentElement) {
    root.documentElement.lang = lang;
  }
  if ("title" in root) {
    root.title = t("page.title");
  }
  for (const el of root.querySelectorAll?.("[data-i18n]") || []) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll?.("[data-i18n-placeholder]") || []) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll?.("[data-i18n-title]") || []) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of root.querySelectorAll?.("[data-i18n-query]") || []) {
    el.dataset.query = t(el.dataset.i18nQuery);
  }
  for (const btn of root.querySelectorAll?.("[data-ui-lang]") || []) {
    const active = btn.dataset.uiLang === lang;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}
