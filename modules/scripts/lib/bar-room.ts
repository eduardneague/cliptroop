/**
 * What the one bar holds at its width (1.55.2: the owner, "add these buttons from the uncollapsed menu into the collapsed
 * menu so we can get rid of that part completely, make icons basically ... to have as many of them in a smaller
 * footprint"). As it narrows, things go into menus in this order: the title, the word "Suggestions", the words on the
 * step's button, the words count, undo and redo, page break, checklist and quote, strikethrough / highlight / colour
 * (under More), the page's buttons (into one ⋯), numbered list / alignment / link / image / frame guide (under More, as
 * on a phone), and last the score's ring and the Suggestions button itself (its round button in the corner stays).
 * Worked out from what each part takes (measured in the browser: a "Review" dropdown, People and the step's button,
 * nobody else here) with a little to spare. `w`: the bar's width; `faces`: the others' faces' width; `flow`: People
 * and the step's button are there; `docs`: the documents dropdown's width.
 */
export function barRoom(w: number, { faces = 0, flow = true, docs = 100 }: { faces?: number; flow?: boolean; docs?: number } = {}) {
  const W = w - faces - (docs - 100) + (flow ? 0 : 77);
  return {
    /** The video's title after the documents. */
    title: W >= 1980,
    /** "Suggestions" written out (else its sign and count). */
    sugLabel: W >= 1720,
    /** "Ready for staging" written out (else its arrow). */
    flowLabels: W >= 1632,
    /** The words and the time it takes to say them. */
    words: W >= 1508,
    /** Undo and redo (else under More: Ctrl+Z and Ctrl+Shift+Z work anyway). */
    undo: W >= 1377,
    /** Page break (else under More). */
    pageBreak: W >= 1328,
    /** Checklist and quote (else under More). */
    lists: W >= 1290,
    /** Strikethrough, highlight and text colour (else under More). */
    marks: W >= 1214,
    /** Page width, paper and Export as their own buttons (else in one ⋯ menu). */
    tools: W >= 1080,
    /** Numbered list, alignment, link, image and frame guide (else under More, as on a phone). */
    basics: W >= 984,
    /** The score's ring by Suggestions (else a narrower text style box too). */
    score: W >= 774,
    /** Suggestions in the bar at all (else only its round button in the corner). */
    sug: W >= 714,
  };
}
export type BarRoom = ReturnType<typeof barRoom>;
