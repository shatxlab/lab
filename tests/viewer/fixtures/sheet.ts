import * as XLSX from "xlsx";

/** Writes a real .xlsx in memory from plain arrays of rows, one entry per sheet. */
export function xlsxBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function textBuffer(contents: string): ArrayBuffer {
  return new TextEncoder().encode(contents).buffer as ArrayBuffer;
}

/** Bytes of a windows-1251 string. Used for HTML-as-.xls fixtures, which Excel still opens. */
export function windows1251Buffer(contents: string): ArrayBuffer {
  const bytes = new Uint8Array(contents.length);
  for (let index = 0; index < contents.length; index += 1) {
    const code = contents.charCodeAt(index);
    if (code < 128) {
      bytes[index] = code;
    } else if (code >= 0x0410 && code <= 0x044f) {
      bytes[index] = code - 0x0410 + 0xc0;
    } else if (code === 0x0401) {
      bytes[index] = 0xa8;
    } else if (code === 0x0451) {
      bytes[index] = 0xb8;
    } else {
      throw new Error(`windows-1251 fixture cannot encode U+${code.toString(16)}`);
    }
  }
  return bytes.buffer;
}

export function xlsBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }

  return XLSX.write(workbook, { type: "array", bookType: "xls" }) as ArrayBuffer;
}
