---
title: Datenschutzerklärung
seo:
  title: Datenschutzerklärung
  description: 'Datenschutzerklärung der Schreinerei Schmidt: keine Cookies, kein Tracking. Wie wir Daten bei Hosting, Formularen und Bewerbungen verarbeiten.'
stand: 2026-10-10
review:
  status: needs-review
  note: 'Rechtliche Prüfung ausstehend'
---

<!--
  Written for the actual stack (docs/plan.md §7, docs/architecture.md §9): Astro static site, GitHub Pages in the demo,
  form.taxi as processor in production, no cookies, no third-party requests, self-hosted fonts.
  Tokens such as {{legalName}} are resolved from src/content/settings.yaml. Blocks fenced by a demo marker line and a
  closing /demo marker line render only in demo builds; production marker lines work the same for production builds
  (src/lib/legal-tokens.ts). In production builds, assistant marker lines fence the text for the assistant backend
  (PUBLIC_ASSISTANT_ENDPOINT set, decision D3 in docs/assistant.md) and formtaxi marker lines the text for the form.taxi
  fallback; exactly one of the two kinds renders. The markers must stand on lines of their own, must not nest and must
  not be written out inside this comment.

  The hosting section is self-contained so it can be swapped for an EU host.
-->

## Verantwortlicher

Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist:

{{legalName}}, Inhaber {{owner}}\
{{street}}\
{{postalCode}} {{city}}\
Telefon: {{phone}}\
E-Mail: {{email}}

Einen Datenschutzbeauftragten müssen wir nach Art. 37 DSGVO und § 38 BDSG nicht benennen. <!-- needs-review: Betriebsgröße (weniger als 20 ständig mit automatisierter Verarbeitung beschäftigte Personen) vom Inhaber bestätigen. -->

## Das Wichtigste in Kürze

Diese Website kommt ohne Cookies aus. Wir setzen keine Analyse- oder Tracking-Dienste ein, laden keine Schriften, Skripte, Videos oder Karten von fremden Servern und binden keine Social-Media-Plugins ein. Ihr Browser stellt nur Verbindungen zu dem Server her, der die Website ausliefert, und, wenn Sie ein Formular absenden, zu dem Dienst, der das Formular für uns entgegennimmt. Personenbezogene Daten verarbeiten wir nur, wenn Sie uns kontaktieren, eine Anfrage senden oder sich bewerben.

<!-- assistant -->

Anfragen aus dem Konfigurator nimmt unser eigener Anfrage-Server entgegen. Er berechnet nach festen Regeln einen unverbindlichen Preisrahmen und lässt Ihre Projektangaben, ohne Ihre Kontaktdaten und ohne Ihre Fotos, von einem KI-Modell bewerten. Ob und was Sie von uns erhalten, entscheidet immer ein Mensch. Einzelheiten stehen im Abschnitt „Anfragen und Preisrahmen“.
<!-- /assistant -->

## Hosting und Server-Logs

<!-- hosting: GitHub Pages. Replace this whole section when the site moves to an EU host. -->

<!-- production -->

[[Platzhalter: Hosting-Anbieter für den Livebetrieb festlegen und diesen Abschnitt anpassen (GitHub Pages ist nur für die Demo vorgesehen).]]

<!-- /production -->

