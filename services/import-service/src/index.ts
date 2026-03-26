import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import xlsx from 'xlsx';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = Number(process.env.IMPORT_SERVICE_PORT || 8040);
const dbUrl =
  process.env.IMPORT_SERVICE_DATABASE_URL ||
  'mysql://import_svc:ImportSvc%232026%21@localhost:3306/new_tax_imports';
const uploadRoot = path.resolve(
  process.env.IMPORT_UPLOAD_ROOT || path.join(process.cwd(), '..', '..', 'upload', 'imports'),
);

fs.mkdirSync(uploadRoot, { recursive: true });

const pool = mysql.createPool(dbUrl);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));

function parseIntQuery(
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number },
): number {
  const min = options?.min ?? Number.MIN_SAFE_INTEGER;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function detectFileType(filename: string): 'CSV' | 'XLS' | 'XLSX' {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') return 'CSV';
  if (ext === '.xls') return 'XLS';
  return 'XLSX';
}

function normalizeRowByTemplate(row: Record<string, unknown>, columnMap: Record<string, string>) {
  const normalized: Record<string, unknown> = {};
  for (const [sourceColumn, targetField] of Object.entries(columnMap)) {
    normalized[targetField] = row[sourceColumn] ?? null;
  }
  return normalized;
}

function parseColumnMap(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw as Record<string, string>;
}

async function appendEvent(batchId: string, eventType: string, payload: unknown) {
  await pool.execute(
    `INSERT INTO import_events (id, batch_id, event_type, payload, event_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [uuidv4(), batchId, eventType, JSON.stringify(payload ?? {})],
  );
}

async function processRowsForBatch(input: {
  batchId: string;
  fileBuffer: Buffer;
  template: any;
}) {
  const { batchId, fileBuffer, template } = input;

  let workbook: xlsx.WorkBook;
  try {
    workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  } catch (error: any) {
    await pool.execute(
      `UPDATE import_batches SET status='ERROR', finished_at=NOW(), updated_at=NOW() WHERE id=?`,
      [batchId],
    );
    await appendEvent(batchId, 'PARSE_ERROR', { message: error.message });
    throw new Error(`Falha ao ler arquivo: ${error.message}`);
  }

  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    range: Number(template.header_row || 0),
  });

  const columnMap = parseColumnMap(template.column_map);
  let successRows = 0;
  let errorRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const original = rows[i] || {};
    const normalized = normalizeRowByTemplate(original, columnMap);
    const hasAnyValue = Object.values(normalized).some((v) => v !== null && v !== '');
    const rowStatus = hasAnyValue ? 'SUCCESS' : 'ERROR';
    const errorMessage = hasAnyValue ? null : 'Linha vazia apos mapeamento do template';

    if (rowStatus === 'SUCCESS') successRows++;
    else errorRows++;

    await pool.execute(
      `INSERT INTO import_rows (id, batch_id, row_index, payload_json, status, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), batchId, i + 1, JSON.stringify(normalized), rowStatus, errorMessage],
    );
  }

  await pool.execute(
    `UPDATE import_batches
     SET status='COMPLETED',
         total_rows=?,
         processed_rows=?,
         success_rows=?,
         error_rows=?,
         finished_at=NOW(),
         updated_at=NOW()
     WHERE id=?`,
    [rows.length, rows.length, successRows, errorRows, batchId],
  );

  await appendEvent(batchId, 'BATCH_COMPLETED', {
    totalRows: rows.length,
    successRows,
    errorRows,
  });

  return { totalRows: rows.length, successRows, errorRows };
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'import-service' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/templates', async (_req, res) => {
  const [rows] = await pool.query(`SELECT * FROM import_templates WHERE is_active=1 ORDER BY created_at DESC`);
  res.json(rows);
});

