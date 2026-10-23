# Owner checklist (Ulf Schmidt)

The demo runs with placeholders that are clearly flagged. Each item below must be confirmed or supplied before going live. In the demo build, `/intern/pruefliste/` is generated from the content's `review` flags and lists every item that is still open.

## Publishing and rights
- [ ] OK to publish the demo, with his photos and data, at a public but noindexed URL (GitHub Pages)?
- [ ] Are the 2010–2012 photos (Fujifilm, 800 px) projects of the Schreinerei Schmidt?
- [ ] Do the draft groupings of the 15 reference projects belong together? (`docs/architecture.md` §6)
- [ ] Team photo (Team1.jpg): consent from the people shown.
- [ ] Portrait ulf_schmidt.jpg: may it be used?
- [ ] PaX AG photos (5, incl. Braubachstraße and the Neorenaissance Haustür): does he have marketing rights as a dealer? Default: excluded.
- [ ] `eiche_fischgratparkett.jpeg` (Fujifilm 2011): his project? Currently not migrated.
- [ ] Testimonials (Biggi N., Christian E., Alexander H.): source, and permission to quote them.
- [ ] Vector logo, if one exists (sign makers usually have it).
- [ ] Favicon and app icons are a placeholder (a drawn blocky "S", `scripts/make-icons.mjs`) until a vector logo exists. Replace them with the real mark, or approve the placeholder.
- [ ] New photos: windows, terraces, Altbau, workshop, team.
- [ ] Optional workshop clip for the home hero (`docs/design-system.md` §5 „Video hero“): about 10 s of his own hands at work (planing, oiling oak, a dovetail), landscape, phone on a tripod, daylight, no faces. Stock footage is excluded. Without the clip the photo hero stays as it is.

## Legal and company details (Impressum)
- [ ] Legal form: Einzelunternehmen or e.K. (with register court and HRA number).
- [ ] USt-IdNr. or Wirtschafts-IdNr.
- [ ] Handwerksrolle number. Is the Handwerkskammer Mannheim Rhein-Neckar-Odenwald correct?
- [ ] Professional title: Schreiner- or Tischlermeister, awarded in Germany?
- [ ] Professional liability insurance: insurer, address, area of cover.
- [ ] Landline number, if any.
- [ ] Legal review of the Impressum and Datenschutz, including the § 26 BDSG question for applications.

## Contact and business
- [ ] Opening hours: Mon–Fri 07–17?
- [ ] Service area and PLZ tiers (core: Mannheim / Ludwigshafen; region: Rhein-Neckar).
- [ ] Promised response time ("innerhalb von 2 Werktagen"?) and the policy on Aufmaß costs.
- [ ] Google Business Profile URL.
- [ ] Exact map coordinates of the workshop (Andreas-Hofer-Str. 33): the pin on /kontakt/ sits on the street, not on the house. Right-click the house in OpenStreetMap and send the coordinates. Tracked as `settings.yaml` `site.geo` (Prüfliste, Kontakt) and in `src/lib/map.ts`.
- [ ] Is "1.000+ Projekte" still accurate?
- [ ] Should Treppen be a service of its own?

## Services and copy (from the Phase 2 copy draft)
- [ ] Fenster and Türen: does he make them himself, or install manufacturer products (PaX, KOWA)? This decides whether the copy may say „maßgefertigt“ or „handgemacht“.
- [ ] Founding year of the Schreinerei. Only „Meister seit 2010“ is sourced.
- [ ] Default surface finish (geölt/gewachst?) and the finishes offered for furniture.
- [ ] Treppen scope: new stairs, treads on concrete, handrails, restoration?
- [ ] Terrace wood species (Lärche, Douglasie, Robinie?). Steel bases: made in-house or by a partner?
- [ ] Are „Kein Anschreiben nötig“ (applications) and „wir rufen zurück“ (contact) acceptable promises?
- [ ] Home h1: the demo now shows „Ihr Schreinermeister für Holz nach Maß in Mannheim“ (no green claim, decided 2026-10-19). Keep it, or restore the old slogan „Ihr Experte für umweltbewusstes Holzhandwerk“ after the legal review (kept as `legacyH1` in `src/content/pages/home.yaml`)?
- [ ] form.taxi: legal entity and address, AVV retention period. Is he exempt from appointing a data protection officer (headcount)?