Diese Website wird auf GitHub Pages gehostet, einem Dienst der GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Beim Aufruf einer Seite überträgt Ihr Browser technisch notwendige Daten an den Server: Ihre IP-Adresse, Datum und Uhrzeit des Zugriffs, die aufgerufene Seite, die übertragene Datenmenge, den Browsertyp und das Betriebssystem. GitHub speichert diese Daten in Server-Logs, um den Dienst sicher und stabil zu betreiben und Angriffe abzuwehren. Wir selbst haben keinen Zugriff auf diese Logs.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. f DSGVO. Unser berechtigtes Interesse liegt in der sicheren und zuverlässigen Bereitstellung der Website. Die Verarbeitung findet teilweise in den USA statt. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert; die Übermittlung stützt sich auf den Angemessenheitsbeschluss der Europäischen Kommission nach Art. 45 DSGVO. <!-- needs-review: DPF-Zertifizierung von GitHub, Inc. in der DPF-Liste prüfen. --> Weitere Informationen enthält die [Datenschutzerklärung von GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

Zur schnelleren Navigation kann Ihr Browser Seiten unserer Website im Hintergrund vorladen (Speculation Rules). Dabei werden ausschließlich Seiten von demselben Server abgerufen; Verbindungen zu Dritten entstehen dadurch nicht.

## Kontaktaufnahme per E-Mail oder Telefon

Wenn Sie uns anrufen oder eine E-Mail schreiben, verarbeiten wir die Angaben, die Sie uns mitteilen (zum Beispiel Name, Kontaktdaten und den Inhalt Ihrer Nachricht), um Ihr Anliegen zu bearbeiten.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO, wenn es um ein Angebot oder einen Auftrag geht, sonst Art. 6 Abs. 1 Buchst. f DSGVO. Unser berechtigtes Interesse liegt darin, Anfragen zu beantworten. Wir löschen die Daten, sobald Ihr Anliegen erledigt ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Angebote, Rechnungen und Geschäftsbriefe müssen wir nach Handels- und Steuerrecht sechs beziehungsweise zehn Jahre aufbewahren.

## Anfrageformulare (Kontakt und Konfigurator)

Über das Kontaktformular und den Konfigurator können Sie uns eine Anfrage senden. Dabei verarbeiten wir die Angaben, die Sie in das Formular eintragen: Name, E-Mail-Adresse, Telefonnummer, Postleitzahl, Ort und Ihre Nachricht. Im Konfigurator kommen die Angaben zu Ihrem Projekt hinzu (zum Beispiel Maße, Holzart, Oberfläche, Zeitraum und, wenn Sie es angeben, ein Budgetrahmen) sowie, falls Sie welche hochladen, Fotos Ihres Raums. Auf Wunsch wird außerdem die Zeichnung und das 3D-Bild Ihrer Konfiguration mitgesendet. Fotos werden vor dem Versand in Ihrem Browser verkleinert und von Metadaten (zum Beispiel Aufnahmeort) befreit. Sie werden ausschließlich mit der Anfrage übertragen und weder in der Seitenadresse noch im Speicher Ihres Browsers abgelegt.

Zweck der Verarbeitung ist die Bearbeitung Ihrer Anfrage und die Erstellung eines Angebots. Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO (Durchführung vorvertraglicher Maßnahmen). Eine gesonderte Einwilligung holen wir deshalb nicht ein. <!-- needs-review: Datenschutzhinweis statt Einwilligungs-Checkbox (docs/architecture.md §8), rechtlich prüfen. -->

Anhand der Postleitzahl zeigt der Konfigurator an, ob Ihr Vorhaben in unserem Einzugsgebiet liegt. Diese Prüfung findet vollständig in Ihrem Browser statt; es werden dafür keine Daten übertragen. Die Postleitzahl selbst erhalten wir erst, wenn Sie die Anfrage absenden.

<!-- demo -->

In dieser Vorabversion der Website werden keine Formulardaten übertragen. Ihre Eingaben werden nur in Ihrem Browser geprüft und angezeigt; eine Verbindung zu einem Server wird beim Absenden nicht aufgebaut. Das gilt auch für den Konfigurator: Mit „Anfrage abschließen (Demo)“ wird nichts gesendet, und im Konfigurator gibt es in der Vorabversion keinen Foto-Upload. Die Zusammenfassung Ihrer Konfiguration können Sie selbst per E-Mail an uns schicken, kopieren, speichern oder drucken. Wenn Sie uns erreichen möchten, nutzen Sie bitte Telefon oder E-Mail.
<!-- /demo -->

<!-- formtaxi -->

Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi ([[Platzhalter: Anbieter und Anschrift laut Auftragsverarbeitungsvertrag]]). Der Dienst nimmt die Formulardaten entgegen und leitet sie per E-Mail an uns weiter. Mit dem Anbieter haben wir einen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO geschlossen; die Verarbeitung findet auf Servern in Deutschland statt. <!-- needs-review: Serverstandort und Speicherdauer laut AVV bestätigen. --> Der Anbieter speichert die Daten nur so lange, wie es für die Weiterleitung und die Abwehr von Missbrauch nötig ist. [[Platzhalter: Speicherdauer laut AVV]] Die Übertragung erfolgt verschlüsselt (TLS).
<!-- /formtaxi -->

<!-- assistant -->

Die Formulare übermitteln Ihre Angaben verschlüsselt (TLS) an unseren eigenen Anfrage-Server. Er leitet Ihre Anfrage per E-Mail an uns weiter und meldet Ihrem Browser, ob sie angekommen ist. Der Server läuft bei [[Platzhalter: Hosting-Anbieter des Anfrage-Servers mit Anschrift]]; die E-Mails versendet er über [[Platzhalter: E-Mail-Anbieter (SMTP) mit Anschrift]]. Beide Anbieter verarbeiten die Daten in unserem Auftrag; mit ihnen haben wir Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO geschlossen. [[Platzhalter: Serverstandort laut AVV sowie Server-Logs des Hosting-Anbieters mit Speicherdauer]] <!-- needs-review: Hosting-Anbieter (docs/assistant.md D1), Mail-Anbieter, AVV, Serverstandort und Server-Logs vor dem Livebetrieb bestätigen (docs/assistant.md §7). -->

Anfragen über das Kontaktformular und Bewerbungen leitet der Server nur weiter; er speichert sie nicht. Fotos und andere Dateien, die Sie mitsenden, speichert er ebenfalls nicht; sie erreichen uns ausschließlich als Anhang der E-Mail. Anfragen aus dem Konfigurator speichert der Server dagegen als Vorgang; was damit geschieht, steht im Abschnitt „Anfragen und Preisrahmen“.

Zum Schutz vor Missbrauch begrenzt der Server, wie viele Anfragen er von einem Internetanschluss annimmt. Dafür bildet er aus Ihrer IP-Adresse einen Prüfwert (einen Hash mit zufälligem Schlüssel), hält ihn nur im Arbeitsspeicher und verwirft ihn spätestens nach 24 Stunden. Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. f DSGVO; unser berechtigtes Interesse liegt darin, den Dienst vor automatisierten Massenanfragen zu schützen. Den Inhalt Ihrer Anfrage schreibt der Server in kein Protokoll; seine eigenen Protokolle halten nur technische Ereignisse ohne Inhalt fest, zum Beispiel wann eine E-Mail versendet wurde. <!-- needs-review: Beschreibung der Ratenbegrenzung (assistant/src/ratelimit.ts) und der inhaltsfreien Logs (Tabelle ereignisse, docs/angebot.md §5) rechtlich prüfen. -->
<!-- /assistant -->

Zum Schutz vor automatisierten Einsendungen enthalten die Formulare ein Feld, das für Menschen nicht sichtbar ist, und messen die Zeit zwischen der ersten Eingabe und dem Absenden. Wird das unsichtbare Feld ausgefüllt oder das Formular in unter drei Sekunden (im Konfigurator: unter fünf Sekunden) abgeschickt, werten wir die Eingabe als automatisiert und verarbeiten sie nicht weiter. Dabei entstehen keine zusätzlichen personenbezogenen Daten, und es werden keine Dritten eingebunden.

Für die Speicherdauer gilt das Gleiche wie bei der Kontaktaufnahme per E-Mail oder Telefon.

<!-- assistant -->

## Anfragen und Preisrahmen

<!-- needs-review: ganzer Abschnitt (docs/angebot.md §9, docs/assistant.md §7): Auftragsverarbeitung, Drittlandübermittlung (Entscheidung D2: Claude API bei Anthropic oder Claude auf Google Vertex AI; fällt D2 auf Vertex AI, ändert sich der genannte Anbieter), Art. 22 DSGVO, Rechtsgrundlage und Löschfristen vor dem Livebetrieb rechtlich prüfen. -->

Wenn Sie uns eine Anfrage über den Konfigurator senden, legt unser Anfrage-Server dafür einen Vorgang mit einer Vorgangsnummer an und speichert Ihre Angaben einschließlich Ihrer Kontaktdaten. Aus Ihren Projektangaben (zum Beispiel Maße, Holzart, Oberfläche oder Stückzahl) und unseren eigenen Preissätzen berechnet er einen unverbindlichen Preisrahmen. Diese Berechnung folgt festen Regeln, die wir vorgegeben haben; eine künstliche Intelligenz legt dabei keinen Preis fest.

Zusätzlich lassen wir Ihre Projektangaben von dem KI-Modell Claude des Anbieters Anthropic bewerten: Ist das Vorhaben so machbar, passt es zu unserer Werkstatt, und welche Angaben fehlen noch? Das Modell entwirft außerdem den Text unserer Antwort und, wenn Angaben fehlen, unsere Rückfragen. Anthropic verarbeitet diese Daten in unserem Auftrag ([[Platzhalter: Vertragspartner und Anschrift laut Auftragsverarbeitungsvertrag]]). [[Platzhalter: Serverstandort und Grundlage einer Übermittlung in Drittländer nach rechtlicher Prüfung]] [[Platzhalter: Speicherdauer beim KI-Anbieter laut Vertrag]]

Dabei geben wir nur weiter, was für diese Bewertung nötig ist: Ihre Angaben zum Projekt, zum gewünschten Zeitraum und zum Budget, Ihre Postleitzahl, die Anzahl Ihrer Fotos und Ihre Freitexte. Ihren Namen, Ihre E-Mail-Adresse, Ihre Telefonnummer, Ihren Ort und Ihre Angaben zur Erreichbarkeit erhält Anthropic nicht, ebenso wenig Ihre Fotos oder andere Dateien. Aus Ihren Freitexten entfernt der Server vorher E-Mail-Adressen, Telefonnummern, Straßenadressen, Ihren Namen und Ihren Ort. Anfragen über das Kontaktformular und Bewerbungen werden nicht von einer KI bewertet.

Über jede Antwort entscheidet ein Mensch. Bevor Sie etwas von uns erhalten, sieht sich {{owner}} den Vorgang persönlich an: Er gibt den Preisrahmen frei oder ändert ihn, kalkuliert selbst, stellt Ihnen Rückfragen oder sagt ab. Auch den Text unserer Antwort prüft er vorher und ändert ihn bei Bedarf. Ohne seine Entscheidung geht nichts an Sie hinaus; eine ausschließlich automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt. Der Preisrahmen ist kein verbindliches Angebot; er gilt vorbehaltlich eines Aufmaßes vor Ort.

Rechtsgrundlage für die Bearbeitung Ihrer Anfrage, die Berechnung des Preisrahmens und die Bewertung ist Art. 6 Abs. 1 Buchst. b DSGVO (Durchführung vorvertraglicher Maßnahmen, die auf Ihre Anfrage erfolgen).

Den Vorgang (Ihre Angaben, den Preisrahmen, die Bewertung und den Wortlaut unserer Antwort) speichert der Anfrage-Server, solange wir Ihre Anfrage bearbeiten. Haben wir abgesagt oder ist der Vorgang ohne Entscheidung abgelaufen, löscht er die Inhalte 90 Tage danach, in allen anderen Fällen zwölf Monate nach unserer Entscheidung. [[Platzhalter: Löschfristen vom Inhaber bestätigen]] Danach bleiben nur die Vorgangsnummer, eine Angebotsnummer (falls vergeben), die Datumsangaben, der Status und der Preisrahmen gespeichert, ohne Ihre Kontaktdaten und ohne Ihre Projektangaben. E-Mails, die wir mit Ihnen wechseln, und Angebote bewahren wir auf, wie im Abschnitt „Kontaktaufnahme per E-Mail oder Telefon“ beschrieben.
<!-- /assistant -->

## Bewerbungen

Wenn Sie sich über das Bewerbungsformular, per E-Mail oder telefonisch bewerben, verarbeiten wir Ihre Angaben (Name, Kontaktdaten, die gewünschte Stelle, Ihre Nachricht sowie die Unterlagen, die Sie uns schicken, zum Beispiel einen Lebenslauf), um das Bewerbungsverfahren durchzuführen.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO (Anbahnung eines Beschäftigungsverhältnisses) in Verbindung mit § 26 Abs. 1 BDSG. <!-- needs-review: Anwendbarkeit von § 26 BDSG nach EuGH C-34/21 (30.03.2023) rechtlich prüfen; Art. 6 Abs. 1 Buchst. b DSGVO bleibt als Rechtsgrundlage. --> Besondere Kategorien personenbezogener Daten (zum Beispiel Gesundheitsdaten oder eine Schwerbehinderung) teilen Sie uns bitte nur mit, wenn Sie das möchten; wir verarbeiten sie dann nach Art. 9 Abs. 2 Buchst. b DSGVO ausschließlich im Rahmen des Bewerbungsverfahrens.

Kommt es nicht zu einer Einstellung, löschen wir Ihre Unterlagen spätestens sechs Monate nach Abschluss des Verfahrens. Diese Frist brauchen wir, um Ansprüche nach dem Allgemeinen Gleichbehandlungsgesetz beantworten zu können. Bei einer Einstellung übernehmen wir die Unterlagen in die Personalakte. Möchten Sie, dass wir Ihre Bewerbung länger für künftige Stellen behalten, fragen wir Sie vorher um Ihre Einwilligung.

<!-- demo -->

In dieser Vorabversion der Website werden keine Bewerbungsdaten übertragen, und es ist kein Datei-Upload aktiv. Bitte bewerben Sie sich per E-Mail oder telefonisch.
<!-- /demo -->

<!-- formtaxi -->

Für die Übermittlung des Bewerbungsformulars einschließlich der hochgeladenen Unterlagen gilt das oben zum Formulardienst form.taxi Gesagte. Die Übertragung erfolgt verschlüsselt (TLS).
<!-- /formtaxi -->

<!-- assistant -->

Das Bewerbungsformular übermittelt Ihre Angaben und Unterlagen verschlüsselt (TLS) an unseren Anfrage-Server. Er leitet sie per E-Mail an uns weiter und speichert sie nicht; im Übrigen gilt, was oben unter „Anfrageformulare“ steht. Bewerbungen werden nicht von einer KI bewertet.
<!-- /assistant -->

## Speicherung in Ihrem Browser

Diese Website setzt keine Cookies. An drei Stellen speichert sie Daten direkt in Ihrem Browser, damit die Website so funktioniert, wie Sie es verlangen. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG: Die Speicherung ist unbedingt erforderlich, um den von Ihnen ausdrücklich gewünschten Dienst bereitzustellen; eine Einwilligung ist dafür nicht nötig. Diese Daten verlassen Ihren Browser nicht und werden nicht an uns oder Dritte übertragen. Sie können sie jederzeit über die Einstellungen Ihres Browsers löschen.

- **Farbschema (`ss-theme`).** Erst wenn Sie unter „Darstellung“ aktiv „Hell“ oder „Werkstatt bei Nacht“ wählen, merkt sich Ihr Browser diese Wahl im Local Storage. Mit „Wie System“ wird der Eintrag wieder gelöscht. Ohne Ihre Wahl wird nichts gespeichert.
- **Zwischenstand im Konfigurator (`ss-konfigurator-v1`).** Während Sie den Konfigurator ausfüllen, hält Ihr Browser Ihre Eingaben im Session Storage, damit nichts verloren geht, wenn Sie zwischen den Schritten wechseln oder die Seite neu laden. Fotos werden dabei nicht gespeichert. Diese Daten werden gelöscht, sobald Sie die Anfrage abgeschickt haben oder den Browser-Tab schließen.
- **Entwurf speichern (optional, `ss-konfigurator-entwurf-v1`).** Erst wenn Sie im Konfigurator das Kästchen „Entwurf auf diesem Gerät speichern“ ankreuzen, legt Ihr Browser Ihre bisherigen Angaben (ohne Fotos) im Local Storage ab, damit Sie später auf demselben Gerät weitermachen können. Der Entwurf wird nach 30 Tagen automatisch gelöscht; wenn Sie das Kästchen wieder abwählen oder „Entwurf löschen“ wählen, wird er sofort entfernt. Ohne Ihr Ankreuzen wird kein Entwurf gespeichert.

Während Sie den Konfigurator ausfüllen, schreibt er Ihre Projektauswahl (zum Beispiel Möbeltyp, Maße und Holzart) in die Adresse der Seite, damit Sie die Konfiguration als Link speichern oder teilen können. Diese Adresse und der Teilen-Link enthalten nur solche nicht personenbezogenen Angaben, niemals Namen, Postleitzahl, Kontaktdaten, Freitext oder Fotos.

## Schriften, externe Links und Verschlüsselung

Die Schriften dieser Website (Red Hat Display und Fraunces) liegen auf unserem eigenen Server. Es werden keine Schriften von Google oder anderen Anbietern geladen.

Diese Website enthält Links zu externen Websites, zum Beispiel zu OpenStreetMap für die Anfahrt, zu unserem Google-Unternehmensprofil und zur Handwerkskammer. Solange Sie einen solchen Link nicht anklicken, werden keine Daten an diese Anbieter übertragen. Der Kartenausschnitt auf der Kontaktseite ist ein Bild, das von unserem Server geladen wird. Nach dem Klick gilt die Datenschutzerklärung des jeweiligen Anbieters.

Die Verbindung zu dieser Website ist mit TLS verschlüsselt (erkennbar am Schloss-Symbol und daran, dass die Adresse mit „https“ beginnt).

## Ihre Rechte

Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden personenbezogenen Daten:

- Recht auf Auskunft (Art. 15 DSGVO),
- Recht auf Berichtigung (Art. 16 DSGVO),
- Recht auf Löschung (Art. 17 DSGVO),
- Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO),
- Recht auf Datenübertragbarkeit (Art. 20 DSGVO),
- Recht auf Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO).

