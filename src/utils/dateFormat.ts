function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateParts(year: number, month: number, day: number) {
  return `${pad2(day)}/${pad2(month)}/${year}`;
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
    return `${isoDateMatch[3]}/${isoDateMatch[2]}/${isoDateMatch[1]}`;
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