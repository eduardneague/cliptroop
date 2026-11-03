/**
 * An Excel workbook (.xlsx), written here (1.42.0, Business's registers): no library (exceljs and the like bring a long
 * tail of dependencies), only what a register needs, the way Excel writes it, so Excel, LibreOffice, Numbers and Google
 * Sheets open it the same:
 *  - text, numbers, true/false, days (as dates, with their format), formulas with their values worked out already
 *    (the file opens with the right numbers; Excel works them out again on opening);
 *  - fonts, fills, borders, alignment, wrapping, number formats (Excel shows 1.234,56 or 1,234.56 by its own locale);
 *  - column widths, row heights, merged cells, frozen header rows, filters;
 *  - printing: A4, portrait or landscape, fitted to the page's width, the header rows on every page, a header and a
 *    footer ("Pagina 1 din 3"), margins;
 *  - several sheets, the workbook's title and author.
 * The parts are zipped by lib/zip.ts (stored: a register is small).
 */
import { zipFiles } from "./zip";

export type XAlign = "left" | "center" | "right";
export type XStyle = {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  /** "RRGGBB" */
  color?: string;
  font?: string;
  fill?: string;
  /** Thin lines: all four sides, or some. */
  border?: "all" | "none" | { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean; thick?: "top" | "bottom" };
  borderColor?: string;
  h?: XAlign;
  v?: "top" | "center" | "bottom";
  wrap?: boolean;
  indent?: number;
  /** A number format: "#,##0.00", "dd.mm.yyyy"… */
  fmt?: string;
};

/**
 * A cell: a value, or a value with a style and a formula ("SUM(E9:E20)", without "="; `v` is its worked-out value), or
 * text in runs of their own look ("Anul: " in bold, "2026" not).
 */
export type XValue = string | number | boolean | null | undefined;
export type XRun = { text: string; bold?: boolean; italic?: boolean; color?: string; size?: number };
export type XCell = XValue | { v?: XValue; f?: string; s?: XStyle; rich?: XRun[] };
export type XRow = { cells: XCell[]; height?: number; s?: XStyle };

export type XSheet = {
  name: string;
  /** Widths in characters. */
  cols?: number[];
  rows: XRow[];
  /** "A1:H1" */
  merges?: string[];
  /** Rows (and columns) kept in view while scrolling. */
  freeze?: { rows: number; cols?: number };
  /** "A8:H120" */
  filter?: string;
  grid?: boolean;
  /** "RRGGBB" */
  tab?: string;
  print?: {
    landscape?: boolean;
    /** Fitted to the page's width (as many pages tall as it takes). */
    fitWidth?: boolean;
    /** Rows printed at the top of every page: [first, last], from 1. */
    repeatRows?: [number, number];
    /** Excel's header/footer codes: &L &C &R, &P (page), &N (pages), && for a plain &. */
    header?: string;
    footer?: string;
    /** Inches. */
    margins?: { left: number; right: number; top: number; bottom: number; header: number; footer: number };
    center?: boolean;
  };
};

export type XBook = { sheets: XSheet[]; title?: string; author?: string; created?: Date; font?: { name: string; size: number } };

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const cellRef = (row: number, col: number) => `${colName(col)}${row + 1}`;

