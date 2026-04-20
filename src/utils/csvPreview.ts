import type { CsvImportType, CsvPreviewIssue, CsvPreviewSummary } from '../types';

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
  'ผู้ค้ำประกันคนที่ 1': ['ผู้ค้ำประกันคนที่1', 'ผู้ค้ำประกันคนที่ 1', 'ผู้ค้ำที่1', 'ผู้ค้ำที่ 1', 'ผู้ค้ำ1', 'ผู้ค้ำ 1', 'ชื่อผู้ค้ำคนที่1', 'ชื่อผู้ค้ำคนที่ 1', 'guarantor_1', 'guarantor1'],
  'ผู้ค้ำประกันคนที่ 2': ['ผู้ค้ำประกันคนที่2', 'ผู้ค้ำประกันคนที่ 2', 'ผู้ค้ำที่2', 'ผู้ค้ำที่ 2', 'ผู้ค้ำ2', 'ผู้ค้ำ 2', 'ชื่อผู้ค้ำคนที่2', 'ชื่อผู้ค้ำคนที่ 2', 'guarantor_2', 'guarantor2'],
};

const FULL_NAME_ALIASES = ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ และ สกุล', 'ชื่อและสกุล', 'ชื่อ-นามสกุล', 'ชื่อ นามสกุล', 'ชื่อผู้กู้', 'ชื่อผู้กู้สกุล', 'ชื่อผู้กู้-สกุล', 'ชื่อผู้กู้-นามสกุล', 'ชื่อผู้กู้ นามสกุล', 'ชื่อผู้กู้/สกุล', 'ชื่อ-สกุลผู้กู้', 'ชื่อสมาชิก', 'fullname', 'full_name', 'name'];
const KNOWN_TITLES = ['นางสาว', 'เด็กหญิง', 'เด็กชาย', 'นาย', 'นาง'];

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

function findMatchingAlias(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((value) => normalizeHeader(value));
  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function splitPersonName(fullName: string, currentTitle: string) {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { title: currentTitle.trim(), firstName: '', lastName: '' };
  }

  let working = normalized;
  const inferredTitle = KNOWN_TITLES.find((item) => normalized === item || normalized.startsWith(item)) || '';
  const titleToStrip = currentTitle.trim() || inferredTitle;
  if (titleToStrip && working.startsWith(titleToStrip)) {
    working = working.slice(titleToStrip.length).trim();
  }

  const parts = working.split(' ').filter(Boolean);
  if (parts.length <= 1) {
    return { title: titleToStrip, firstName: parts[0] ?? '', lastName: '' };
  }

  return {
    title: titleToStrip,
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function parseGuarantorValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const matched = trimmed.match(/^\(([^)]+)\)\s*(.*)$/);
  if (!matched) {
    return trimmed;
  }

  return matched[1].trim();
}

function resolveNameFields(headers: string[], row: string[]) {
  const titleHeader = findMatchingHeader(headers, 'คำนำหน้าชื่อ');
  const firstNameHeader = findMatchingHeader(headers, 'ชื่อ');
  const lastNameHeader = findMatchingHeader(headers, 'สกุล');
  const fullNameHeader = findMatchingAlias(headers, FULL_NAME_ALIASES);

  const title = titleHeader ? String(row[headers.indexOf(titleHeader)] ?? '').trim() : '';
  const directFirstName = firstNameHeader ? String(row[headers.indexOf(firstNameHeader)] ?? '').trim() : '';
  const directLastName = lastNameHeader ? String(row[headers.indexOf(lastNameHeader)] ?? '').trim() : '';
  const fullName = fullNameHeader
    ? String(row[headers.indexOf(fullNameHeader)] ?? '').trim()
    : (!title && directFirstName && !directLastName ? directFirstName : '');

  const splitName = fullName ? splitPersonName(fullName, title) : { title, firstName: '', lastName: '' };

  if (directFirstName && directLastName) {
    return { title: title || splitName.title, firstName: directFirstName, lastName: directLastName };
  }

  if (!fullName) {
    return { title, firstName: directFirstName, lastName: directLastName };
  }

  return {
    title: title || splitName.title,
    firstName: directFirstName || splitName.firstName,
    lastName: directLastName || splitName.lastName,
  };
}

function toMappedRow(headers: string[], requiredHeaders: string[], row: string[]) {
  const mappedRow: Record<string, string> = {};
  const nameFields = resolveNameFields(headers, row);

  requiredHeaders.forEach((header) => {
    if (header === 'คำนำหน้าชื่อ') {
      mappedRow[header] = nameFields.title;
      return;
    }

    if (header === 'ชื่อ') {
      mappedRow[header] = nameFields.firstName;
      return;
    }

    if (header === 'สกุล') {
      mappedRow[header] = nameFields.lastName;
      return;
    }

    if (header === 'ผู้ค้ำประกันคนที่ 1' || header === 'ผู้ค้ำประกันคนที่ 2') {
      const actualHeader = findMatchingHeader(headers, header);
      const columnIndex = actualHeader ? headers.indexOf(actualHeader) : -1;
      mappedRow[header] = columnIndex >= 0 ? parseGuarantorValue(String(row[columnIndex] ?? '')) : '';
      return;
    }

    const actualHeader = findMatchingHeader(headers, header);
    const columnIndex = actualHeader ? headers.indexOf(actualHeader) : -1;
    mappedRow[header] = columnIndex >= 0 ? String(row[columnIndex] ?? '').trim() : '';
  });

  return mappedRow;
}

