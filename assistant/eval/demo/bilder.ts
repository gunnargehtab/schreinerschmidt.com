// Optional screenshots for the owner who will not open .eml or .html files (7f): a PNG of every
// saved review page (Chromium through Playwright) and of page 1 of every sent Angebot PDF
// (`pdftoppm` from poppler; headless Chromium has no PDF viewer). Neither tool is a dependency of
// the assistant package: Playwright resolves from the site's node_modules when it is installed
// there, pdftoppm from the PATH. Whatever is missing is skipped with a German note for the
// overview; the demo itself never fails because of a screenshot.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DemoFall } from './lauf';

export interface BildErgebnis {
  seiten: number;
  pdfs: number;
  /** German note for the overview when something was skipped, else null. */
  hinweis: string | null;
}

interface Browser {
  newPage(o: { viewport: { width: number; height: number } }): Promise<{
    goto(url: string): Promise<unknown>;
    screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
    close(): Promise<void>;
  }>;
  close(): Promise<void>;
}

/** Playwright's Chromium, or null (not installed, no browser). `DEMO_CHROMIUM` sets the executable. */
async function chromium(): Promise<Browser | null> {
  const name = 'playwright';
  try {
    const pw = (await import(name)) as {
      chromium: { launch(o: { executablePath?: string }): Promise<Browser> };
    };
    const exe = process.env['DEMO_CHROMIUM'];
    return await pw.chromium.launch(exe ? { executablePath: exe } : {});
  } catch {
    return null;
  }
}

const hatPdftoppm = (): boolean => spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' }).status === 0;

export async function bilder(ausgabe: string, faelle: readonly DemoFall[]): Promise<BildErgebnis> {
  const notizen: string[] = [];
  let seiten = 0;
  let pdfs = 0;

  const browser = await chromium();
  if (browser) {
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      for (const f of faelle) {
        const html = join(ausgabe, f.ordner, 'pruefseite.html');
        if (!existsSync(html)) continue;
        await page.goto(pathToFileURL(html).href);
        await page.screenshot({ path: join(ausgabe, f.ordner, 'pruefseite.png'), fullPage: true });
        seiten++;
      }
      await page.close();
    } finally {
      await browser.close();
    }
  } else {
    notizen.push(
      'Bilder der Prüfseiten fehlen: Der Browser für die Bildschirmfotos (Playwright mit Chromium) war nicht verfügbar.',
    );
  }

  if (hatPdftoppm()) {
    for (const f of faelle) {
      for (const d of f.dateien) {
        if (!d.datei.endsWith('.pdf') || d.datei === 'vorschau.pdf') continue;
        const ziel = join(ausgabe, f.ordner, d.datei.replace(/\.pdf$/, '-seite1'));
        const r = spawnSync(
          'pdftoppm',
          ['-png', '-r', '80', '-f', '1', '-l', '1', '-singlefile', join(ausgabe, f.ordner, d.datei), ziel],
          {
            stdio: 'ignore',
          },
        );
        if (r.status === 0) pdfs++;
      }
    }
  } else {
    notizen.push('Bilder der Angebots-PDFs fehlen: das Programm pdftoppm (Poppler) ist nicht installiert.');
  }
  return { seiten, pdfs, hinweis: notizen.length ? notizen.join(' ') : null };
}
