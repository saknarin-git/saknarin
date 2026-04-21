function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function fromDisplayYear(year: number) {
  return year >= 2400 ? year - 543 : year;
}

function toBuddhistYear(year: number) {
  return year + 543;
}

function formatDateParts(day: number, month: number, year: number) {
  return `${pad2(day)}/${pad2(month)}/${toBuddhistYear(year)}`;
}

function isValidDate(day: number, month: number, year: number) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function formatDateOnly(value: string | null) {
  if (!value) {
    return '-';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '-';
  }

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return `${isoDateMatch[3]}/${isoDateMatch[2]}/${toBuddhistYear(Number(isoDateMatch[1]))}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  return formatDateParts(date.getDate(), date.getMonth() + 1, date.getFullYear());
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '-';
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return formatDateOnly(trimmed);
  }

  return `${formatDateParts(date.getDate(), date.getMonth() + 1, date.getFullYear())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseDisplayDate(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const displayDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (displayDateMatch) {
    const day = Number(displayDateMatch[1]);
    const month = Number(displayDateMatch[2]);
    const year = fromDisplayYear(Number(displayDateMatch[3]));

    if (!isValidDate(day, month, year)) {
      return null;
    }

    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);

    if (!isValidDate(day, month, year)) {
      return null;
    }

    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}