function getMissingHeaders(importType: CsvImportType, headers: string[], requiredHeaders: string[]) {
  const fullNameHeader = findMatchingAlias(headers, FULL_NAME_ALIASES);
  const firstNameHeader = findMatchingHeader(headers, 'ชื่อ');
  const hasCombinedLoanNameSource = importType === 'loan-contracts' && Boolean(fullNameHeader || firstNameHeader);

  return requiredHeaders.filter((header) => {
    if (importType === 'loan-contracts' && header === 'ผู้ค้ำประกันคนที่ 2') {
      return false;
    }

    if ((header === 'คำนำหน้าชื่อ' || header === 'ชื่อ' || header === 'สกุล') && fullNameHeader) {
      return false;
    }

    if ((header === 'คำนำหน้าชื่อ' || header === 'ชื่อ' || header === 'สกุล') && hasCombinedLoanNameSource) {
      return false;
    }

    return !findMatchingHeader(headers, header);
  });
}

function isValidDecimal(value: string) {
  if (!value.trim()) {
    return false;
  }

  const normalized = value.replace(/,/g, '').trim();
  return !Number.isNaN(Number(normalized));
}

function isValidDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return true;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    return true;
  }

  return false;
}

function validateMembersRow(row: Record<string, string>) {
  const messages: string[] = [];

  if (!row['เลขที่สมาชิก']) messages.push('เลขที่สมาชิกว่าง');
  if (!row['คำนำหน้าชื่อ']) messages.push('คำนำหน้าชื่อว่าง');
  if (!row['ชื่อ']) messages.push('ชื่อว่าง');
  if (!row['สกุล']) messages.push('สกุลว่าง');

  return messages;
}

function validateLoanRow(row: Record<string, string>) {
  const messages: string[] = [];

  if (!row['เลขที่สมาชิก']) messages.push('เลขที่สมาชิกว่าง');
  if (!row['เลขที่สัญญา']) messages.push('เลขที่สัญญาว่าง');
  if (!row['ชื่อ'] && !row['สกุล']) messages.push('ชื่อผู้กู้ว่าง');
  if (!row['ผู้ค้ำประกันคนที่ 1']) messages.push('ผู้ค้ำประกันคนที่ 1 ว่าง');

  if (!isValidDecimal(row['ยอดเงินกู้'])) messages.push('ยอดเงินกู้ไม่ใช่ตัวเลข');
  if (!isValidDecimal(row['ยอดคงค้าง'])) messages.push('ยอดคงค้างไม่ใช่ตัวเลข');
  if (!isValidDate(row['วันที่สร้างสัญญา'])) messages.push('วันที่สร้างสัญญาไม่ถูกต้อง');

  return messages;
}

function validateRows(
  importType: CsvImportType,
  headers: string[],
  requiredHeaders: string[],
  rows: string[][],
) {
  const issues: CsvPreviewIssue[] = [];

  rows.forEach((row, index) => {
    const mappedRow = toMappedRow(headers, requiredHeaders, row);
    const messages = importType === 'members' ? validateMembersRow(mappedRow) : validateLoanRow(mappedRow);

    if (messages.length > 0) {
      issues.push({
        row_number: index + 2,
        messages,
      });
    }
  });

  return issues;
}

export function buildCsvPreview(csvText: string, importType: CsvImportType, fileName: string) : CsvPreviewSummary {
  const { headers, rows } = parseCsv(csvText);
  const requiredHeaders = getRequiredHeaders(importType);
  const matchedHeaders = requiredHeaders
    .map((header) => {
      if (header === 'คำนำหน้าชื่อ' || header === 'ชื่อ' || header === 'สกุล') {
        return findMatchingHeader(headers, header) ?? findMatchingAlias(headers, FULL_NAME_ALIASES) ?? undefined;
      }

      return findMatchingHeader(headers, header);
    })
    .filter((header): header is string => Boolean(header));
  const missingHeaders = getMissingHeaders(importType, headers, requiredHeaders);
  const issues = missingHeaders.length === 0 ? validateRows(importType, headers, requiredHeaders, rows) : [];

  const sampleRows = rows.slice(0, 5).map((row) => toMappedRow(headers, requiredHeaders, row));

  return {
    file_name: fileName,
    required_headers: requiredHeaders,
    headers,
    matched_headers: matchedHeaders,
    missing_headers: missingHeaders,
    row_count: rows.length,
    sample_rows: sampleRows,
    issues,
    invalid_row_count: issues.length,
    is_ready: missingHeaders.length === 0 && rows.length > 0 && issues.length === 0,
  };
}