/** A sheet's name as Excel allows it: no []:*?/\, at most 31 characters, not empty; unique in the workbook. */
export function sheetNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
    taken.add(name.toLowerCase());
    return name;
  });
}
const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** The same style written the same, whatever order its keys came in. */
function stable(v: unknown): string {
  if (v == null || typeof v !== "object") return JSON.stringify(v ?? null);
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

class Styles {
  fonts: string[] = [];
  fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders: string[] = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  fmts = new Map<string, number>();
  xfs: string[] = [];
  byKey = new Map<string, number>();
  constructor(private base: { name: string; size: number }) {
    this.fonts.push(this.fontXml({}));
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    this.byKey.set(stable({}), 0);
  }
  private fontXml(s: XStyle) {
    return `<font>${s.bold ? "<b/>" : ""}${s.italic ? "<i/>" : ""}<sz val="${s.size ?? this.base.size}"/><color rgb="FF${(s.color ?? "000000").toUpperCase()}"/><name val="${esc(s.font ?? this.base.name)}"/><family val="2"/></font>`;
  }
  private index(list: string[], xml: string) {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }
  private fmtId(code: string) {
    const builtIn: Record<string, number> = { General: 0, "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4, "0%": 9, "0.00%": 10, "@": 49 };
    if (code in builtIn) return builtIn[code];
    let id = this.fmts.get(code);
    if (id == null) {
      id = 164 + this.fmts.size;
      this.fmts.set(code, id);
    }
    return id;
  }
  id(s: XStyle | undefined): number {
    if (!s) return 0;
    const key = stable(s);
    const known = this.byKey.get(key);
    if (known != null) return known;
    const font = s.bold || s.italic || s.size || s.color || s.font ? this.index(this.fonts, this.fontXml(s)) : 0;
    const fill = s.fill ? this.index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let border = 0;
    if (s.border && s.border !== "none") {
      const b = s.border === "all" ? { top: true, bottom: true, left: true, right: true } : s.border;
      const thick = typeof s.border === "object" ? s.border.thick : undefined;
      const color = `<color rgb="FF${(s.borderColor ?? "9CA3AF").toUpperCase()}"/>`;
      const side = (name: "left" | "right" | "top" | "bottom", on?: boolean) =>
        on ? `<${name} style="${thick === name ? "medium" : "thin"}">${color}</${name}>` : `<${name}/>`;
      border = this.index(this.borders, `<border>${side("left", b.left)}${side("right", b.right)}${side("top", b.top)}${side("bottom", b.bottom)}<diagonal/></border>`);
    }
    const fmt = s.fmt ? this.fmtId(s.fmt) : 0;
    const align =
      s.h || s.v || s.wrap || s.indent
        ? `<alignment${s.h ? ` horizontal="${s.h}"` : ""}${s.v ? ` vertical="${s.v}"` : ""}${s.wrap ? ' wrapText="1"' : ""}${s.indent ? ` indent="${s.indent}"` : ""}/>`
        : "";
    const xf = `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ""}${font ? ' applyFont="1"' : ""}${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    this.xfs.push(xf);
    this.byKey.set(key, this.xfs.length - 1);
    return this.xfs.length - 1;
  }
  xml() {
    const fmts = [...this.fmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.fmts.size ? `<numFmts count="${this.fmts.size}">${fmts}</numFmts>` : "") +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

class Strings {
  /** Each string's <si> inside. */
  list: string[] = [];
  at = new Map<string, number>();
  count = 0;
  constructor(private base: { name: string; size: number }) {}
  private add(xml: string) {
    this.count++;
    let i = this.at.get(xml);
    if (i == null) {
      i = this.list.length;
      this.list.push(xml);
      this.at.set(xml, i);
    }
    return i;
  }
  id(s: string) {
    return this.add(`<t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ""}>${esc(s)}</t>`);
  }
  rich(runs: readonly XRun[]) {
    return this.add(
      runs
        .map(
          (r) =>
            `<r><rPr>${r.bold ? "<b/>" : ""}${r.italic ? "<i/>" : ""}<sz val="${r.size ?? this.base.size}"/><color rgb="FF${(r.color ?? "000000").toUpperCase()}"/><rFont val="${esc(this.base.name)}"/><family val="2"/></rPr><t xml:space="preserve">${esc(r.text)}</t></r>`
        )
        .join("")
    );
  }
  xml() {
    const items = this.list.map((x) => `<si>${x}</si>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

function sheetXml(sh: XSheet, styles: Styles, strings: Strings): string {
  let maxCol = 0;
  const rowsXml = sh.rows
    .map((row, r) => {
      maxCol = Math.max(maxCol, row.cells.length);
      const cells = row.cells
        .map((cell, c) => {
          const box: { v?: XValue; f?: string; s?: XStyle; rich?: XRun[] } = cell != null && typeof cell === "object" ? cell : { v: cell as XValue };
          const style = styles.id(box.s ?? row.s);
          const ref = cellRef(r, c);
          const v = box.v;
          const sAttr = style ? ` s="${style}"` : "";
          if (box.rich?.length) return `<c r="${ref}"${sAttr} t="s"><v>${strings.rich(box.rich)}</v></c>`;
          if (box.f) {
            const val = typeof v === "number" && Number.isFinite(v) ? `<v>${v}</v>` : typeof v === "string" ? `<v>${esc(v)}</v>` : "";
            return `<c r="${ref}"${sAttr}${typeof v === "string" ? ' t="str"' : ""}><f>${esc(box.f)}</f>${val}</c>`;
          }
          if (v == null || v === "") return style ? `<c r="${ref}"${sAttr}/>` : "";
          if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${v}</v></c>` : style ? `<c r="${ref}"${sAttr}/>` : "";
          if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
          return `<c r="${ref}"${sAttr} t="s"><v>${strings.id(v)}</v></c>`;
        })
        .join("");
      const ht = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      return `<row r="${r + 1}"${ht}>${cells}</row>`;
    })
    .join("");
  const dim = sh.rows.length && maxCol ? `A1:${cellRef(sh.rows.length - 1, Math.max(0, maxCol - 1))}` : "A1";
  const f = sh.freeze;
  const pane =
    f && (f.rows || f.cols)
      ? `<pane${f.cols ? ` xSplit="${f.cols}"` : ""}${f.rows ? ` ySplit="${f.rows}"` : ""} topLeftCell="${cellRef(f.rows ?? 0, f.cols ?? 0)}" activePane="${f.rows && f.cols ? "bottomRight" : f.rows ? "bottomLeft" : "topRight"}" state="frozen"/><selection pane="${f.rows && f.cols ? "bottomRight" : f.rows ? "bottomLeft" : "topRight"}" activeCell="${cellRef(f.rows ?? 0, f.cols ?? 0)}" sqref="${cellRef(f.rows ?? 0, f.cols ?? 0)}"/>`
      : "";
  const cols = sh.cols?.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const p = sh.print ?? {};
  const m = p.margins ?? { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  const hf = p.header || p.footer ? `<headerFooter>${p.header ? `<oddHeader>${esc(p.header)}</oddHeader>` : ""}${p.footer ? `<oddFooter>${esc(p.footer)}</oddFooter>` : ""}</headerFooter>` : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetPr>${sh.tab ? `<tabColor rgb="FF${sh.tab.toUpperCase()}"/>` : ""}${p.fitWidth ? '<pageSetUpPr fitToPage="1"/>' : ""}</sheetPr>` +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${sh.grid === false ? ' showGridLines="0"' : ""}>${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowsXml}</sheetData>` +
    (sh.filter ? `<autoFilter ref="${sh.filter}"/>` : "") +
    (sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>` : "") +
    (p.center ? '<printOptions horizontalCentered="1"/>' : "") +
    `<pageMargins left="${m.left}" right="${m.right}" top="${m.top}" bottom="${m.bottom}" header="${m.header}" footer="${m.footer}"/>` +
    `<pageSetup paperSize="9" orientation="${p.landscape ? "landscape" : "portrait"}"${p.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : ""}/>` +
    hf +
    "</worksheet>"
  );
}

/** The workbook's bytes. */
export function xlsx(book: XBook): Uint8Array {
  const font = book.font ?? { name: "Calibri", size: 10 };
  const styles = new Styles(font);
  const strings = new Strings(font);
  const names = sheetNames(book.sheets.map((s) => s.name));
  const sheets = book.sheets.map((s) => sheetXml(s, styles, strings));
  const defined: string[] = [];
  book.sheets.forEach((s, i) => {
    if (s.filter) defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(quoteSheet(names[i]))}!${absolute(s.filter)}</definedName>`);
    const rr = s.print?.repeatRows;
    if (rr) defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(quoteSheet(names[i]))}!$${rr[0]}:$${rr[1]}</definedName>`);
  });
  const enc = new TextEncoder();
  const created = (book.created ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const parts: { name: string; xml: string }[] = [
    {
      name: "[Content_Types].xml",
      xml:
        head +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      xml:
        head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        "</Relationships>",
    },
    {
      name: "docProps/core.xml",
      xml:
        head +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        (book.title ? `<dc:title>${esc(book.title)}</dc:title>` : "") +
        `<dc:creator>${esc(book.author ?? "VPlanner")}</dc:creator><cp:lastModifiedBy>${esc(book.author ?? "VPlanner")}</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
        "</cp:coreProperties>",
    },
    {
      name: "docProps/app.xml",
      xml:
        head +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>VPlanner</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
        `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${names.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
        `<TitlesOfParts><vt:vector size="${names.length}" baseType="lpstr">${names.map((n) => `<vt:lpstr>${esc(n)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>` +
        "</Properties>",
    },
    {
      name: "xl/workbook.xml",
      xml:
        head +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<workbookPr defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews>' +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        (defined.length ? `<definedNames>${defined.join("")}</definedNames>` : "") +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
        "</workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      xml:
        head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${names.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        "</Relationships>",
    },
    ...sheets.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml })),
  ];
  // Strings and styles last: the sheets above filled them.
  parts.push({ name: "xl/styles.xml", xml: styles.xml() }, { name: "xl/sharedStrings.xml", xml: strings.xml() });
  return zipFiles(
    parts.map((p) => ({ name: p.name, data: enc.encode(p.xml), date: book.created })),
    { paths: true }
  );
}

/** "A8:H120" → "$A$8:$H$120" */
function absolute(range: string) {
  return range.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
