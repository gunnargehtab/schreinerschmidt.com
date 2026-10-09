# Content inventory of the old site (www.schreinerschmidt.com)

Source: the live Webflow site, crawled on 2026-10-09 (last published 20 Nov 2023). This file is the **migration source of truth** for copy.

- Copy is quoted verbatim, typos included. A list of corrections is at the end.
- `⏎` marks a forced line break (`<br>`) in the original.
- Every image URL is prefixed with `https://cdn.prod.website-files.com/62e8c86393d73a7acebb0e1f/`.
- Every image on the old site has an empty alt text, so all alt texts must be written from scratch.

> Before reusing any image, check its rights. See `docs/plan.md` §3.3: PaX AG, Adobe Stock, Steel Interior and Admonter images are **excluded**.

## Site-wide facts

**Business details**
- Name: "Schreinerei Schmidt". The Impressum and forms use "Schreiner Schmidt"; the new site uses **Schreinerei Schmidt** everywhere.
- Owner: Ulf Schmidt, Schreinermeister since 2010.
- Address: Andreas-Hofer-Str. 33, D-68259 Mannheim.
- Phone: mobile only, +49 (0) 179 946 78 22 (`tel:+491799467822`).
- E-mail: info@schreinerschmidt.com.

**Tagline and old homepage**
- Logo tagline: "UMWELTBEWUSSTES HOLZHANDWERK".
- Hero subline: "Ihr Experte für umweltbewusstes Holzhandwerk".
- Homepage `<title>`: "Ihr Experte für umweltfreundliches Holzhandwerk".

**From other sources (unconfirmed)**
- Google rating: **5.0 from 115 reviews** (aggregated by werkenntdenbesten, data as of 30.09.2026).
- werkenntdenbesten also lists Mon–Fri 07–17 opening hours.
- join.com lists Ulf Schmidt as managing director, 1–10 employees, jobs for Schreiner:in and Parkettleger, €36–42k, 4-day week.

**Brand colours (old CSS)**

| Role | Hex |
|---|---|
| Brand red | #9E2124 |
| Logo red | #8B101B |
| Espresso | #2C1403 |
| Cream | #FFFBF5 |
| Linen | #F5F2E7 |
| Sand | #EBE5D1 |
| Mahogany | #6B3630 |

