import { expect, test } from "@playwright/test";

import { openThemeDriver } from "../support/theme";

// A Latin phrase set off with emphasis so it renders as its own element
// (marked wraps *…* in <em>), nested inside Cyrillic prose. Neither
// magick.css nor default-ru's edits give <em>/<i> their own font-family (see
// magick.css: `i, em { font-size: … }` only touches size), so if the theme
// is doing its job the phrase inherits the exact same font-family as the
// Cyrillic text around it -- never a second, different face.
const THEMED_BOOK = [
  '<Book theme="default-ru">',
  '<Section columns="1">',
  "# Заголовок",
  "",
  "Русский текст с *Read the Situation* внутри.",
  "</Section>",
  "</Book>",
].join("\n");

const THEMELESS_BOOK = ["# A cheat sheet", "", "Some prose with no theme at all."].join("\n");

/**
 * Consumer: a Russian-speaking author who declares `<Book theme="default-ru">`
 * expecting Cyrillic-covering typefaces, and expects an English move name
 * inside Russian prose to read as one typeface, not two -- the exact defect
 * CONTEXT.md's Theme entry rejects a unicode-range split for. The observable
 * failure is a real browser's own `getComputedStyle` resolving the heading,
 * the Cyrillic paragraph, or the Latin phrase inside it to something other
 * than what the theme's cascade should produce -- a font-family mismatch a
 * unicode-range split would reintroduce, or a cascade-order bug that let the
 * base fallback style win instead of the theme's. The oracle is the browser
 * itself, not a comparison against render-book.ts's or magick.css's own text.
 */
test.describe("theme font resolution", () => {
  test("a themed book's heading and body text resolve to the theme's own typefaces", async ({
    page,
  }) => {
    const theme = await openThemeDriver(page);

    const fonts = await theme.renderedElementFonts(THEMED_BOOK);

    expect(fonts.heading).toContain("Alegreya");
    expect(fonts.body).toContain("Vollkorn");
  });

  test("a Latin phrase inside Russian prose resolves to the same font-family as the Cyrillic around it", async ({
    page,
  }) => {
    const theme = await openThemeDriver(page);

    const fonts = await theme.renderedElementFonts(THEMED_BOOK);

    expect(fonts.emphasizedBody).toBe(fonts.body);
  });

  test("a themeless book keeps its plain fallback font, unaffected by the theme existing", async ({ page }) => {
    const theme = await openThemeDriver(page);

    const fonts = await theme.renderedElementFonts(THEMELESS_BOOK);

    expect(fonts.document).not.toContain("Vollkorn");
  });

  /**
   * Consumer: a themed book's reader viewing the printed or previewed page,
   * who expects the running header and the page number to carry the theme's
   * own visual identity -- Alegreya for the header, Vollkorn for the page
   * number -- matching how the theme already owns heading and body typography
   * above. The observable failure is a real browser's own `getComputedStyle`
   * resolving the actual rendered margin-box element to a font-family other
   * than the theme declares -- the plain fallback leaking through, or the
   * wrong face landing on the wrong box -- independent of theme.ts's own CSS
   * text, since it is the browser's real cascade resolution of the
   * Vivliostyle-rendered element, not a string comparison against the
   * stylesheet this patch wrote. A margin box only exists once a real
   * pagination pass has run (unlike `h1`/`p` above), so this reads it off
   * `theme.marginBoxFonts`'s real Vivliostyle container rather than a plain
   * srcdoc iframe.
   */
  test("a themed book's margin boxes resolve to the theme's own typefaces for the running header and the page number", async ({
    page,
  }) => {
    const theme = await openThemeDriver(page);

    const fonts = await theme.marginBoxFonts(THEMED_BOOK);

    expect(fonts.runningHeader).toContain("Alegreya");
    expect(fonts.pageNumber).toContain("Vollkorn");
  });
});
