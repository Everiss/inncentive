/**
 * Parses a ReceitaWS phone string into an array of clean phone numbers.
 *
 * ReceitaWS often returns multiple numbers separated by " / ", e.g.:
 *   "(11) 3333-4444 / (11) 9999-8888"
 *   "(51) 3123-9876 / (51) 99123-9876 / 0800 222 3333"
 *
 * Rules applied:
 *  - Split by "/"
 *  - Strip all non-digit characters
 *  - Skip numbers with fewer than 8 digits (noise/incomplete)
 *  - Truncate to 30 chars (db limit)
 *  - Deduplicate
 *
 * @returns Array of parsed phone objects with type inference.
 */
export function parseReceitaWSPhones(
  raw: string | null | undefined,
): { number: string; type: 'CELULAR' | 'FIXO' | 'WHATSAPP' | 'OUTRO'; isPrimary: boolean }[] {
  if (!raw || !raw.trim()) return [];

  const parts = raw.split('/').map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: ReturnType<typeof parseReceitaWSPhones> = [];

  parts.forEach((part, idx) => {
    const digits = part.replace(/\D/g, '').slice(0, 30);
    if (digits.length < 8 || seen.has(digits)) return;
    seen.add(digits);

    // Heuristic: Brazilian mobile numbers start with 9 and have 9 digits (local part)
    // Full format: 2 area code + 9 digits = 11 digits
    const isMobile = digits.length === 11 && digits[2] === '9';

    result.push({
      number: digits,
      type: isMobile ? 'CELULAR' : 'FIXO',
      isPrimary: idx === 0,
    });
  });

  return result;
}
