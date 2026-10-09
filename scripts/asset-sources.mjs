// Allow-list of publishable source images from the old Webflow site (docs/architecture.md §6).
// Only files listed here are migrated by scripts/migrate-assets.mjs. Anything not listed is never published.
//
// Field reference:
//   id        stable manifest id
//   file      CDN filename (decoded) below CDN_BASE
//   rights    'own' | 'own-legacy' | 'own-unverified' (publishable statuses only)
//   category  primary ServiceKey (moebel|boeden|treppen|fenster|tueren|altbau|terrassen) or null
//   project   slug from the §6 project table, or null
//   role      cover | gallery | before | after | type | portrait | team | brand-reference
//   out       output path below src/assets/
//   notes     open questions for the owner (review flags), English
//
// NOT migrated (documented so nobody re-adds them by accident):
//
// Excluded by docs/architecture.md §0/§6:
//   - PaX AG (EXIF copyright "PaX AG", a window maker):
//       63cef446ceb16ca935c1495a__MG_2703_RGB_web.jpg, 63cef4e511b9b52235f85753__MG_2939_RGB_web.jpg,
//       "Fenster Detail 13_1.jpg" (not in the archived originals; excluded regardless)
//     The migration found the same EXIF copyright "PaX AG" on two more photos, which are excluded as well:
//       63cef6ed231345299a62f3c0_Braubachstraße-Bild-6-0d2bd6e2203fa160225556379f092333_RGB_web_3by2.jpg,
//       63cef737236048fe64d9690c_stadthaus-altbau-neorenaissance-haustür.jpg
//   - Adobe Stock video (third-party stock):
//       6304f0f56184dde979fe551c_AdobeStock_414477000_Video_HD_Preview (video-convertercom)-{poster-00001.jpg,transcode.mp4,transcode.webm}
//   - Steel Interior supplier images:
//       63cef6c1f7bbf47ede283803_Steel-Interior Doppeldrehtür mit Seitenelementen.png,
//       63cef6d3f7bbf40b22283810_steel-interior.de+schiebetuer+doppeltuer+klarglas+schwarz +002.jpg
//   - Admonter supplier images (four of them carry EXIF artist/copyright "Peter Burgstaller"):
//       63467e262ef5c812eec5a64e_treppen-admonterTinTab_Staircase_2_kl.jpeg, 63467e2668a1a05ebf158c07_treppen-admonterA_28746.jpeg,
//       63467e26759e2a28ea79e2e1_treppen-admonterA_28424.jpeg,
//       63467e26cf37e842c6d59f5c_treppen-admonterClassic_Eiche_astrein_wei-geolt_Privathaus-_Kopie.jpeg,
//       63467e3a9d2ab66c8d79d3df_treppen-admonter-A_26688.jpeg, 63467f5ed2d9e0ed7dd9849f_Naturholzplatte_Eiche_.jpeg
//   - Stock images named schreiner_schmidt_*:
//       634680f8ba474e412776eb1a_schreiner_schmidt_terasse.jpeg, 634680f8b3d9638ac3bc46b8_schreiner_schmidt_terasse2.jpeg,
//       634680f8f202f8c05e9fffc1_schreiner_schmidt_terasse3.jpeg, 634682a83030a1660f675394_schreiner_schmidt_kuche.jpeg,
//       634682a73030a1f542675380_schreiner_schmidt_boden.jpeg, 63467f5e4a23027a3ac7e1d5_schreiner_schmidt_Turen.jpeg
//   - Screenshots ("Bildschirmfoto" PNGs):
//       6304bf0fd1ebdd2d69b4c966_Bildschirmfoto 2022-07-21 um 09.50.45.png,
//       63171a4cbf708f6a450b729c_Bildschirmfoto 2022-07-21 um 09.50.45@2x.png,
//       6310c2946203675816346dba_Bildschirmfoto 2022-09-01 um 16.32.14.png
//   - video_Schreiner: 639885383f168b1a8931e55a_video_Schreiner-{poster-00001.jpg,transcode.mp4,transcode.webm}
//   - Unsplash images: 62fdfb75f684e60d3558bbfa_chastity-cortijo-…, 62fe0cfe6b4e8ff877a8a630_barn-images-…,
//       6304c0c1c13f3eb3dfb253a7_milivoj-kuhar-…, 6310c1f2d5fd38c590955c5c_francesca-tosolini-…, 6310c2818beef106fb230370_josh-hemsley-…
//
// Not in any publishable rights group of §6 (left out until the owner confirms origin and rights):
//   - 6346804c334b1d881870d375_Robinie_Mocca.jpeg (possibly a supplier image)
//   - 634682a8759e2afd6c7a010e_schreiner_schmidt_zu_hause.jpeg (old hero; stock-like, origin unverified)
//   - Floor-type textures 639af…_{Stabparkett,Hochkantlamellenparkett,Mosaikparkett,Fertigparkett}.jpg, …_Laminat.JPG (stock-like)
//   - 63dd2d52d51725e3fc8ccbec_Treppe Eiche Massivholz naturgeölt.jpg (same photo as IMG_20230203_125350; migrated once)
//   - 634681a7426459137d517d5b_eiche_fischgratparkett.jpeg (a different, 800×600 Fujifilm S9500 photo from 2011; not in
//     any rights group, so the owner must confirm it before it is added as own-legacy)
//   - Design assets that get redrawn, not migrated: skizze_*.png, tisch_schwarz.png, "Wirklich traumhafte Hausboote*.png",
//     Footer_final-09-09.png, Favicon_SchreinereiSchmidt (1).png, "Group 73.jpg", Icon_stern.svg

