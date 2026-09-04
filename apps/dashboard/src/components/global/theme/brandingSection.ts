/**
 * GWPrintz Branding Section for Excel Export
 * Adds company information and branding to the right side of the spreadsheet.
 * ponytail: unused until an Excel-export feature exists — wired and rebranded so it drops in.
 */

import XLSX from "xlsx-js-style";

// Generic style type for xlsx-js-style
type CellStyle = Record<string, unknown>;

// ============================================
// BRANDING STYLES
// ============================================

const BRAND_STYLES: Record<string, CellStyle> = {
  // Main company name - large, bold, black
  companyName: {
    font: { bold: true, color: { rgb: "000000" }, name: "Inter", sz: 18 },
    fill: { fgColor: { rgb: "FEF2F2" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "000000" } },
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Tagline column
  tagline: {
    font: { italic: true, color: { rgb: "6B7280" }, name: "Inter", sz: 10 },
    fill: { fgColor: { rgb: "FEF2F2" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Section headers (Downloaded from, Website, etc.)
  sectionLabel: {
    font: { bold: true, color: { rgb: "374151" }, name: "Inter", sz: 10 },
    fill: { fgColor: { rgb: "F9FAFB" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Section values (URLs, email, etc.)
  sectionValue: {
    font: { color: { rgb: "2563EB" }, name: "Inter", sz: 10 },
    fill: { fgColor: { rgb: "F9FAFB" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Description text - multiline intro
  description: {
    font: { color: { rgb: "4B5563" }, name: "Inter", sz: 9 },
    fill: { fgColor: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "top", wrapText: true },
    border: {
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Footer with copyright
  footer: {
    font: { color: { rgb: "9CA3AF" }, name: "Inter", sz: 8 },
    fill: { fgColor: { rgb: "F3F4F6" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      bottom: { style: "medium", color: { rgb: "000000" } },
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
  // Empty styled cell for padding
  emptyBranded: {
    fill: { fgColor: { rgb: "FFFFFF" } },
    border: {
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    },
  },
};

// ============================================
// BRANDING CONTENT
// ============================================

const BRANDING_INFO = {
  companyName: "GWPrintz",
  tagline: "Print-on-demand fulfillment, simplified",
  downloadedFrom: "www.gwprint.com",
  website: "https://gwprint.com",
  email: "support@gwprint.com",
  description:
    "GWPrintz is a fulfillment platform for print-on-demand sellers — " +
    "orders, products, inventory and payouts in one dashboard.",
};

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Add branding section to worksheet
 * @param ws - The worksheet to modify
 * @param lastDataColumn - Index of the last data row (0-based)
 */
export function addBrandingSection(
  ws: XLSX.WorkSheet,
  lastDataColumn: number
): void {
  // Start 20 columns to the right of last data row
  const startCol = lastDataColumn + 20;

  // Row positions (0-based)
  const rows = {
    companyName: 1,
    tagline: 2,
    spacer1: 3,
    downloadedLabel: 4,
    websiteLabel: 5,
    emailLabel: 6,
    spacer2: 7,
    descriptionStart: 8, // Description spans 3 rows (8, 9, 10)
    descriptionEnd: 10,
    spacer3: 11,
    footer: 12,
  };

  // Helper to set cell with style
  const setCell = (
    column: number,
    col: number,
    value: string,
    style: CellStyle
  ) => {
    const cellRef = XLSX.utils.encode_cell({ r: column, c: col });
    ws[cellRef] = { v: value, t: "s", s: style };
  };

  // Company name (merged across 2 columns)
  setCell(
    rows.companyName,
    startCol,
    BRANDING_INFO.companyName,
    BRAND_STYLES.companyName
  );
  setCell(rows.companyName, startCol + 1, "", BRAND_STYLES.companyName);

  // Tagline
  setCell(rows.tagline, startCol, BRANDING_INFO.tagline, BRAND_STYLES.tagline);
  setCell(rows.tagline, startCol + 1, "", BRAND_STYLES.tagline);

  // Spacer column
  setCell(rows.spacer1, startCol, "", BRAND_STYLES.emptyBranded);
  setCell(rows.spacer1, startCol + 1, "", BRAND_STYLES.emptyBranded);

  // Downloaded from
  setCell(
    rows.downloadedLabel,
    startCol,
    "Downloaded from:",
    BRAND_STYLES.sectionLabel
  );
  setCell(
    rows.downloadedLabel,
    startCol + 1,
    BRANDING_INFO.downloadedFrom,
    BRAND_STYLES.sectionValue
  );

  // Website
  setCell(rows.websiteLabel, startCol, "Website:", BRAND_STYLES.sectionLabel);
  setCell(
    rows.websiteLabel,
    startCol + 1,
    BRANDING_INFO.website,
    BRAND_STYLES.sectionValue
  );

  // Email
  setCell(rows.emailLabel, startCol, "Email:", BRAND_STYLES.sectionLabel);
  setCell(
    rows.emailLabel,
    startCol + 1,
    BRANDING_INFO.email,
    BRAND_STYLES.sectionValue
  );

  // Spacer
  setCell(rows.spacer2, startCol, "", BRAND_STYLES.emptyBranded);
  setCell(rows.spacer2, startCol + 1, "", BRAND_STYLES.emptyBranded);

  // Description (spans 3 rows x 2 columns)
  setCell(
    rows.descriptionStart,
    startCol,
    BRANDING_INFO.description,
    BRAND_STYLES.description
  );
  setCell(rows.descriptionStart, startCol + 1, "", BRAND_STYLES.description);
  // Fill the merged area cells with empty values and same style
  for (let r = rows.descriptionStart + 1; r <= rows.descriptionEnd; r++) {
    setCell(r, startCol, "", BRAND_STYLES.description);
    setCell(r, startCol + 1, "", BRAND_STYLES.description);
  }

  // Spacer
  setCell(rows.spacer3, startCol, "", BRAND_STYLES.emptyBranded);
  setCell(rows.spacer3, startCol + 1, "", BRAND_STYLES.emptyBranded);

  // Footer with year
  const year = new Date().getFullYear();
  setCell(rows.footer, startCol, `© ${year} GWPrintz`, BRAND_STYLES.footer);
  setCell(rows.footer, startCol + 1, "", BRAND_STYLES.footer);

  // Set row widths for branding section
  if (!ws["!cols"]) ws["!cols"] = [];
  ws["!cols"][startCol] = { wch: 18 };
  ws["!cols"][startCol + 1] = { wch: 28 };

  // Add merge cells for company name, tagline, description (3 rows x 2 cols), and footer
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push(
    {
      s: { r: rows.companyName, c: startCol },
      e: { r: rows.companyName, c: startCol + 1 },
    },
    {
      s: { r: rows.tagline, c: startCol },
      e: { r: rows.tagline, c: startCol + 1 },
    },
    {
      s: { r: rows.descriptionStart, c: startCol },
      e: { r: rows.descriptionEnd, c: startCol + 1 },
    },
    {
      s: { r: rows.footer, c: startCol },
      e: { r: rows.footer, c: startCol + 1 },
    }
  );

  // Update sheet range to include branding section
  const currentRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
  currentRange.e.c = Math.max(currentRange.e.c, startCol + 1);
  currentRange.e.r = Math.max(currentRange.e.r, rows.footer);
  ws["!ref"] = XLSX.utils.encode_range(currentRange);
}
