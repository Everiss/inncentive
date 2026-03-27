import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type JsonAny = Record<string, any>;

function parseArgs() {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const get = (prefix: string) => {
    const item = args.find((a) => a.startsWith(prefix));
    return item ? item.slice(prefix.length) : undefined;
  };
  return {
    apply: has('--apply'),
    formId: Number(get('--form-id=') || 0) || 0,
    batchId: Number(get('--batch-id=') || 0) || 0,
    projectId: Number(get('--project-id=') || 0) || 0,
  };
}

function safeJsonParse<T = any>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(raw: string | null | undefined): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toAmountKey(raw: any): string {
  const num = Number(raw ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

type ExpenseRow = {
  id: number;
  project_id: number;
  description: string | null;
  amount: any;
};

function collectDuplicateIds(rows: ExpenseRow[]): { deleteIds: number[]; reasons: Map<number, string> } {
  const reasons = new Map<number, string>();
  const deleteIds = new Set<number>();

  // 1) Exact duplicate: same normalized description + same amount (keep smallest id).
  const byExact = new Map<string, ExpenseRow[]>();
  for (const r of rows) {
    const key = `${normalizeText(r.description)}|${toAmountKey(r.amount)}`;
    const arr = byExact.get(key) || [];
    arr.push(r);
    byExact.set(key, arr);
  }
  for (const arr of byExact.values()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => a.id - b.id);
    for (let i = 1; i < arr.length; i += 1) {
      deleteIds.add(arr[i].id);
      reasons.set(arr[i].id, 'exact_duplicate');
    }
  }

  // 2) Parent/child collapse by same amount:
  // if one description is contained in another (shorter generic parent), keep longer (leaf).
  const survivors = rows.filter((r) => !deleteIds.has(r.id));
  const byAmount = new Map<string, ExpenseRow[]>();
  for (const r of survivors) {
    const key = toAmountKey(r.amount);
    const arr = byAmount.get(key) || [];
    arr.push(r);
    byAmount.set(key, arr);
  }

  for (const arr of byAmount.values()) {
    if (arr.length <= 1) continue;
    for (let i = 0; i < arr.length; i += 1) {
      const a = arr[i];
      if (deleteIds.has(a.id)) continue;
      const an = normalizeText(a.description);
      if (!an) continue;
      for (let j = 0; j < arr.length; j += 1) {
        if (i === j) continue;
        const b = arr[j];
        if (deleteIds.has(b.id)) continue;
        const bn = normalizeText(b.description);
        if (!bn) continue;
        // Remove the shorter description when it's contained in the longer one.
        if (an.length < bn.length && bn.includes(an)) {
          deleteIds.add(a.id);
          reasons.set(a.id, 'hierarchy_parent_same_amount');
          break;
        }
      }
    }
  }

  return { deleteIds: Array.from(deleteIds), reasons };
}

async function resolveFormIdFromBatch(batchId: number): Promise<number | null> {
  const batch = await prisma.import_batches.findUnique({ where: { id: batchId } });
  if (!batch) return null;

  const item = await prisma.import_items.findFirst({
    where: { batch_id: batchId },
    orderBy: { id: 'asc' },
  });
  if (!item) return null;

  const parsed = safeJsonParse<JsonAny>(item.record_data, {});
  const formData = parsed.form_data || parsed;
  const fiscalYear = Number(formData.fiscal_year || parsed.fiscal_year || 0) || null;
  const companyId = batch.company_id ?? parsed.company_id ?? null;
  if (!companyId || !fiscalYear) return null;

  const form = await prisma.formpd_forms.findFirst({
    where: { company_id: companyId, base_year: fiscalYear },
    orderBy: { id: 'desc' },
  });
  return form?.id ?? null;
}

async function main() {
  const { apply, formId, batchId, projectId } = parseArgs();

  let targetFormId = formId;
  if (!targetFormId && batchId > 0) {
    const resolved = await resolveFormIdFromBatch(batchId);
    if (!resolved) {
      throw new Error(`Nao foi possivel resolver form_id para batch_id=${batchId}`);
    }
    targetFormId = resolved;
  }

  if (!targetFormId && !projectId) {
    throw new Error('Informe --form-id=<id> ou --batch-id=<id> ou --project-id=<id>');
  }

  const projects = await prisma.formpd_projects.findMany({
    where: projectId > 0 ? { id: projectId } : { form_id: targetFormId },
    select: { id: true, title: true, form_id: true },
    orderBy: { id: 'asc' },
  });

  if (!projects.length) {
    console.log('[fix-expenses] nenhum projeto encontrado para o filtro informado');
    return;
  }

  console.log(
    `[fix-expenses] mode=${apply ? 'APPLY' : 'DRY-RUN'} form_id=${targetFormId || 'n/a'} project_count=${projects.length}`,
  );

  let totalRows = 0;
  let totalDelete = 0;

  for (const p of projects) {
    const rows = await prisma.formpd_project_expenses.findMany({
      where: { project_id: p.id },
      select: { id: true, project_id: true, description: true, amount: true },
      orderBy: { id: 'asc' },
    });
    totalRows += rows.length;
    if (!rows.length) continue;

    const { deleteIds, reasons } = collectDuplicateIds(rows);
    if (!deleteIds.length) continue;

    totalDelete += deleteIds.length;
    console.log(
      `[fix-expenses] project=${p.id} "${p.title.slice(0, 80)}" rows=${rows.length} delete=${deleteIds.length}`,
    );

    for (const id of deleteIds) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      console.log(
        `  - delete expense_id=${id} amount=${toAmountKey(row.amount)} reason=${reasons.get(id)} desc="${row.description || ''}"`,
      );
    }

    if (apply) {
      await prisma.formpd_project_expenses.deleteMany({ where: { id: { in: deleteIds } } });
    }
  }

  console.log(
    `[fix-expenses] done scanned_rows=${totalRows} delete_candidates=${totalDelete} mode=${apply ? 'APPLY' : 'DRY-RUN'}`,
  );
}

main()
  .catch((err) => {
    console.error('[fix-expenses] error', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