export const CDN_BASE = 'https://cdn.prod.website-files.com/62e8c86393d73a7acebb0e1f/';

/**
 * Names that may appear in an EXIF Artist/Copyright (or XMP/IPTC creator/rights) tag of a publishable photo.
 * Compared after normalisation (lower case, ©/(c)/"copyright"/years/punctuation removed).
 */
export const OWNER_NAMES = ['ulf schmidt', 'schreinerei schmidt', 'schreiner schmidt', 'schreinerschmidt'];

/** @typedef {'own' | 'own-legacy' | 'own-unverified'} Rights */
/** @typedef {'cover' | 'gallery' | 'before' | 'after' | 'type' | 'portrait' | 'team' | 'brand-reference'} Role */
/** @typedef {'moebel' | 'boeden' | 'treppen' | 'fenster' | 'tueren' | 'altbau' | 'terrassen'} Category */
/**
 * @typedef {object} AssetSource
 * @property {string} id
 * @property {string} file
 * @property {Rights} rights
 * @property {Category | null} category
 * @property {string | null} project
 * @property {Role} role
 * @property {string} out
 * @property {string} notes
 */

const CONFIRM_LEGACY = 'Card only. Owner must confirm this shows a Schreinerei Schmidt project (UWG).';

/** @type {AssetSource[]} */
export const ASSET_SOURCES = [
  // --- 1 holzhaustuer-aufgearbeitet -------------------------------------------------------------
  {
    id: 'holzhaustuer-aufgearbeitet-01',
    file: '63467f5e9d2ab60b0e79da8c_1_Stilvolle_Holzhaustuer_vorher.jpeg',
    rights: 'own-legacy',
    category: 'tueren',
    project: 'holzhaustuer-aufgearbeitet',
    role: 'before',
    out: 'projects/holzhaustuer-aufgearbeitet/01-vorher.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  {
    id: 'holzhaustuer-aufgearbeitet-02',
    file: '63467f5e3618be0527845a23_2_Stilvolle_Holzhaustuer_nachher.jpeg',
    rights: 'own-legacy',
    category: 'tueren',
    project: 'holzhaustuer-aufgearbeitet',
    role: 'after',
    out: 'projects/holzhaustuer-aufgearbeitet/02-nachher.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  // --- 2 haustuer-gruenderzeit --------------------------------------------------------------------
  {
    id: 'haustuer-gruenderzeit-01',
    file: '63d5446a83094f1632d1c483_KOWA Haustür .jpg',
    rights: 'own',
    category: 'tueren',
    project: 'haustuer-gruenderzeit',
    role: 'cover',
    out: 'projects/haustuer-gruenderzeit/01-haustuer.jpg',
    notes:
      'Same phone as Team1 (§0 finding 2). EXIF capture date is 2021-03-11; 2023-01-28 (as in §0) is the EXIF edit date (Windows Photo Editor). Sketch→photo candidate.',
  },
  {
    id: 'haustuer-gruenderzeit-02',
    file: '63467357ee5b6b16e1a4fec8_ss_Rezessionen1.jpg',
    rights: 'own-unverified',
    category: 'tueren',
    project: 'haustuer-gruenderzeit',
    role: 'gallery',
    out: 'projects/haustuer-gruenderzeit/02-treppenhaus.jpg',
    notes:
      'Unverified origin. Same scene as the KOWA photo per content-inventory; owner to confirm rights and the grouping with project 2.',
  },
  // --- 3 eingang-holzlamellen ---------------------------------------------------------------------
  {
    id: 'eingang-holzlamellen-01',
    file: '63dfa1556459303114750836_IMG_20210423_171553.jpg',
    rights: 'own',
    category: 'tueren',
    project: 'eingang-holzlamellen',
    role: 'cover',
    out: 'projects/eingang-holzlamellen/01-eingang.jpg',
    notes: '',
  },
  // --- 4 eichentreppe -----------------------------------------------------------------------------
  {
    id: 'eichentreppe-01',
    file: '6405e88edd1f951832d788d3_IMG_20230203_125350.jpg',
    rights: 'own',
    category: 'treppen',
    project: 'eichentreppe',
    role: 'cover',
    out: 'projects/eichentreppe/01-treppe.jpg',
    notes: `Sketch→photo candidate. "Treppe Eiche Massivholz naturgeölt.jpg" is the same photo and is not migrated.`,
  },
  // --- 5 treppenhaus-handlauf ---------------------------------------------------------------------
  {
    id: 'treppenhaus-handlauf-01',
    file: '63467e26078daa221b504a42_ein_schwarzer_handlauf_setzt_akzente.jpeg',
    rights: 'own-legacy',
    category: 'treppen',
    project: 'treppenhaus-handlauf',
    role: 'cover',
    out: 'projects/treppenhaus-handlauf/01-handlauf.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  {
    id: 'treppenhaus-handlauf-02',
    file: '63467e3cfdfbaa0fde8b9426_Handlauf_und_Trittstufen_wurden_geolt__gewachst.jpeg',
    rights: 'own-legacy',
    category: 'treppen',
    project: 'treppenhaus-handlauf',
    role: 'gallery',
    out: 'projects/treppenhaus-handlauf/02-trittstufen.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  {
    id: 'treppenhaus-handlauf-03',
    file: '63467e26c3f36b085b613413_ein_blick_durchs_ganze_haus.jpeg',
    rights: 'own-legacy',
    category: 'treppen',
    project: 'treppenhaus-handlauf',
    role: 'gallery',
    out: 'projects/treppenhaus-handlauf/03-treppenhaus.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  // --- 6 einbauschrankwand ------------------------------------------------------------------------
  {
    id: 'einbauschrankwand-01',
    file: '655a0e39754b348afe09d381_20230914_150222_1.jpg',
    rights: 'own',
    category: 'moebel',
    project: 'einbauschrankwand',
    role: 'cover',
    out: 'projects/einbauschrankwand/01-geschlossen.jpg',
    notes: `Closed state of the open/closed toggle. Sketch→photo candidate.`,
  },
  {
    id: 'einbauschrankwand-02',
    file: '655a0e6c3fb524b2a9228233_20230914_150410_1.jpg',
    rights: 'own',
    category: 'moebel',
    project: 'einbauschrankwand',
    role: 'gallery',
    out: 'projects/einbauschrankwand/02-offen.jpg',
    notes: `Open state of the open/closed toggle; old Möbel page photo.`,
  },
  // --- 7 shoji-kleiderschrank ---------------------------------------------------------------------
  {
    id: 'shoji-kleiderschrank-01',
    file: '63cef6593370e506bf289ff5_IMG_20181126_130556.jpg',
    rights: 'own',
    category: 'moebel',
    project: 'shoji-kleiderschrank',
    role: 'cover',
    out: 'projects/shoji-kleiderschrank/01-geschlossen.jpg',
    notes: `Sketch→photo candidate.`,
  },
  {
    id: 'shoji-kleiderschrank-02',
    file: '63cef6679f99bd4763f11798_IMG_20181126_130700.jpg',
    rights: 'own',
    category: 'moebel',
    project: 'shoji-kleiderschrank',
    role: 'gallery',
    out: 'projects/shoji-kleiderschrank/02-offen.jpg',
    notes: '',
  },
  // --- 8 arbeitszimmer-wohnwand -------------------------------------------------------------------
  {
    id: 'arbeitszimmer-wohnwand-01',
    file: '6346804d98f82c10e74543f8_DSCF3091.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'arbeitszimmer-wohnwand',
    role: 'cover',
    out: 'projects/arbeitszimmer-wohnwand/01-schreibtisch.jpg',
    notes: `${CONFIRM_LEGACY} Grouping with DSCF3084 to confirm.`,
  },
  {
    id: 'arbeitszimmer-wohnwand-02',
    file: '634680681f0d7778f093c9e8_DSCF3084.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'arbeitszimmer-wohnwand',
    role: 'gallery',
    out: 'projects/arbeitszimmer-wohnwand/02-tv-moebel.jpg',
    notes: `${CONFIRM_LEGACY} Grouping with DSCF3091 to confirm.`,
  },
  // --- 9 glasvitrine ------------------------------------------------------------------------------
  {
    id: 'glasvitrine-01',
    file: '6346804cf202f852c69ff68d_glasvitrine_mit_integrierter_beleuchtung.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'glasvitrine',
    role: 'cover',
    out: 'projects/glasvitrine/01-vitrine.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  // --- 10 kernbuchenbett --------------------------------------------------------------------------
  {
    id: 'kernbuchenbett-01',
    file: '6346804c4dce67784bbd1427_massivholzbett_in_kernbuche.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'kernbuchenbett',
    role: 'cover',
    out: 'projects/kernbuchenbett/01-bett.jpg',
    notes: `${CONFIRM_LEGACY}`,
  },
  // --- 11 bad-nach-mass ---------------------------------------------------------------------------
  {
    id: 'bad-nach-mass-01',
    file: '6346804ca336aa361286ad0c_badgestaltung_DSCF2263.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'bad-nach-mass',
    role: 'cover',
    out: 'projects/bad-nach-mass/01-waschtisch.jpg',
    notes: `${CONFIRM_LEGACY} Grouping with auf_engstem_raum to confirm.`,
  },
  {
    id: 'bad-nach-mass-02',
    file: '63467f5e3618be799c845a22_auf_engstem_raum.jpeg',
    rights: 'own-legacy',
    category: 'moebel',
    project: 'bad-nach-mass',
    role: 'gallery',
    out: 'projects/bad-nach-mass/02-tueren.jpg',
    notes: `${CONFIRM_LEGACY} Grouping with badgestaltung to confirm.`,
  },
  // --- 12 dachausbau-dielen -----------------------------------------------------------------------
  {
    id: 'dachausbau-dielen-01',
    file: '63cef58d9f99bd2e50f024b1_2019-09-20.jpg',
    rights: 'own-unverified',
    category: 'boeden',
    project: 'dachausbau-dielen',
    role: 'cover',
    out: 'projects/dachausbau-dielen/01-dachausbau.jpg',
    notes: 'Unverified origin, only 540×420 px (card only). Owner to confirm it is a Schreinerei Schmidt project.',
  },
  // --- 13 altbau-eichendielen ---------------------------------------------------------------------
  {
    id: 'altbau-eichendielen-01',
    file: '63cef60dbc50fe04527e110a_IMG_20200527_150359.jpg',
    rights: 'own',
    category: 'boeden',
    project: 'altbau-eichendielen',
    role: 'cover',
    out: 'projects/altbau-eichendielen/01-eichendielen.jpg',
    notes: '',
  },
  // --- 14 fischgraetparkett-eiche (path fixed by Phase 0: src/pages/index.astro imports it) ------
  {
    id: 'fischgraetparkett-eiche-01',
    file: '63cef5cff7bbf40487275446_Eiche Fischgrätparkett.jpg',
    rights: 'own',
    category: 'boeden',
    project: 'fischgraetparkett-eiche',
    role: 'cover',
    out: 'projects/fischgraetparkett-eiche/01-parkett.jpg',
    notes: `Sketch→photo candidate. Owner to confirm the project.`,
  },
  // --- 15 draussen-mit-holz -----------------------------------------------------------------------
  {
    id: 'draussen-mit-holz-01',
    file: '634680f898f82cf4dd45475d_Sonnenplatze.jpeg',
    rights: 'own-legacy',
    category: 'terrassen',
    project: 'draussen-mit-holz',
    role: 'cover',
    out: 'projects/draussen-mit-holz/01-sonnenplatz.jpg',
    notes: `${CONFIRM_LEGACY} Grouping with the zaunanlage photos to confirm.`,
  },
  {
    id: 'draussen-mit-holz-02',
    file: '634680f861ca47c38c7aae91_zaunanlage_DSCF2820.jpeg',
    rights: 'own-legacy',
    category: 'terrassen',
    project: 'draussen-mit-holz',
    role: 'gallery',
    out: 'projects/draussen-mit-holz/02-gartentor.jpg',
    notes: `${CONFIRM_LEGACY} Grouping to confirm.`,
  },
  {
    id: 'draussen-mit-holz-03',
    file: '634681233030a169126749e5_zaunanlage_DSCF2815.jpeg',
    rights: 'own-legacy',
    category: 'terrassen',
    project: 'draussen-mit-holz',
    role: 'gallery',
    out: 'projects/draussen-mit-holz/03-zaun.jpg',
    notes: `${CONFIRM_LEGACY} Grouping to confirm.`,
  },
  // --- Service-page photos without a project ("Where the remaining photos go") ------------------
  {
    id: 'boeden-massivdielen-kiefer',
    file: '634682a827d32783761a486b_kiefer_landhausdielen_geolt__gewachst.jpeg',
    rights: 'own-legacy',
    category: 'boeden',
    project: null,
    role: 'type',
    out: 'services/boeden/01-massivdielen-kiefer.jpg',
    notes: `${CONFIRM_LEGACY} Illustrates the Böden type "Massivdielen".`,
  },
  {
    id: 'fenster-balkontuer-altbau',
    file: '63467f5e98f82c3a10453ffb_balkontur_im_altbau.jpeg',
    rights: 'own-legacy',
    category: 'fenster',
    project: null,
    role: 'gallery',
    out: 'services/fenster/01-balkontuer-altbau.jpg',
    notes: `${CONFIRM_LEGACY} Used on the Fenster and Altbau pages (the only owner photo for Fenster).`,
  },
  // --- Team (Über uns) ----------------------------------------------------------------------------
  {
    id: 'team-gruppe',
    file: '63d51c3621df9f7b7ba89fc2_Team1.jpg',
    rights: 'own',
    category: null,
    project: null,
    role: 'team',
    out: 'team/team-gruppe.jpg',
    notes:
      'Shows four people: publishing needs written consent from everyone pictured (publicationConsent: ausstehend). EXIF capture date 2022-09-12, edited 2023-01-28.',
  },
  {
    id: 'team-ulf-schmidt',
    file: '634674091be1f9125a9c4bd0_ulf_schmidt.jpg',
    rights: 'own-unverified',
    category: null,
    project: null,
    role: 'portrait',
    out: 'team/ulf-schmidt.jpg',
    notes:
      'Unverified: unused on the old site. Owner to confirm it may be used (owner checklist) and who holds the photographer rights.',
  },
  // --- Brand reference (never rendered as a photo) -----------------------------------------------
  {
    id: 'brand-logo-reference',
    file: '62fdeca9bdc81d826ce7fa07_Logo.png',
    rights: 'own',
    category: null,
    project: null,
    role: 'brand-reference',
    out: 'brand/logo-reference.png',
    notes: 'Old 702×107 PNG wordmark. Input for the Phase 1 wordmark mask only; never render it as a photo.',
  },
];