## Sustainability claims (UWG / EU 2024/825, since 27.09.2026)
- [ ] Evidence for certified sources (FSC/PEFC certificate numbers?), and for natural oils and adhesives (Auro products?).
- [ ] Tagline "Umweltbewusstes Holzhandwerk": keep it, or reword it after legal review.

## Jobs
- [ ] Are the Bauschreiner and Parkettleger positions still open? Pay range (€36–42k?), hours, details of the 4-day week, requirements, contact person.

## Configurator
- [ ] Recipient address for enquiries. Set up form.taxi and sign its data processing agreement (AVV).
- [ ] Furniture types offered, wood species (Eiche, Nussbaum, Esche, Kernbuche, Kirsche?), finishes, handles.
- [ ] Steel bases: made in-house or by a partner? Maximum part sizes in the workshop.
- [ ] Sample photos of real surfaces, to calibrate the textures.
- [ ] Wording of the budget ranges. Pricing rules: the pilot assumes rates (`docs/angebot.md` §4); prices stay off on the site.
- [ ] Shelf span values (E-modulus table in `docs/configurator.md` §4.2).

## AI assistant (proposal, `docs/assistant.md`)
- [ ] Does he want AI help with enquiries at all (triage note and reply draft by email; he always sends the reply himself)?
- [ ] Later: a chat widget on the site that answers from confirmed site content only?
- [ ] Which route for Claude (D2): Claude API (Anthropic, US) or Claude on Google Vertex AI (EU)? Data processing agreement (AVV) for the chosen one, and the basis for the third-country transfer (legal review). Fills the Datenschutz placeholders „Vertragspartner und Anschrift laut Auftragsverarbeitungsvertrag“, „Serverstandort und Grundlage einer Übermittlung in Drittländer“ and „Speicherdauer beim KI-Anbieter laut Vertrag“.
- [ ] Backend host and domain (D1): an EU VPS or an EU serverless function, on a subdomain such as `anfrage.<domain>`; its AVV, server location and server logs (Datenschutz placeholders „Hosting-Anbieter des Anfrage-Servers mit Anschrift“ and „Serverstandort laut AVV und Server-Logs des Hosting-Anbieters mit Speicherdauer“).
- [x] D3, keep form.taxi? **Decided 2026-10-23: replace.** With the assistant endpoint set, every form (Konfigurator, Kontakt, Karriere) posts to the assistant backend; form.taxi is only the fallback (`docs/angebot.md` §9). The form.taxi items above only apply if the assistant is not used.
- [ ] May applications (CVs) be processed by the AI step? Default: no.
- [ ] Monthly spending limit he is comfortable with (estimate: about 10 € a month).

## Angebot pilot (`docs/angebot.md`)
- [ ] Does he want the configurator follow-up: a price range evaluated by code and Claude, approved by him in one click, then sent as a non-binding Angebot?
- [ ] Confirm or replace the assumed rates (`docs/angebot.md` §4): hourly rates, board and finish prices, per-branch prices, Anfahrt, Mindestauftrag (500 € assumed).
- [ ] Range widths (± 15 / 25 / 30 %) and the recommendation thresholds (§7.1).
- [ ] Wording of the non-binding clause, validity (30 days assumed), the Absage text (legal review).
- [ ] The sending mailbox for Angebote (depends on the Strato / Microsoft 365 decision).
- [ ] Retention periods (90 days / 12 months assumed). Confirming them fills the Datenschutz placeholder „Löschfristen vom Inhaber bestätigen“.
- [ ] Mail provider and mailbox for sending (`SEND_MODE` `allowlist`, then `live`): SMTP host and account, the recipient address for enquiries, its AVV (Datenschutz placeholder „E-Mail-Anbieter (SMTP) mit Anschrift“).
- [ ] Datenschutz section „Anfragen und Preisrahmen“ and the assistant paragraphs (`src/content/legal/datenschutz.md`, `assistant` blocks): every `[[Platzhalter: …]]` filled and the legal review done. The production guard blocks a release until then.

## Production
- [ ] Hosting and domain (EU host recommended), DNS access, Search Console.