app.post('/templates', async (req, res) => {
  const {
    code,
    name,
    entityType,
    fileType,
    headerRow = 0,
    columnMap = {},
    isActive = true,
  } = req.body || {};

  if (!code || !name || !entityType || !fileType) {
    return res.status(400).json({ message: 'code, name, entityType e fileType sao obrigatorios' });
  }

  const id = uuidv4();

  await pool.execute(
    `INSERT INTO import_templates (id, code, name, entity_type, file_type, header_row, column_map, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, code, name, entityType, String(fileType).toUpperCase(), Number(headerRow), JSON.stringify(columnMap), isActive ? 1 : 0],
  );

  res.status(201).json({ id, code, name, entityType, fileType: String(fileType).toUpperCase() });
});

app.post('/imports/upload', upload.single('file'), async (req, res) => {
  const templateCode = String(req.query.templateCode || '').trim();
  const file = req.file;

  if (!templateCode) return res.status(400).json({ message: 'templateCode e obrigatorio na query' });
  if (!file) return res.status(400).json({ message: 'arquivo e obrigatorio' });

  const [templateRows] = await pool.execute<any[]>(
    `SELECT * FROM import_templates WHERE code=? AND is_active=1 LIMIT 1`,
    [templateCode],
  );
  if (!templateRows.length) return res.status(404).json({ message: `Template nao encontrado: ${templateCode}` });

  const template = templateRows[0];
  const fileType = detectFileType(file.originalname);
  const expectedType = String(template.file_type || '').toUpperCase();
  const fileTypeMismatchBypassed = Boolean(
    expectedType && expectedType !== 'ANY' && expectedType !== fileType,
  );

  const dateFolder = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(uploadRoot, templateCode, dateFolder);
  fs.mkdirSync(targetDir, { recursive: true });

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageName = `${Date.now()}-${safeName}`;
  const storagePath = path.join(targetDir, storageName);
  fs.writeFileSync(storagePath, file.buffer);

  const batchId = uuidv4();

  await pool.execute(
    `INSERT INTO import_batches (
      id, template_id, source_filename, storage_path, status,
      total_rows, processed_rows, success_rows, error_rows, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'PROCESSING', 0, 0, 0, 0, NOW(), NOW(), NOW())`,
    [batchId, template.id, file.originalname, storagePath],
  );

  await appendEvent(batchId, 'UPLOAD_RECEIVED', {
    templateCode,
    sourceFilename: file.originalname,
    storagePath,
    size: file.size,
    expectedType,
    receivedType: fileType,
    fileTypeMismatchBypassed,
  });

  let totals: { totalRows: number; successRows: number; errorRows: number };
  try {
    totals = await processRowsForBatch({
      batchId,
      fileBuffer: file.buffer,
      template,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message, batchId });
  }

  res.status(201).json({
    success: true,
    batchId,
    templateCode,
    totalRows: totals.totalRows,
    successRows: totals.successRows,
    errorRows: totals.errorRows,
  });
});

app.get('/imports/batches', async (req, res) => {
  const limit = parseIntQuery(req.query.limit, 200, { min: 1, max: 1000 });
  const offset = parseIntQuery(req.query.offset, 0, { min: 0 });
  const entityType = String(req.query.entityType || '').trim();

  const filters: string[] = [];
  const params: any[] = [];
  if (entityType) {
    filters.push('t.entity_type = ?');
    params.push(entityType);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT b.*, t.code AS template_code, t.entity_type AS entity_type,
            b.source_filename AS file_name
     FROM import_batches b
     INNER JOIN import_templates t ON t.id = b.template_id
     ${whereSql}
     ORDER BY b.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json(rows);
});

app.get('/imports/batches/:id', async (req, res) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT b.*, t.code AS template_code, t.entity_type AS entity_type,
            b.source_filename AS file_name
     FROM import_batches b
     INNER JOIN import_templates t ON t.id = b.template_id
     WHERE b.id=?
     LIMIT 1`,
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ message: 'Batch nao encontrado' });
  res.json(rows[0]);
});

