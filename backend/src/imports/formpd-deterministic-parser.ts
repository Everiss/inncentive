/**
 * FormpdDeterministicParser
 *
 * Extracts fixed, well-structured fields from a FORMP&D PDF text using
 * regex/heuristics — without calling the AI.
 *
 * Purpose:
 *  1. Fast CNPJ / fiscal-year extraction for early validation (reject wrong files
 *     before spending AI credits).
 *  2. Pre-populates known fields so the AI prompt can skip them and focus on
 *     complex, variable sections (project descriptions, expenses, HR).
 *
 * Field confidence:
 *  "HIGH"  — CNPJ and fiscal_year were found with high reliability.
 *  "LOW"   — one or both core fields are missing; AI should validate everything.
 */

export interface DetRepresentative {
  name: string;
  cpf: string | null;
  profile_type: 'REPRESENTANTE_CORPORATIVO' | 'RESPONSAVEL_PREENCHIMENTO';
}

export interface DetProjectSummary {
  item: number;
  title: string;
  total_amount: number | null;
}

export interface DeterministicFormpdData {
  cnpj: string | null;
  legal_name: string | null;
  fiscal_year: number | null;
  fiscal_loss: boolean | null;
  fiscal_loss_amount: number | null;
  total_rnd_expenditure: number | null;
  total_incentives: number | null;
  projects: DetProjectSummary[];
  representatives: DetRepresentative[];
  /** HIGH if both CNPJ and fiscal_year were extracted reliably. */
  confidence: 'HIGH' | 'LOW';
}

// ── Money helpers ────────────────────────────────────────────────────────────

/** Parses "R$ 1.234.567,89" → 1234567.89 */
function parseBRL(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// ── CNPJ ────────────────────────────────────────────────────────────────────

function extractCnpj(text: string): string | null {
  // Formatted: 12.345.678/0001-90
  const fmtMatch = text.match(/CNPJ[:\s]+(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})/i);
  if (fmtMatch) {
    return fmtMatch[1].replace(/\D/g, '').padStart(14, '0');
  }
  // Raw 14 digits on a CNPJ label line
  const rawMatch = text.match(/CNPJ[:\s]+(\d{14})/i);
  if (rawMatch) return rawMatch[1];
  return null;
}

// ── Fiscal year ──────────────────────────────────────────────────────────────

function extractFiscalYear(text: string): number | null {
  // "ANO BASE 2024" / "Ano-base 2024" / "ANO-BASE: 2024"
  const m1 = text.match(/ANO[\s-]BASE[:\s]+(\d{4})/i);
  if (m1) return parseInt(m1[1], 10);

  // "Ano-calendário: 2024" / "Ano de referência 2025 com dados do Ano-base 2024"
  const m2 = text.match(/Ano[\s-]calend[aá]rio[:\s]+(\d{4})/i);
  if (m2) return parseInt(m2[1], 10);

  // "dados do Ano-base 2024"
  const m3 = text.match(/dados do Ano[\s-]base\s+(\d{4})/i);
  if (m3) return parseInt(m3[1], 10);

  // Fallback: "EXERCÍCIO FISCAL: 2024"
  const m4 = text.match(/EXERC[IÍ]CIO\s+FISCAL[:\s]+(\d{4})/i);
  if (m4) return parseInt(m4[1], 10);

  return null;
}

// ── Company name ─────────────────────────────────────────────────────────────

function extractLegalName(text: string): string | null {
  const m = text.match(/RAZ[AÃ]O\s+SOCIAL[:\s]+([^\n\r]+)/i);
  if (m) return m[1].trim();
  return null;
}

// ── Fiscal loss ──────────────────────────────────────────────────────────────

