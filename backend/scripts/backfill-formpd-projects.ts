import { PrismaClient } from '@prisma/client';

type JsonAny = Record<string, any>;

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const get = (prefix: string) => {
    const item = args.find((a) => a.startsWith(prefix));
    return item ? item.slice(prefix.length) : undefined;
  };
  return {
    apply: has('--apply'),
    limit: Number(get('--limit=') || 0) || 0,
    batchId: Number(get('--batch-id=') || 0) || 0,
  };
}

function safeJsonParse<T = any>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseBrCurrency(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const only = text.replace(/[^\d,.-]/g, '');
  if (!only) return null;
  const normalized = only.includes(',') ? only.replace(/\./g, '').replace(',', '.') : only;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseLooseInt(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function parseLooseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t) return null;
  if (['sim', 'yes', 'true', '1'].includes(t)) return true;
  if (['nao', 'não', 'no', 'false', '0'].includes(t)) return false;
  return null;
}

function parseDateLoose(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;

  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const yearOnly = text.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    const dt = new Date(Date.UTC(y, 0, 1));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

function parsePbPaOrDe(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).toUpperCase();
  if (t.includes('PESQUISA_BASICA') || /\bPB\b/.test(t)) return 1;
  if (t.includes('PESQUISA_APLICADA') || /\bPA\b/.test(t)) return 2;
  if (t.includes('DESENVOLVIMENTO_EXPERIMENTAL') || /\bDE\b/.test(t)) return 3;
  return null;
}

function mapExpenseCategory(raw: unknown):
  | 'SERVICO_APOIO_PF'
  | 'SERVICO_APOIO_PJ'
  | 'MATERIAL_CONSUMO'
  | 'TIB'
  | 'DESPESA_OPERACIONAL' {
  const t = String(raw ?? '').toLowerCase();
  if (t.includes('material')) return 'MATERIAL_CONSUMO';
  if (t.includes('tecnologia industrial') || t.includes('tib')) return 'TIB';
  if (t.includes('pessoa jur') || t.includes('terceiros contratad')) return 'SERVICO_APOIO_PJ';
  if (t.includes('apoio tecnico') || t.includes('servico de apoio')) return 'SERVICO_APOIO_PF';
  return 'DESPESA_OPERACIONAL';
}

