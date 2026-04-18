import type { CsvImportType, CsvPreviewSummary } from '../types';

const MEMBER_HEADERS = ['เลขที่สมาชิก', 'คำนำหน้าชื่อ', 'ชื่อ', 'สกุล', 'สถานะ'];
const LOAN_HEADERS = [
  'เลขที่สมาชิก',
  'เลขที่สัญญา',
  'คำนำหน้าชื่อ',
  'ชื่อ',
  'สกุล',
  'ยอดเงินกู้',
  'ยอดคงค้าง',
  'สถานะ',
  'วันที่สร้างสัญญา',
  'ผู้ค้ำประกันคนที่ 1',
  'ผู้ค้ำประกันคนที่ 2',
];

const HEADER_ALIASES: Record<string, string[]> = {
  'เลขที่สมาชิก': ['เลขที่สมาชิก', 'รหัสสมาชิก', 'member_no', 'memberno'],
  'เลขที่สัญญา': ['เลขที่สัญญา', 'contract_no', 'contractno'],
  'คำนำหน้าชื่อ': ['คำนำหน้าชื่อ', 'คำหนำหน้าชื่อ', 'คำนำหน้า', 'title'],
  'ชื่อ': ['ชื่อ', 'first_name', 'firstname'],
  'สกุล': ['สกุล', 'นามสกุล', 'last_name', 'lastname'],
  'สถานะ': ['สถานะ', 'status'],
  'ยอดเงินกู้': ['ยอดเงินกู้', 'loan_amount', 'loanamount'],
  'ยอดคงค้าง': ['ยอดคงค้าง', 'outstanding_amount', 'outstandingamount'],
  'วันที่สร้างสัญญา': ['วันที่สร้างสัญญา', 'วันที่ทำสัญญา', 'contract_date', 'created_at'],
  'ผู้ค้ำประกันคนที่ 1': ['ผู้ค้ำประกันคนที่1', 'ผู้ค้ำประกันคนที่ 1', 'guarantor_1', 'guarantor1'],
  'ผู้ค้ำประกันคนที่ 2': ['ผู้ค้ำประกันคนที่2', 'ผู้ค้ำประกันคนที่ 2', 'guarantor_2', 'guarantor2'],
};

function normalizeHeader(value: string) {
  return value.replace(/\uFEFF/g, '').trim().toLowerCase().replace(/[\s_\-()/]+/g, '');
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }

      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('ไฟล์ CSV ไม่มีข้อมูล');
  }

  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows.filter((item) => item.some((cell) => cell.length > 0)) };
}

function getRequiredHeaders(importType: CsvImportType) {
  return importType === 'members' ? MEMBER_HEADERS : LOAN_HEADERS;
}

function findMatchingHeader(headers: string[], expectedHeader: string) {
  const aliases = HEADER_ALIASES[expectedHeader] ?? [expectedHeader];
  const normalizedAliases = aliases.map((value) => normalizeHeader(value));

  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
}

export function buildCsvPreview(csvText: string, importType: CsvImportType, fileName: string) : CsvPreviewSummary {
  const { headers, rows } = parseCsv(csvText);
  const requiredHeaders = getRequiredHeaders(importType);
  const matchedHeaders = requiredHeaders
    .map((header) => findMatchingHeader(headers, header))
    .filter((header): header is string => Boolean(header));
  const missingHeaders = requiredHeaders.filter((header) => !findMatchingHeader(headers, header));

  const sampleRows = rows.slice(0, 5).map((row) => {
    const mappedRow: Record<string, string> = {};

    requiredHeaders.forEach((header) => {
      const actualHeader = findMatchingHeader(headers, header);
      const columnIndex = actualHeader ? headers.indexOf(actualHeader) : -1;
      mappedRow[header] = columnIndex >= 0 ? String(row[columnIndex] ?? '').trim() : '';
    });

    return mappedRow;
  });

  return {
    file_name: fileName,
    required_headers: requiredHeaders,
    headers,
    matched_headers: matchedHeaders,
    missing_headers: missingHeaders,
    row_count: rows.length,
    sample_rows: sampleRows,
    is_ready: missingHeaders.length === 0 && rows.length > 0,
  };
}