function extractFiscalLoss(text: string): { loss: boolean | null; amount: number | null } {
  // "A EMPRESA FECHOU O ANO-BASE COM PREJUÍZO FISCAL? Não"
  const m = text.match(/PREJU[IÍ]ZO\s+FISCAL[?:\s]+([A-ZÃÃo]+)/i);
  if (!m) return { loss: null, amount: null };
  const val = m[1].trim().toLowerCase();
  const loss = val.startsWith('sim') ? true : val.startsWith('n') ? false : null;

  let amount: number | null = null;
  if (loss) {
    const amtMatch = text.match(/PREJU[IÍ]ZO\s+FISCAL[^R\n]*R\$\s*([\d.,]+)/i);
    if (amtMatch) amount = parseBRL(amtMatch[1]);
  }
  return { loss, amount };
}

// ── Project summary table ────────────────────────────────────────────────────

function extractProjectSummary(text: string): DetProjectSummary[] {
  // Primary strategy: use "ITEM/TÍTULO DO PROJETO DE PD&I: N. TITLE" headers.
  // These appear once per project with full title and are reliable across formats.
  const detailHeaders = [
    ...text.matchAll(/ITEM\/T[IÍ]TULO\s+DO\s+PROJETO[^:]*:\s*(\d+)\.\s*([^\n\r]+)/gi),
  ];

  if (detailHeaders.length > 0) {
    return detailHeaders.map((m) => ({
      item: parseInt(m[1], 10),
      title: m[2].trim(),
      total_amount: null, // per-project total extracted from summary table below
    }));
  }

  // Fallback: parse the summary table lines.
  // Multi-line titles are common (pdf-parse wraps long lines), so we collect
  // pending item lines and flush when the R$ value appears.
  const tableStart = text.search(/Item\s+Nome\s+Atividade|PROGRAMA\/ATIVIDADE\s+DE\s+PD&I/i);
  if (tableStart === -1) return [];

  const tableSection = text.slice(tableStart, tableStart + 3000);
  const lines = tableSection.split(/\n/);
  const projects: DetProjectSummary[] = [];
  let pendingItem: number | null = null;
  let pendingTitle = '';

  for (const line of lines) {
    if (/^\s*Total\s+R\$/i.test(line) && projects.length > 0) break;

    // Line starts with item number — begin accumulating title
    const startM = line.match(/^\s*(\d+)\s+(.+)/);
    if (startM && !line.includes('R$')) {
      pendingItem = parseInt(startM[1], 10);
      pendingTitle = startM[2].trim();
      continue;
    }

    // Line contains R$ value — either continuation of pending item or standalone
    if (line.includes('R$') && pendingItem !== null) {
      const valueM = line.match(/R\$\s*([\d.,]+)/);
      const amount = valueM ? parseBRL(valueM[1]) : null;
      // Title: pendingTitle + optional prefix from this line before R$
      const linePrefix = line.replace(/R\$.*$/, '').trim();
      // Strip trailing keyword token (one word, no spaces)
      let fullTitle = pendingTitle + (linePrefix ? ' ' + linePrefix : '');
      const kwStrip = fullTitle.match(/^(.+?)\s+\S+$/);
      if (kwStrip) fullTitle = kwStrip[1].trim();
      projects.push({ item: pendingItem, title: fullTitle, total_amount: amount });
      pendingItem = null;
      pendingTitle = '';
    }
  }

  return projects;
}

// ── Totals ───────────────────────────────────────────────────────────────────

function extractTotals(text: string): { rnd: number | null; incentives: number | null } {
  // "Total R$ 11.834.558,47" — standalone total line after the project summary table.
  // Use [ \t]* (not \s*) so we don't cross a newline and grab an item number.
  // We look for "Total R$" NOT preceded by "Valor" (to skip the column header).
  const rndMatch = text.match(/(?<!Valor\s)\bTotal\s+R\$[ \t]*([\d.,]+)/i);
  const rnd = rndMatch ? parseBRL(rndMatch[1]) : null;

  // "TOTAL DOS INCENTIVOS: R$ 9.467.646,77"
  const incMatch = text.match(/TOTAL\s+DOS\s+INCENTIVOS[:\s]+R\$[ \t]*([\d.,]+)/i);
  const incentives = incMatch ? parseBRL(incMatch[1]) : null;

  return { rnd, incentives };
}