app.get('/imports/batches/:id/rows', async (req, res) => {
  const limit = parseIntQuery(req.query.limit, 5000, { min: 1, max: 5000 });
  const offset = parseIntQuery(req.query.offset, 0, { min: 0 });
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM import_rows WHERE batch_id=? ORDER BY row_index ASC LIMIT ${limit} OFFSET ${offset}`,
    [req.params.id],
  );
  res.json(rows);
});

app.post('/imports/batches/:id/reprocess', async (req, res) => {
  const batchId = req.params.id;
  const [batchRows] = await pool.execute<any[]>(
    `SELECT * FROM import_batches WHERE id=? LIMIT 1`,
    [batchId],
  );
  if (!batchRows.length) return res.status(404).json({ message: 'Batch nao encontrado' });
  const batch = batchRows[0];

  const [templateRows] = await pool.execute<any[]>(
    `SELECT * FROM import_templates WHERE id=? LIMIT 1`,
    [batch.template_id],
  );
  if (!templateRows.length) return res.status(400).json({ message: 'Template do batch nao encontrado' });
  const template = templateRows[0];

  if (!fs.existsSync(batch.storage_path)) {
    return res.status(404).json({ message: 'Arquivo fisico do batch nao encontrado para reprocessamento' });
  }

  await pool.execute(
    `UPDATE import_batches
     SET status='PROCESSING', total_rows=0, processed_rows=0, success_rows=0, error_rows=0,
         started_at=NOW(), finished_at=NULL, updated_at=NOW()
     WHERE id=?`,
    [batchId],
  );
  await pool.execute(`DELETE FROM import_rows WHERE batch_id=?`, [batchId]);
  await appendEvent(batchId, 'BATCH_REPROCESS_REQUESTED', { requestedAt: new Date().toISOString() });

  let totals: { totalRows: number; successRows: number; errorRows: number };
  try {
    const fileBuffer = fs.readFileSync(batch.storage_path);
    totals = await processRowsForBatch({ batchId, fileBuffer, template });
  } catch (error: any) {
    await appendEvent(batchId, 'BATCH_REPROCESS_FAILED', { message: error.message });
    return res.status(400).json({ message: error.message, batchId });
  }

  await appendEvent(batchId, 'BATCH_REPROCESSED', totals);
  res.json({ success: true, batchId, ...totals });
});

app.delete('/imports/batches/:id', async (req, res) => {
  const batchId = req.params.id;
  const [batchRows] = await pool.execute<any[]>(`SELECT * FROM import_batches WHERE id=? LIMIT 1`, [batchId]);
  if (!batchRows.length) return res.status(404).json({ message: 'Batch nao encontrado' });
  const batch = batchRows[0];

  await appendEvent(batchId, 'BATCH_DELETED', { deletedAt: new Date().toISOString() });
  await pool.execute(`DELETE FROM import_events WHERE batch_id=?`, [batchId]);
  await pool.execute(`DELETE FROM import_rows WHERE batch_id=?`, [batchId]);
  await pool.execute(`DELETE FROM import_batches WHERE id=?`, [batchId]);

  res.json({
    success: true,
    batchId,
    fileDeleted: batch.storage_path ? fs.existsSync(batch.storage_path) : false,
  });
});

app.get('/imports/batches/:id/trace', async (req, res) => {
  const batchId = req.params.id;
  const [batchRows] = await pool.execute<any[]>(
    `SELECT b.*, t.entity_type, t.code AS template_code
     FROM import_batches b
     INNER JOIN import_templates t ON t.id=b.template_id
     WHERE b.id=? LIMIT 1`,
    [batchId],
  );
  if (!batchRows.length) return res.status(404).json({ message: 'Batch nao encontrado' });

  const [events] = await pool.execute<any[]>(
    `SELECT id, event_type, event_at, payload
     FROM import_events
     WHERE batch_id=?
     ORDER BY event_at ASC`,
    [batchId],
  );

  const normalizedEvents = events.map((e) => ({
    id: e.id,
    event_type: e.event_type,
    event_at: e.event_at,
    event_payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : (e.payload ?? {}),
    file_job_id: null,
    intake_id: null,
  }));

  res.json({
    batch: batchRows[0],
    intakes: [],
    jobs: [],
    events: normalizedEvents,
  });
});

app.get('/imports/file-jobs/:id/trace', async (req, res) => {
  res.status(404).json({
    message: 'File job trace indisponivel neste servico. Consulte via backend bridge + file-hub.',
    fileJobId: req.params.id,
  });
});

app.listen(port, () => {
  console.log(`INFO: [import-service] listening on :${port}`);
});