> **Widerspruchsrecht (Art. 21 DSGVO).** Soweit wir Ihre Daten auf Grundlage eines berechtigten Interesses nach Art. 6 Abs. 1 Buchst. f DSGVO verarbeiten, haben Sie das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit Widerspruch gegen die Verarbeitung einzulegen. Wir verarbeiten Ihre Daten dann nicht mehr, es sei denn, wir können zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die Ihre Interessen, Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.

Um Ihre Rechte auszuüben, genügt eine E-Mail an {{email}} oder ein Anruf unter {{phone}}.

## Beschwerderecht bei einer Aufsichtsbehörde

Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Für uns zuständig ist:

Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg\
Lautenschlagerstraße 20\
70173 Stuttgart\
[www.baden-wuerttemberg.datenschutz.de](https://www.baden-wuerttemberg.datenschutz.de)

<!-- needs-review: Anschrift der Behörde vor Veröffentlichung prüfen. -->

## Keine automatisierte Entscheidungsfindung

Wir treffen keine Entscheidungen, die ausschließlich auf einer automatisierten Verarbeitung beruhen, und setzen kein Profiling ein (Art. 22 DSGVO). Die Berechnungen im Konfigurator (zum Beispiel die Einteilung von Regalböden) finden in Ihrem Browser statt und dienen nur der Vorschau.

<!-- assistant -->

Das gilt auch für Anfragen aus dem Konfigurator: Den Preisrahmen berechnen feste Regeln, die KI-Bewertung bereitet unsere Entscheidung nur vor, und ob und was Sie von uns erhalten, prüft und entscheidet ein Mensch (siehe „Anfragen und Preisrahmen“). <!-- needs-review: ob der Vergleich mit dem Budgetrahmen und die Prüfung des Einzugsgebiets in der Bewertung als Profiling nach Art. 4 Nr. 4 DSGVO gelten, rechtlich prüfen; die Aussage „kein Profiling“ im Absatz darüber hängt davon ab. -->
<!-- /assistant -->

## Änderungen dieser Erklärung

Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die Rechtslage ändert. Das Datum der aktuellen Fassung finden Sie oben unter „Stand“.