async function main() {
  const { apply, limit, batchId } = parseArgs();

  const where: any = {
    entity_type: 'FORMPD_AI_EXTRACTION',
    status: 'APPROVED',
  };
  if (batchId > 0) where.id = batchId;

  const batches = await prisma.import_batches.findMany({
    where,
    orderBy: [{ id: 'desc' }],
    ...(limit > 0 ? { take: limit } : {}),
  });

  let scanned = 0;
  let matchedForms = 0;
  let updatedForms = 0;
  let skipped = 0;

  console.log(`[backfill] mode=${apply ? 'APPLY' : 'DRY-RUN'} batches=${batches.length}`);

  for (const batch of batches) {
    scanned += 1;
    const item = await prisma.import_items.findFirst({ where: { batch_id: batch.id }, orderBy: { id: 'asc' } });
    if (!item) {
      skipped += 1;
      continue;
    }

    const parsed = safeJsonParse<JsonAny>(item.record_data, {});
    const formData = parsed.form_data || parsed;
    const projects = Array.isArray(formData.projects) ? formData.projects : [];
    const fiscalYear = Number(formData.fiscal_year || parsed.fiscal_year || 0) || null;
    const companyId = batch.company_id ?? parsed.company_id ?? null;

    if (!companyId || !fiscalYear) {
      skipped += 1;
      continue;
    }

    const form = await prisma.formpd_forms.findFirst({ where: { company_id: companyId, base_year: fiscalYear }, orderBy: { id: 'desc' } });
    if (!form) {
      skipped += 1;
      continue;
    }
    matchedForms += 1;

    if (!apply) {
      console.log(`[dry-run] batch=${batch.id} form=${form.id} projects=${projects.length}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.formpd_projects.deleteMany({ where: { form_id: form.id } });

      for (const p of projects) {
        const title = String(p?.title || 'Projeto sem titulo').trim() || 'Projeto sem titulo';
        const description = String(p?.description || 'Descricao nao informada').trim() || 'Descricao nao informada';

        const createdProject = await tx.formpd_projects.create({
          data: {
            form_id: form.id,
            title,
            description,
            category: p?.category ? String(p.category) : null,
            item_number: parseLooseInt(p?.item_number),
            is_continuous: parseLooseBool(p?.is_continuous) ?? false,
            start_date: parseDateLoose(p?.start_date),
            end_date: parseDateLoose(p?.end_date),
            tech_area_code: p?.tech_area_code ? String(p.tech_area_code).slice(0, 10) : null,
            tech_area_label: p?.tech_area_label ? String(p.tech_area_label).slice(0, 200) : null,
            knowledge_area: p?.knowledge_area ? String(p.knowledge_area).slice(0, 255) : null,
            specific_area: p?.specific_area ? String(p.specific_area).slice(0, 500) : null,
            keywords_1: p?.keywords_1 ? String(p.keywords_1) : null,
            keywords_2: p?.keywords_2 ? String(p.keywords_2) : null,
            keywords_3: p?.keywords_3 ? String(p.keywords_3) : null,
            keywords_4: p?.keywords_4 ? String(p.keywords_4) : null,
            keywords_5: p?.keywords_5 ? String(p.keywords_5) : null,
            innovative_element: p?.innovative_element ? String(p.innovative_element) : null,
            innovative_challenge: p?.innovative_challenge ? String(p.innovative_challenge) : null,
            methodology: p?.methodology ? String(p.methodology) : null,
            additional_info: p?.additional_info ? String(p.additional_info) : null,
            economic_result_obtained: p?.economic_result_obtained ? String(p.economic_result_obtained) : null,
            innovation_result_obtained: p?.innovation_result_obtained ? String(p.innovation_result_obtained) : null,
            trl_initial: parseLooseInt(p?.trl_initial),
            trl_final: parseLooseInt(p?.trl_final),
            pb_pa_or_de: parsePbPaOrDe(p?.pb_pa_or_de ?? p?.category),
            aligns_public_policy: parseLooseBool(p?.aligns_public_policy),
            public_policy_ref: p?.public_policy_ref ? String(p.public_policy_ref).slice(0, 500) : null,
            extraction_source: 'DETERMINISTIC',
            project_status: 'RASCUNHO',
          },
        });

        const hrs = Array.isArray(p?.human_resources) ? p.human_resources : [];
        if (hrs.length) {
          await tx.formpd_project_human_resources.createMany({
            data: hrs
              .map((hr: any) => ({
                project_id: createdProject.id,
                name: String(hr?.name || '').trim(),
                cpf: hr?.cpf ? String(hr.cpf).replace(/\D/g, '').slice(0, 14) : null,
                role: hr?.role ? String(hr.role).slice(0, 255) : null,
                dedication_pct: parseBrCurrency(hr?.dedication_pct),
                is_exclusive_researcher: String(hr?.dedication_type || '').toLowerCase().includes('exclus'),
                annual_amount: parseBrCurrency(hr?.annual_amount),
              }))
              .filter((hr) => hr.name.length > 0),
          });
        }

        const expenses = Array.isArray(p?.expenses) ? p.expenses : [];
        if (expenses.length) {
          await tx.formpd_project_expenses.createMany({
            data: expenses
              .map((exp: any) => ({
                project_id: createdProject.id,
                expense_category: mapExpenseCategory(exp?.category),
                description: exp?.description ? String(exp.description).slice(0, 500) : (exp?.category ? String(exp.category).slice(0, 500) : null),
                amount: parseBrCurrency(exp?.amount) ?? 0,
              }))
              .filter((exp) => (exp.amount ?? 0) > 0),
          });
        }

        const equipment = Array.isArray(p?.equipment) ? p.equipment : [];
        if (equipment.length) {
          await tx.formpd_project_equipment.createMany({
            data: equipment
              .map((eq: any) => ({
                project_id: createdProject.id,
                origin: String(eq?.origin || '').toUpperCase() === 'IMPORTADO' ? 'IMPORTADO' : 'NACIONAL',
                description: String(eq?.description || eq?.category || 'Equipamento').slice(0, 500),
                quantity: parseLooseInt(eq?.quantity) ?? 1,
                unit_amount: parseBrCurrency(eq?.amount) ?? 0,
                total_amount: parseBrCurrency(eq?.amount) ?? 0,
              }))
              .filter((eq) => (eq.total_amount ?? 0) > 0),
          });
        }
      }
    });

    updatedForms += 1;
    console.log(`[apply] batch=${batch.id} form=${form.id} projects=${projects.length}`);
  }

  console.log(`[done] scanned=${scanned} matchedForms=${matchedForms} updatedForms=${updatedForms} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error('[backfill] error', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