// ── Representatives ──────────────────────────────────────────────────────────

function extractRepresentatives(text: string): DetRepresentative[] {
  const reps: DetRepresentative[] = [];

  // "DADOS DO REMETENTE" block → RESPONSAVEL_PREENCHIMENTO
  const remetente = text.match(/DADOS\s+DO\s+REMETENTE[\s\S]{0,20}\nNOME[:\s]+([^\n\r]+)[\s\S]{0,50}\nCPF[:\s]+(\d+)/i);
  if (remetente) {
    reps.push({
      name: remetente[1].trim(),
      cpf: remetente[2].replace(/\D/g, ''),
      profile_type: 'RESPONSAVEL_PREENCHIMENTO',
    });
  }

  // "RESPONSÁVEL LEGAL" / "REPRESENTANTE LEGAL" block → REPRESENTANTE_CORPORATIVO
  const repLegal = text.match(/REPRESENTANTE\s+LEGAL[:\s]+([^\n\r]+)[\s\S]{0,200}CPF[:\s]+(\d[\d.\s-]+\d)/i);
  if (repLegal) {
    reps.push({
      name: repLegal[1].trim(),
      cpf: repLegal[2].replace(/\D/g, ''),
      profile_type: 'REPRESENTANTE_CORPORATIVO',
    });
  }

  return reps;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseFormpdDeterministic(text: string): DeterministicFormpdData {
  const cnpj = extractCnpj(text);
  const fiscal_year = extractFiscalYear(text);
  const legal_name = extractLegalName(text);
  const { loss: fiscal_loss, amount: fiscal_loss_amount } = extractFiscalLoss(text);
  const projects = extractProjectSummary(text);
  const { rnd: total_rnd_expenditure, incentives: total_incentives } = extractTotals(text);
  const representatives = extractRepresentatives(text);

  const confidence: 'HIGH' | 'LOW' = !!(cnpj && fiscal_year) ? 'HIGH' : 'LOW';

  return {
    cnpj,
    legal_name,
    fiscal_year,
    fiscal_loss,
    fiscal_loss_amount,
    total_rnd_expenditure,
    total_incentives,
    projects,
    representatives,
    confidence,
  };
}

/**
 * Builds an optional context hint to prepend to the AI prompt,
 * so the model can skip re-extracting fields already known.
 */
export function buildDeterministicContextHint(det: DeterministicFormpdData): string {
  if (det.confidence === 'LOW') return '';

  const lines: string[] = [
    '=== PRÉ-EXTRAÇÃO DETERMINÍSTICA ===',
    `CNPJ: ${det.cnpj}`,
    `Razão Social: ${det.legal_name ?? 'desconhecida'}`,
    `Ano-base: ${det.fiscal_year}`,
    `Prejuízo fiscal: ${det.fiscal_loss === null ? 'desconhecido' : det.fiscal_loss ? 'Sim' : 'Não'}`,
  ];

  if (det.total_rnd_expenditure !== null) {
    lines.push(`Total P&D: R$ ${det.total_rnd_expenditure.toFixed(2)}`);
  }

  if (det.projects.length > 0) {
    lines.push(`Projetos identificados (${det.projects.length}):`);
    for (const p of det.projects) {
      lines.push(`  ${p.item}. ${p.title}${p.total_amount ? ` — R$ ${p.total_amount.toFixed(2)}` : ''}`);
    }
  }

  lines.push('Use esses valores como referência. Foque em extrair os detalhes dos projetos (RH, despesas, equipamentos, parceiros, patentes).');
  lines.push('=== FIM DA PRÉ-EXTRAÇÃO ===');

  return lines.join('\n');
}
