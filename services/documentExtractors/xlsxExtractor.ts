import path from "node:path";
import ExcelJS from "exceljs";

const MAX_ROWS_PER_SHEET = 250;
const MAX_COLUMNS_PER_ROW = 50;

export interface XlsxExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
  metadataOnly?: boolean;
}

export interface XlsxExtractionResult {
  text: string;
  metadata: {
    sheetCount?: number;
    sheetNames?: string[];
  };
  partial: boolean;
}

export async function extractXlsxText(input: XlsxExtractionInput): Promise<XlsxExtractionResult> {
  if (input.metadataOnly) {
    return {
      text: buildSpreadsheetAssetText(input, []),
      metadata: {},
      partial: true
    };
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(input.filePath);
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    const sections: string[] = [];

    for (const sheet of workbook.worksheets) {
      const renderedRows: string[] = [];

      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > MAX_ROWS_PER_SHEET) {
          return;
        }

        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          if (columnNumber > MAX_COLUMNS_PER_ROW) {
            return;
          }

          const text = getCellText(cell).trim();
          if (text) {
            cells.push(text);
          }
        });

        if (cells.length > 0) {
          renderedRows.push(cells.join(" | "));
        }
      });

      if (renderedRows.length > 0) {
        sections.push(`Sheet: ${sheet.name}\n${renderedRows.join("\n")}`);
      }
    }

    return {
      text: sections.length
        ? sections.join("\n\n")
        : buildSpreadsheetAssetText(input, sheetNames),
      metadata: {
        sheetCount: sheetNames.length,
        sheetNames
      },
      partial: sections.length === 0
    };
  } catch {
    return {
      text: buildSpreadsheetAssetText(input, []),
      metadata: {},
      partial: true
    };
  }
}

function buildSpreadsheetAssetText(input: XlsxExtractionInput, sheetNames: string[]): string {
  return [
    `Spreadsheet asset: ${stripExtension(input.fileName)}`,
    `File: ${input.fileName}`,
    `Path: ${input.relativePath}`,
    `Folder: ${path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath)}`,
    sheetNames.length ? `Sheets: ${sheetNames.join(", ")}` : "",
    "TODO: add richer table detection and semantic indexing."
  ]
    .filter(Boolean)
    .join("\n");
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function getCellText(cell: ExcelJS.Cell): string {
  if (cell.text) {
    return cell.text;
  }

  if (cell.value === null || cell.value === undefined) {
    return "";
  }

  if (typeof cell.value === "object") {
    return JSON.stringify(cell.value);
  }

  return String(cell.value);
}