**Logo:** `62fdeca9bdc81d826ce7fa07_Logo.png` is a 702×107 PNG wordmark: "SCHREINEREI SCHMIDT" in heavy condensed caps (#8B101B), with the tagline in #BABABA underneath.

**Favicon:** `630a3c673591b5b10c6d1d3d_Favicon_SchreinereiSchmidt%20(1).png`, a red "S" at 32 px.

## Header and footer

**Navigation:**
- Leistungen
- Referenzen
- Über uns
- Jobs
- Button: Kontakt

**Footer columns:**
- **"Seiten":** Startseite, Leistungen, Konfigurator (dead link), Über uns, Jobs (dead link), Kontakt, Impressum, Datenschutz.
- **"Kontakt":** "Ulf Schmidt ⏎ Schreinermeister ⏎⏎ Andreas-Hofer-Str. 33 ⏎ D-68259 Mannheim ⏎⏎ Mobil +49 (0) 179 946 78 22 ⏎ info@schreinerschmidt.com"
- **"Jetzt Anfragen":** a form with Name, E-Mail, PLZ, Wohnort, Telefon and Nachricht. All fields are required and have placeholder text only.
  - Checkbox: "Ich habe die Datenschutzerklärung gelesen und akzeptiere diese."
  - Submit button: "Senden"
  - Success message: "Vielen Dank für Ihre Anfrage. Wir werden uns schnellst möglichst mit Ihnen in Verbindung setzten."
  - Error message: "Leider ist ein Fehler aufgetreten. Versuchen Sie es erneut."

**Footer background:** `630a3c3454ad11a64145852b_Footer_final-09-09.png`, a pencil sketch of steps and a door.

## `/` (homepage)

### Hero
- **H1:** "Willkommen bei der Schreinerei Schmidt in Mannheim". The phone version says "aus Mannheim".
- **Subline:** "Ihr Experte für umweltbewusstes Holzhandwerk."
- **Button:** "Zu unseren Leistungen"
- **Photos:**
  - Desktop: `634682a8759e2afd6c7a010e_schreiner_schmidt_zu_hause.jpeg`. Stock-like, origin unverified.
  - Mobile: `634680f898f82cf4dd45475d_Sonnenplatze.jpeg`. Real photo of balcony decking.

### Service tiles
Each tile pairs a sketch with a link.

| Tile | Sketch | Note |
|---|---|---|
| Böden | `63171a4c75fe3f7e9b5e76ba_skizze_boden.png` | |
| Möbel | `63171a4c935a316d7c39ac6c_tisch_schwarz.png` | Clip-art table |
| Fenster | `63171a4c3f94a2fbc58a2820_skizze_fenster.png` | |
| Altbau Sanierung | `63171a4c935a31b02739ac6b_Wirklich%20traumhafte%20Hausboote%402x.png` | Arched window |
| Türen | `63171a4cbf708f6a450b729c_Bildschirmfoto%202022-07-21%20um%2009.50.45%402x.png` | Sliding door |
| Terrassen | `63171a4c75fe3fb19e5e76b9_skizze_treppe.png` | Deck with steps |

### Key facts
- "Meister seit 2010" / "Über 10-Jährige Meistererfahrung"
- "+1.000 erfüllte Kundenwünsche" / "Mit dem gesamten Team zaubern wir auch Ihnen ein Lächeln ins Gesicht"
- "Top Bewertet" / "5,0 Sternebewertung auf Google"
- Button: "Zu den Referenzen"

### Testimonials (verbatim)
1. "Herr Schmidt hat alle Schreinerarbeiten in unserem Haus, z. B. neue Türen, Holzdielen verlegen, alte Böden aufarbeiten, Waschtische für Badezimmer, Fensterbänke etc. sehr genau u gewissenhaft erledigt. Er hat eine ruhige, angenehme Art u ist auch bei kleinen Reparaturen sofort zur Stelle. Super Schreiner mit Umweltbewusstsein!!!!" — **Biggi N.**
2. "Wir wurden von Herrn Schmidt sehr gut und ausführlich beraten. Dabei hatten wir immer das Gefühl, dass unsere Vorstellungen berücksichtigt wurden. Hervorzuheben ist auch sein ökologischer Ansatz in der Holzauswahl. Top Schreiner. Wir können Herrn Schmidt wärmstens empfehlen." — **Christian E.**
3. "Super zufrieden mit allem, was Herr Schmidt bisher für uns ausgeführt hat! Verlässlichkeit, Kompetenz und prompte Kommunikation gehören für ihn und sein Team zum Standard. Alle Daumen hoch!" — **Alexander H.**

Card backgrounds (real projects):
- `63d5446a83094f1632d1c483_KOWA%20Haust%C3%BCr%20.jpg`
- `63dfa1556459303114750836_IMG_20210423_171553.jpg`
- `6405e88edd1f951832d788d3_IMG_20230203_125350.jpg`

### Hidden configurator teaser
This block was never visible on the old site.
- H2: "In 3 Minuten zu Ihrem individuellen Angebot"
- Text: "Konfigurieren Sie Ihr individuelles Projekt und erhalten Sie Ihr Angebot."
- **Do not reuse** the video "video_Schreiner" (lathe footage, origin unknown).

## `/leistungen/leistung` (services overview)

**Intro**
- H1: "Unsere Leistungen".
- The intro text is wrongly copied from the Fenster page. **Rewrite it.**

**Cards (H3 / teaser):**
- **Hochwertige Böden für jeden Stil:** "Handverlegte Böden aus Holz gewinnen über die Jahre an Charakter und machen Ihr Zuhause zu einem unverwechselbaren Einzelstück."
- **Maßgefertigte Fenster für die beste Sicht:** "Lassen Sie Ihren Wohnraum mit Fenstern aus nachhaltigen Holzressourcen hell erstrahlen."
- **Ökologische Altbausanierung für Ihren Wohntraum:** "Holzelemente aus vergangenen Epochen machen Ihr Zuhause zu einem unverwechselbaren Einzelstück"
- **Langlebige Terrassen für jede Witterung:** "Machen Sie Ihre Terrasse mit einem wetterbeständigen Bodenbelag aus nachhaltigen Holzressourcen zu Ihrem neuen Lieblingsort."
- **Widerstandsfähige Türen für Innen und Außen:** "Öffnen Sie Ihren Wohnraum mit Türen aus nachhaltigen Holzressourcen"
- **Individuelle Möbel für die Magie im Alltag:** "Individualisieren Sie Ihren Wohnraum mit Möbeln aus nachhaltigen Holzressourcen."

## `/leistungen/boden`

**Title:** "Böden aus umweltfreundlichen Ressourcen"

**Intro**
- H2: "Hochwertige Böden für jeden Stil"
- Left column: "Tragen Sie die Geschichten Ihres Wohnraums mit Böden aus nachhaltigen Ressourcen sorglos in die Zukunft weiter. Hand verlegte Böden aus Holz gewinnen über die Jahre an Charakter und machen Ihr Zuhause zu einem unverwechselbaren Einzelstück."
- Right column: "Mit der Schreinerei Schmidt können Sie Ihre individuellen Vorstellungen maßgeschneidert realisieren. Wir verbinden Design und Funktionalität für das beste Ergebnis in allen gängigen Bodenausführungen, von verschiedenen Parketten über Dielen und Korkböden."

**Floor types** (each was shown with a sticky side menu, an H3, text and an image):

| Type | Text (verbatim) |
|---|---|
| **Stabparkett** | "Stabparkett ist der Klassiker unter den Parkettböden. Die massiven Holzstücke kommen mit ihren klassischen Abmessungen durch extreme Stabilität und Langlebigkeit auf. Lassen Sie uns gemeinsam die Holzart und den Härtegrad in Abhängigkeit Ihrer Raumnutzung wählen." |
| **Hochkantlamellenparkett** | "Hochkantlamellenparkett besteht aus etwa 8 mm breiten und hochkant liegenden Holzstäben. Durch die schmale Sichtfläche der Stäbchen ergibt sich ein modernes und harmonisches Erscheinungsbild im Raum. Nutzen Sie diese robuste und günstige Parkettart mit der entsprechenden Holzart besonders erfolgreich in Räumen der Industrie oder Gastronomie." |
| **Mosaikparkett** | "Beim Mosaikparkett können Sie Ihre Kreativität spielen lassen: Verschiedene Holz-Arten und Legemuster bieten eine breite Palette an Möglichkeiten. Erhalten Sie einen individuellen und strapazierfähigen Boden, ganz nach Ihrem Geschmack." |
| **Fertigparkett** | "Fertigparkett besteht aus zwei bis drei Schichten verleimten Holzes und einer edlen Deckschicht. Fertigparkett ist in verschiedenen natürlichen Hölzern lieferbar und eignet sich gut für großflächige Büros und Gewerberäume oder Wohnhäuser. Nutzen Sie Fertigparkett besonders effizient bei Projekten, bei denen Sie nur ein kleines Zeitfenster für die Verlegung haben." |
| **Massivdielen / Landhausdielen** | "Massivdielen oder Landhausdielen werden unbehandelt auf eine Unterkonstruktion oder einen Estrich geklammert oder verschraubt. Die Hölzer gibt es in verschiedenen Qualitäten, Farben und Oberflächeneigenschaften (z.B. mit oder ohne Astlöcher oder Risse). Ich verarbeite massive Landhausdielen in einer Länge von bis zu fünf Metern und einer Breite bis zu 60 Zentimetern – ein in Europa einzigartiges Angebot. Geben Sie Ihrem Raum mit selbst ausgewählten Dielen einen individuellen Charakter." |
| **Kork und Linolium** | "Kork und Linoleum sind Naturprodukte aus Korkeichenrinde. Beide Böden-Varianten sind angenehm fußwarm, robust und eignen sich zum Beispiel gut fürs Kinderzimmer. Lassen Sie mich beide Bodenbeläge zum Schutz Ihrer Gesundheit mit einem natürlichen Kleber von Auro verkleben." |

Notes on the floor types:
- **Massivdielen:** the claim "einzigartig in Europa" cannot be verified. **Soften it.**
- **Kork und Linoleum:** the text is **factually wrong**. Linoleum is made from linseed oil, not cork. "Linolium" is also a typo.
- **Images:** the floor-type images are stock-like textures. Exception: the Massivdielen image `63cef58d9f99bd2e50f024b1_2019-09-20.jpg` is a real project (attic loft, only 540 px).

## `/leistungen/mobel`

- **Title:** "Möbel in Handarbeit für Sie gefertigt"
- **H2:** "Individuelle Möbel für die Magie im Alltag"
- **Body:**
  - "Individualisieren Sie Ihren Wohnraum mit Möbeln aus nachhaltigen Holzressourcen. Handgemachte Möbel aus Holz machen Ihr Zuhause zu einem unverwechselbaren Einzelstück."
  - "Mit der Schreinerei Schmidt können Sie Ihre individuellen Vorstellungen maßgeschneidert realisieren. Wir verbinden Design und Funktionalität für das beste Ergebnis in allen Ausführungen, egal ob Schrank, Tisch, Bett, Regal oder Anrichte."
  - "Lassen Sie sich von uns bei der Planung Ihres Möbelstücks beraten. Dem Klima- und Umweltschutz folgend, fertigen wir Ihre Möbel mit Materialien aus nachhaltiger Waldwirtschaft und vorzugsweise mit Naturprodukten. Für größere Projekte arbeiten wir mit Netzwerk-Partnern zusammen, dazu gehören viele Fachhandwerker und Handwerksbetriebe. Verwirklichen Sie Ihr individuelles Projekt und genießen Sie den Anblick und Nutzen Ihrer personalisierten Möbelstücke."
- **Photo:** `655a0e6c3fb524b2a9228233_20230914_150410_1.jpg`, a built-in wall unit with its doors open (real project, Sep 2023).

## `/leistungen/fenster`

- **Title:** "Nachhaltig eingebaute Fenster in Ihrem zu Hause"
- **H2:** "Maßgefertigte Fenster für die beste Sicht"
- **Body:**
  - "Lassen Sie Ihren Wohnraum mit Fenstern aus nachhaltigen Holzressourcen hell erstrahlen. Handgemachte Fenster aus Holz machen Ihr Zuhause zu einem unverwechselbaren Einzelstück. Mit der Schreinerei Schmidt können Sie Ihre individuellen Vorstellungen maßgeschneidert realisieren. Wir verbinden Design und Funktionalität für das beste Ergebnis in den Bereichen Schallschutz, Isolierung und Sicherheit. Lassen Sie sich von uns bei der Planung und Auswahl Ihrer Fenster beraten. Wir übernehmen auf Wunsch hin alle anfallenden Leistungen zu Rolladenarbeiten, Fensterbänken und Gurten."
  - "Dem Klima- und Umweltschutz folgend, fertigen wir Ihre Fenster mit Materialien aus nachhaltiger Waldwirtschaft und vorzugsweise mit Naturprodukten an. Für größere Projekte arbeiten wir mit Netzwerk-Partnern zusammen, dazu gehören viele Fachhandwerker und Handwerksbetriebe.Verwirklichen Sie Ihr individuelles Projekt und betrachten Sie die Außenwelt durch unsere zeitlos schönen Fenster aus Holz"
- **Photo:** "Fenster Detail 13_1.jpg" is **EXCLUDED**. Its EXIF says "Copyright PaX AG".

## `/leistungen/altbau`

- **Title:** "Historie trifft auf Moderne Schreinerkunst"
- **H2:** "Ökologische Altbausanierung für den lang ersehnten Wohntraum"
- **Body:**
  - "Lassen Sie Ihren Altbau mit einer fachmännischen Aufbereitung wieder in neuem Glanz erstrahlen. Holzelemente aus vergangenen Epochen machen Ihr Zuhause zu einem unverwechselbaren Einzelstück. Damit dieser besondere Charm erhalten bleibt, widmen wir uns bei der Schreinerei Schmidt der Sanierung alter Holztreppen, Vertäfelungen und Aufbereitung von Holzdielen. Lassen Sie sich von uns bei der Planung und Sanierung Ihres Wohnraums beraten. Sollten bestehende Holzkonstruktionen nicht zu erhalten sein, stellen wir das Flair auf Wunsch hin durch den Einbau eines neuen, hochwertigen Äquivalents wieder her."
  - "Dem Klima- und Umweltschutz folgend, nutzen wir bei der Aufbereitung nur Materialien aus nachhaltiger Waldwirtschaft und vorzugsweise Naturprodukte. Für größere Projekte arbeiten wir mit Netzwerk-Partnern zusammen, dazu gehören viele Fachhandwerker und Handwerksbetriebe. Verwirklichen Sie Ihr individuelles Projekt und steigern Sie den Wert Ihrer Immobilie durch eine liebevolle und hochwertige Sanierung."
- **Photo:** `63467357ee5b6b16e1a4fec8_ss_Rezessionen1.jpg`. Period stairwell, restored balustrade, cement-tile runner, white entrance door. Same scene as the KOWA photo.

## `/leistungen/turen`

- **Title:** "Türen aus umweltfreundlichen Ressourcen"
- **H2:** "Robuste Türen für Innen und Außen"
- **Body:**
  - "Öffnen Sie Ihren Wohnraum mit Türen aus nachhaltigen Holzressourcen. Handgemachte Türen aus Holz machen Ihr Zuhause zu einem unverwechselbaren Einzelstück. Mit der Schreinerei Schmidt können Sie Ihre individuellen Vorstellungen maßgeschneidert realisieren."
  - "Wir verbinden Design und Funktionalität für das beste Ergebnis in den Bereichen Einbruchschutz, Brandschutz, Dämmung sowie Schallschutz. Lassen Sie sich von uns bei der Planung und Auswahl Ihrer Türen beraten."
  - "Wir bieten Ihnen passende Haustüren und Türen für den Innenbereich. Dem Klima- und Umweltschutz folgend, fertigen wir Ihre Türen mit Materialien aus nachhaltiger Waldwirtschaft und vorzugsweise mit Naturprodukten. Für größere Projekte arbeiten wir mit Netzwerk-Partnern zusammen, dazu gehören viele Fachhandwerker und Handwerksbetriebe. Verwirklichen Sie Ihr individuelles Projekt und betreten Sie die Außenwelt durch unsere zeitlos schönen Türen aus Holz."
- **Photo:** `63467f5e3618be0527845a23_2_Stilvolle_Holzhaustuer_nachher.jpeg`, a dark blue classic front door ("after" photo). The "before" photo is `63467f5e9d2ab60b0e79da8c_1_Stilvolle_Holzhaustuer_vorher.jpeg`.

## `/leistungen/terrassen`

- **Title:** "Terrassen aus umweltfreundlichen Ressourcen"
- **H2:** "Langlebige Terrassen für jede Witterung"
- **Body:**
  - "Machen Sie Ihre Terrasse mit einem wetterbeständigen Bodenbelag aus nachhaltigen Holzressourcen zu Ihrem neuen Lieblingsort. Eine Terrasse mit einem handverlegten Holzboden macht Ihren Garten oder Balkon zu einem unverwechselbaren Einzelstück."
  - "Mit der Schreinerei Schmidt können Sie Ihre individuellen Vorstellungen maßgeschneidert realisieren. Wir verbinden Design und Funktionalität für das beste Ergebnis. Lassen Sie sich von uns bei der Planung und Auswahl Ihrer Fenster beraten." (copy-paste error: "Fenster")
  - "Bei der Entscheidung für Holzdielen auf dem Balkon oder der Terrasse kommt es vor allem auf die richtige Holzart an. Profitieren Sie bei dieser Wahl von dem unvergleichlichen Wissen unserer Handwerkertradition.Dem Klima- und Umweltschutz folgend, fertigen wir Ihren Terrassenboden mit Materialien aus nachhaltiger Waldwirtschaft und vorzugsweise mit Naturprodukten. Für größere Projekte arbeiten wir mit Netzwerk-Partnern zusammen, dazu gehören viele Fachhandwerker und Handwerksbetriebe.Verwirklichen Sie Ihr individuelles Projekt und genießen Sie Ihren Außenbereich bei jeder Wetterlage."
- **Photo:** Sonnenplatze.jpeg (balcony decking).

## `/referenzen`

- **H1:** "Unsere Referenzen"
- **Text:** "Mit Holz realisieren wir Ihren Wohntraum. Ob für ein Wohnzimmer, eine Praxis oder Kanzlei – Lassen Sie sich für Ihr eigenes Projekt gerne mit einer Arbeit aus unserer Referenzliste inspirieren."
- **Video:** an Adobe Stock watermark preview. **EXCLUDED.**

**Gallery:** grouped by category, with no titles or captions. Ownership as assessed in the audit:

| Category | Images |
|---|---|
| **Fenster & Türen** | `_MG_2703_RGB_web.jpg`, `_MG_2939_RGB_web.jpg` (**PaX AG – exclude**); `63467f5e3618be799c845a22_auf_engstem_raum.jpeg` (two spruce interior doors, tight bathroom, real); Steel-Interior images ×2 (**exclude**); `63467f5e98f82c3a10453ffb_balkontur_im_altbau.jpeg` (real); Braubachstraße facade and the Neorenaissance Haustür (EXIF Copyright „PaX AG“, found during migration – **exclude**); Admonter Naturholzplatte (**exclude**); Türen collage (**stock – exclude**); Haustür vorher/nachher (real) |
| **Möbel** | `6346804c4dce67784bbd1427_massivholzbett_in_kernbuche.jpeg` (bed); `63cef6593370e506bf289ff5_IMG_20181126_130556.jpg` and `63cef6679f99bd4763f11798_IMG_20181126_130700.jpg` (shoji wardrobe, closed and open); `63467e26c3f36b085b613413_ein_blick_durchs_ganze_haus.jpeg` (period hallway with oak stair treads); `6346804d98f82c10e74543f8_DSCF3091.jpeg` (writing desk with fold-down flap); `655a0e39754b348afe09d381_20230914_150222_1.jpg` and `…150410_1.jpg` (wardrobe wall, closed and open); `6346804ca336aa361286ad0c_badgestaltung_DSCF2263.jpeg` (bathroom vanity); `6346804cf202f852c69ff68d_glasvitrine_mit_integrierter_beleuchtung.jpeg`; `634680681f0d7778f093c9e8_DSCF3084.jpeg` (TV sideboard); Robinie_Mocca (possibly a supplier image – exclude) |
| **Terrasse** | Sonnenplatze (real); `634680f861ca47c38c7aae91_zaunanlage_DSCF2820.jpeg` (garden gate) and `634681233030a169126749e5_zaunanlage_DSCF2815.jpeg` (fence), both real; schreiner_schmidt_terasse 1–3 (**stock – exclude**) |
| **Treppen** | Admonter ×3 (**exclude**); `63467e26078daa221b504a42_ein_schwarzer_handlauf_setzt_akzente.jpeg` (real); `63467e3cfdfbaa0fde8b9426_Handlauf_und_Trittstufen_wurden_geolt__gewachst.jpeg` (real) |
| **Altbau** | `63cef58d9f99bd2e50f024b1_2019-09-20.jpg` (attic loft); `63cef60dbc50fe04527e110a_IMG_20200527_150359.jpg` (period room with new oak boards); `63cef5cff7bbf40487275446_Eiche%20Fischgr%C3%A4tparkett.jpg` (oak herringbone); `634681a7426459137d517d5b_eiche_fischgratparkett.jpeg`; `63dd2d52d51725e3fc8ccbec_Treppe%20Eiche%20Massivholz%20naturge%C3%B6lt.jpg` (same photo as IMG_20230203) |
| **Böden** | schreiner_schmidt_kuche and schreiner_schmidt_boden (**stock – exclude**); Admonter (**exclude**); schreiner_schmidt_zu_hause (stock-like); `634682a827d32783761a486b_kiefer_landhausdielen_geolt__gewachst.jpeg` (pine floorboards, real) |

## `/team-karriere` (old "Über uns" + jobs)

### Hero
- **H1:** "Hallo, ich bin Ulf Schmidt"
- **Text:** "Schreiner aus Leidenschaft und Meister seit dem Jahr 2010. Gemeinsam mit meinem Team verwirklichen wir die Wünsche unserer Kunden mit umweltbewusstem Holzhandwerk. Die Grundlage unserer Arbeit bildet dabei das Vertrauen, das unsere Kunden in uns und unser Handwerk stecken."

### About section
- **H2:** "Wir sind Experten für umweltbewusstes Holzhandwerk."
- **Text:** "Unser Anspruch ist, als verlässlicher Partner alle Arten von Holzkonstruktionen qualitativ und in der gewünschten Ästhetik unserer Kunden umzusetzen. Im Hinblick auf die Zukunft tragen wir mit umweltschonenden Materialien und einer nachhaltigen Arbeitsweise zudem unseren Teil gegen Klimawandel bei. So haben wir gemeinsam schon mehr als 1.000 Kundenprojekte realisiert. Setzen Sie auch Ihr individuelles Projekt mit unserer Unterstützung hochwertig und nachhaltig um."
- **Team photo:** `63d51c3621df9f7b7ba89fc2_Team1.jpg`, four people under a round timber roof frame. **Publishing it needs consent.**
- **Unused portrait:** `634674091be1f9125a9c4bd0_ulf_schmidt.jpg`.

### Jobs (anchor `#jobs`)
- **H2:** "Unsere Jobs"
- **Text:** "Bei der Schreinerei Schmidt verwirklichen wir Kundenprojekte rund um hochwertige und ökologische Holzarbeiten. Wir leben unsere berufliche Leidenschaft als Teil eines dynamischen Teams aus."
- **Benefits:** 4-Tage-Woche · Überdurchschnittlicher Lohn · Persönlicher Montagebus · Cooles Team & Equipment!
- **Bauschreiner (m/w/d):** "Lass uns gemeinsam mit Dir als Schreiner:in alle Kundenprojekte mit nachhaltigen und hochwertigen Produkten sowie Herzblut realisieren."
- **Parkettleger (m/w/d):** "Wir bieten einen dauerhaften und attraktiven Arbeitsplatz, der durch ein hohes Maß an Eigenverantwortung und Mitbestimmung im Projektwesen gekennzeichnet ist."
- The postings have no requirements, hours or contact person. These are **owner questions**.

## `/bewerben`

- **H2:** "Jetzt bewerben !"
- **Button:** "Direkt anrufen"
- **Form fields:** Name, E-Mail, "Bewerbung für" (Parkettleger/in, Schreiner/in, Initiative Bewerbung), Nachricht, privacy checkbox. There is **no CV upload**.

## `/kontakt`

- **H2:** "Kontaktieren Sie uns für eine gemeinsame Zusammenarbeit"
- **Button:** "Direkt anrufen"
- **Form fields:** Name, E-Mail, "Interessiert in" (Beratungsgespräch, Angebot, Leistungsauswahl, Sonstige Anfrage), Nachricht.
- **Submit button:** "Anfrage senden"

## `/impressum` (old content; rewrite to §5 DDG)

- **Heading:** "Angaben Gemäß §5 TMG"
- **Address block:** "Ulf Schmidt ⏎ Schreiner Schmidt ⏎ Andreas-Hofer-Str.33 ⏎ 68259 Mannheim"
- **Kontakt:** "Telefon: +49 (0)179 - 946 78 22, E-Mail: info@schreinerschmidt.com"
- **EU-Streitschlichtung:** an ODR link. **Remove it**; the platform shut down on 20.07.2025.
- **Verbraucherstreitbeilegung:** "Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."
- **Bildnachweis:** "Admonter, Woodline"
- **Missing:** legal form, USt-IdNr., Berufsbezeichnung, Kammer, Handwerksrolle.

## `/datenschutz`

Do not reuse. It names the wrong host (amargo/Matomo) and contains Lorem ipsum. Rewrite it from scratch for the new stack (plan §7).

## Known errors to fix in the migration

**Typos and grammar** (old → new):

| Old | New |
|---|---|
| "Über 10-Jährige" | "seit 2010" (years computed at build time) |
| "schnellst möglichst … setzten / setzte" | "schnellstmöglich … setzen" |
| "Hand verlegte" | "Handverlegte" |
| "Holz-Arten" | "Holzarten" |
| "Böden-Varianten" | "Bodenvarianten" |
| "Linolium" | "Linoleum" |
| "z.B." | "z. B." |
| "Rolladen" | "Rollladen" |
| "auf Wunsch hin" | "auf Wunsch" |
| "Charm" | "Charme" |
| "Moderne Schreinerkunst" | "moderne Schreinerkunst" |
| "Interessiert in" | "Interessiert an" |
| "gemeinsame Zusammenarbeit" | "Zusammenarbeit" |
| "Jetzt bewerben !" | "Jetzt bewerben!" |
| "Andreas-Hofer-Str.33" | "Andreas-Hofer-Str. 33" |

Also fix:
- Missing spaces after full stops ("Handwerksbetriebe.Verwirklichen", "Handwerkertradition.Dem").

**Facts and copy errors:**
- Linoleum is made from linseed oil, not from cork-oak bark.
- The Terrassen page says "Fenster"; it should talk about the terrace.
- The Leistungen intro is the Fenster text.
- "ein in Europa einzigartiges Angebot" cannot be verified.
- The "Ich/mich" vs "wir" voice is mixed. Use **"wir"**, except in Ulf's personal intro.

**Testimonials:** keep the customers' wording ("u", "!!!!") unless permission is given to edit it.

**Green claims (UWG / EU 2024/825, in force since 27.09.2026):**
- Generic claims such as "umweltfreundlich", "nachhaltig", "ökologisch", "Naturprodukte" and "umweltschonend" need substantiation.
- Replace them with specific, verifiable statements flagged `needs-review`.
