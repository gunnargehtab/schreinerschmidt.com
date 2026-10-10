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
  (src/lib/legal-tokens.ts). The markers must stand on lines of their own and must not be written out inside this comment.

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

Diese Website kommt ohne Cookies aus. Wir setzen keine Analyse- oder Tracking-Dienste ein, laden keine Schriften, Skripte, Videos oder Karten von fremden Servern und binden keine Social-Media-Plugins ein. Ihr Browser stellt nur Verbindungen zu dem Server her, der die Website ausliefert, und, wenn Sie ein Formular absenden, zu unserem Formulardienst. Personenbezogene Daten verarbeiten wir nur, wenn Sie uns kontaktieren, eine Anfrage senden oder sich bewerben.

## Hosting und Server-Logs

<!-- hosting: GitHub Pages. Replace this whole section when the site moves to an EU host. -->

Diese Website wird auf GitHub Pages gehostet, einem Dienst der GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Beim Aufruf einer Seite überträgt Ihr Browser technisch notwendige Daten an den Server: Ihre IP-Adresse, Datum und Uhrzeit des Zugriffs, die aufgerufene Seite, die übertragene Datenmenge, den Browsertyp und das Betriebssystem. GitHub speichert diese Daten in Server-Logs, um den Dienst sicher und stabil zu betreiben und Angriffe abzuwehren. Wir selbst haben keinen Zugriff auf diese Logs.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. f DSGVO. Unser berechtigtes Interesse liegt in der sicheren und zuverlässigen Bereitstellung der Website. Die Verarbeitung findet teilweise in den USA statt. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert; die Übermittlung stützt sich auf den Angemessenheitsbeschluss der Europäischen Kommission nach Art. 45 DSGVO. <!-- needs-review: DPF-Zertifizierung von GitHub, Inc. in der DPF-Liste prüfen. --> Weitere Informationen enthält die [Datenschutzerklärung von GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

Zur schnelleren Navigation kann Ihr Browser Seiten unserer Website im Hintergrund vorladen (Speculation Rules). Dabei werden ausschließlich Seiten von demselben Server abgerufen; Verbindungen zu Dritten entstehen dadurch nicht.

## Kontaktaufnahme per E-Mail oder Telefon

Wenn Sie uns anrufen oder eine E-Mail schreiben, verarbeiten wir die Angaben, die Sie uns mitteilen (zum Beispiel Name, Kontaktdaten und den Inhalt Ihrer Nachricht), um Ihr Anliegen zu bearbeiten.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO, wenn es um ein Angebot oder einen Auftrag geht, sonst Art. 6 Abs. 1 Buchst. f DSGVO. Unser berechtigtes Interesse liegt darin, Anfragen zu beantworten. Wir löschen die Daten, sobald Ihr Anliegen erledigt ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Angebote, Rechnungen und Geschäftsbriefe müssen wir nach Handels- und Steuerrecht sechs beziehungsweise zehn Jahre aufbewahren.

## Anfrageformulare (Kontakt und Konfigurator)

Über das Kontaktformular und den Konfigurator können Sie uns eine Anfrage senden. Dabei verarbeiten wir die Angaben, die Sie in das Formular eintragen: Name, E-Mail-Adresse, Telefonnummer, Postleitzahl, Ort und Ihre Nachricht. Im Konfigurator kommen die Angaben zu Ihrem Projekt hinzu (zum Beispiel Maße, Holzart, Oberfläche, Zeitraum und, wenn Sie es angeben, ein Budgetrahmen) sowie, falls Sie welche hochladen, Fotos Ihres Raums. Auf Wunsch wird außerdem die Zeichnung und das 3D-Bild Ihrer Konfiguration mitgesendet. Fotos werden vor dem Versand in Ihrem Browser verkleinert und von Metadaten (zum Beispiel Aufnahmeort) befreit.

Zweck der Verarbeitung ist die Bearbeitung Ihrer Anfrage und die Erstellung eines Angebots. Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO (Durchführung vorvertraglicher Maßnahmen). Eine gesonderte Einwilligung holen wir deshalb nicht ein. <!-- needs-review: Datenschutzhinweis statt Einwilligungs-Checkbox (docs/architecture.md §8), rechtlich prüfen. -->

Die Felder Postleitzahl und Ort nutzen wir, um einzuschätzen, ob Ihr Vorhaben in unserem Einzugsgebiet liegt. Diese Prüfung findet in Ihrem Browser statt; es werden dafür keine Daten übertragen.

<!-- demo -->

In dieser Vorabversion der Website werden keine Formulardaten übertragen. Ihre Eingaben werden nur in Ihrem Browser geprüft und angezeigt; eine Verbindung zu einem Server wird beim Absenden nicht aufgebaut. Wenn Sie uns erreichen möchten, nutzen Sie bitte Telefon oder E-Mail.
<!-- /demo -->

<!-- production -->

Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi ([[Platzhalter: Anbieter und Anschrift laut Auftragsverarbeitungsvertrag]]). Der Dienst nimmt die Formulardaten entgegen und leitet sie per E-Mail an uns weiter. Mit dem Anbieter haben wir einen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO geschlossen; die Verarbeitung findet auf Servern in Deutschland statt. <!-- needs-review: Serverstandort und Speicherdauer laut AVV bestätigen. --> Der Anbieter speichert die Daten nur so lange, wie es für die Weiterleitung und die Abwehr von Missbrauch nötig ist. [[Platzhalter: Speicherdauer laut AVV]] Die Übertragung erfolgt verschlüsselt (TLS).
<!-- /production -->

Zum Schutz vor automatisierten Einsendungen enthalten die Formulare ein Feld, das für Menschen nicht sichtbar ist, und messen die Zeit zwischen der ersten Eingabe und dem Absenden. Wird das unsichtbare Feld ausgefüllt oder das Formular in unter drei Sekunden abgeschickt, werten wir die Eingabe als automatisiert und verarbeiten sie nicht weiter. Dabei entstehen keine zusätzlichen personenbezogenen Daten, und es werden keine Dritten eingebunden.

Für die Speicherdauer gilt das Gleiche wie bei der Kontaktaufnahme per E-Mail oder Telefon.

## Bewerbungen

Wenn Sie sich über das Bewerbungsformular, per E-Mail oder telefonisch bewerben, verarbeiten wir Ihre Angaben (Name, Kontaktdaten, die gewünschte Stelle, Ihre Nachricht sowie die Unterlagen, die Sie uns schicken, zum Beispiel einen Lebenslauf), um das Bewerbungsverfahren durchzuführen.

Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. b DSGVO (Anbahnung eines Beschäftigungsverhältnisses) in Verbindung mit § 26 Abs. 1 BDSG. <!-- needs-review: Anwendbarkeit von § 26 BDSG nach EuGH C-34/21 (30.03.2023) rechtlich prüfen; Art. 6 Abs. 1 Buchst. b DSGVO bleibt als Rechtsgrundlage. --> Besondere Kategorien personenbezogener Daten (zum Beispiel Gesundheitsdaten oder eine Schwerbehinderung) teilen Sie uns bitte nur mit, wenn Sie das möchten; wir verarbeiten sie dann nach Art. 9 Abs. 2 Buchst. b DSGVO ausschließlich im Rahmen des Bewerbungsverfahrens.

Kommt es nicht zu einer Einstellung, löschen wir Ihre Unterlagen spätestens sechs Monate nach Abschluss des Verfahrens. Diese Frist brauchen wir, um Ansprüche nach dem Allgemeinen Gleichbehandlungsgesetz beantworten zu können. Bei einer Einstellung übernehmen wir die Unterlagen in die Personalakte. Möchten Sie, dass wir Ihre Bewerbung länger für künftige Stellen behalten, fragen wir Sie vorher um Ihre Einwilligung.

<!-- demo -->

In dieser Vorabversion der Website werden keine Bewerbungsdaten übertragen, und es ist kein Datei-Upload aktiv. Bitte bewerben Sie sich per E-Mail oder telefonisch.
<!-- /demo -->

<!-- production -->

Für die Übermittlung des Bewerbungsformulars einschließlich der hochgeladenen Unterlagen gilt das oben zum Formulardienst form.taxi Gesagte. Die Übertragung erfolgt verschlüsselt (TLS).
<!-- /production -->

## Speicherung in Ihrem Browser

Diese Website setzt keine Cookies. An drei Stellen speichert sie Daten direkt in Ihrem Browser, damit die Website so funktioniert, wie Sie es verlangen. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG: Die Speicherung ist unbedingt erforderlich, um den von Ihnen ausdrücklich gewünschten Dienst bereitzustellen; eine Einwilligung ist dafür nicht nötig. Diese Daten verlassen Ihren Browser nicht und werden nicht an uns oder Dritte übertragen. Sie können sie jederzeit über die Einstellungen Ihres Browsers löschen.

- **Farbschema (`ss-theme`).** Erst wenn Sie unter „Darstellung“ aktiv „Hell“ oder „Werkstatt bei Nacht“ wählen, merkt sich Ihr Browser diese Wahl im Local Storage. Mit „Wie System“ wird der Eintrag wieder gelöscht. Ohne Ihre Wahl wird nichts gespeichert.
- **Zwischenstand im Konfigurator.** Während Sie den Konfigurator ausfüllen, hält Ihr Browser den aktuellen Stand im Session Storage, damit nichts verloren geht, wenn Sie zwischen den Schritten wechseln. Diese Daten werden gelöscht, sobald Sie den Browser-Tab schließen.
- **Entwurf speichern (optional).** Wenn Sie im Konfigurator „Entwurf speichern“ wählen, legt Ihr Browser Ihre bisherigen Angaben im Local Storage ab, damit Sie später weitermachen können. Der Entwurf wird nach 30 Tagen automatisch gelöscht; über „Entwurf löschen“ entfernen Sie ihn sofort. Ohne diese Auswahl wird kein Entwurf gespeichert.

Der Teilen-Link des Konfigurators enthält nur die Angaben zum Projekt (zum Beispiel Möbeltyp und Maße), keine Namen, Adressen oder Kontaktdaten.

## Schriften, externe Links und Verschlüsselung

Die Schriften dieser Website (Red Hat Display und Fraunces) liegen auf unserem eigenen Server. Es werden keine Schriften von Google oder anderen Anbietern geladen.

Diese Website enthält Links zu externen Websites, zum Beispiel zu OpenStreetMap für die Anfahrt, zu unserem Google-Unternehmensprofil und zur Handwerkskammer. Solange Sie einen solchen Link nicht anklicken, werden keine Daten an diese Anbieter übertragen. Der Kartenausschnitt auf der Kontaktseite ist ein Bild, das von unserem Server geladen wird. Nach dem Klick gilt die Datenschutzerklärung des jeweiligen Anbieters.

Die Verbindung zu dieser Website ist mit TLS verschlüsselt (erkennbar am Schloss-Symbol und an „https://“ in der Adresszeile).

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

## Änderungen dieser Erklärung

Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die Rechtslage ändert. Das Datum der aktuellen Fassung finden Sie oben unter „Stand“.
