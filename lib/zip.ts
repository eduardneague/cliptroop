/*
 * A .zip of several files, made in the browser (1.38.0: shorts exported together, one PDF or Word file each). The files
 * are stored as they are, not compressed again: PDFs and Word files are compressed already, so it would only cost time.
 * Names are UTF-8 (Romanian letters and the like stay as typed), and a name that's taken gets " (2)", " (3)"…
 */

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

let table: Uint32Array | null = null;
/** The CRC-32 every file in a zip carries (the standard one, as in PNG and gzip). */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The time as a zip keeps it (MS-DOS: two seconds apart, from 1980). */
function dosTime(d: Date) {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** "a.pdf", "a.pdf" → "a.pdf", "a (2).pdf". */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const name = raw.replace(/[\\/]+/g, "-").trim() || "file";
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 2; ; n++) {
      const next = `${stem} (${n})${ext}`;
      if (!taken.has(next.toLowerCase())) {
        taken.add(next.toLowerCase());
        return next;
      }
    }
  });
}

/**
 * The zip's bytes. `paths` (1.42.0, a spreadsheet's parts: "xl/workbook.xml"…): the names are folders and files as
 * given, not tidied into plain file names.
 */
export function zipFiles(entries: ZipEntry[], o: { paths?: boolean } = {}): Uint8Array {
  const enc = new TextEncoder();
  const names = o.paths ? entries.map((e) => e.name) : uniqueNames(entries.map((e) => e.name));
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  entries.forEach((e, i) => {
    const name = enc.encode(names[i]);
    const crc = crc32(e.data);
    const { time, date } = dosTime(e.date ?? new Date());
    const size = e.data.length;
    // Local header: signature, version 2.0, flags (bit 11: the name is UTF-8), stored, time, date, CRC, sizes, name.
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    // Its line in the central directory, pointing back at the local header.
    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(local, e.data);
    central.push(dir);
    offset += local.length + size;
  });
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
