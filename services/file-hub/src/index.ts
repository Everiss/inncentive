import { createHash } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config();

const port = Number(process.env.FILE_HUB_PORT || 8030);
const dbUrl =
  process.env.FILE_HUB_DATABASE_URL ||
  'mysql://file_hub_svc:FileHubSvc%232026%21@localhost:3306/new_tax_fileserver';
const fileServerRoot = path.resolve(process.env.FILESERVER_ROOT || path.join(process.cwd(), 'upload'));

const pool = mysql.createPool(dbUrl);
const app = express();
app.use(express.json({ limit: '10mb' }));

type Nullable<T> = T | null;

function now() {
  return new Date();
}

function resolveInsideRoot(relativePath: string): string {
  const cleaned = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(fileServerRoot, cleaned);
  if (!resolved.startsWith(fileServerRoot)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

async function appendEvent(input: {
  fileId: string;
  intakeId?: Nullable<string>;
  fileJobId?: Nullable<string>;
  eventType: string;
  payload?: Record<string, unknown>;
  actorContactId?: Nullable<number>;
}) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO file_events (id, file_id, intake_id, file_job_id, event_type, event_payload, actor_contact_id, event_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.fileId,
        input.intakeId ?? null,
        input.fileJobId ?? null,
        input.eventType,
        JSON.stringify(input.payload ?? {}),
        input.actorContactId ?? null,
      ],
    );
  } finally {
    conn.release();
  }
}

app.get('/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', service: 'file-hub', db: rows, fileServerRoot });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/hash', (req, res) => {
  const { contentBase64 } = req.body || {};
  if (!contentBase64 || typeof contentBase64 !== 'string') {
    return res.status(400).json({ message: 'contentBase64 is required' });
  }
  const hash = createHash('sha256').update(Buffer.from(contentBase64, 'base64')).digest('hex');
  return res.json({ hash });
});

app.post('/fs/directories/ensure', (req, res) => {
  try {
    const { relativePath = '' } = req.body || {};
    const target = resolveInsideRoot(String(relativePath));
    fs.mkdirSync(target, { recursive: true });
    return res.json({ ok: true, absolutePath: target });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/fs/directories/list', (req, res) => {
  try {
    const relativePath = String(req.query.relativePath || '');
    const target = resolveInsideRoot(relativePath);
    if (!fs.existsSync(target)) return res.json({ items: [] });

    const items = fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      relativePath: path.relative(fileServerRoot, path.join(target, entry.name)).replace(/\\/g, '/'),
    }));

    return res.json({ items });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

app.post('/fs/files/move', (req, res) => {
  try {
    const { fromRelativePath, toRelativePath } = req.body || {};
    if (!fromRelativePath || !toRelativePath) {
      return res.status(400).json({ message: 'fromRelativePath and toRelativePath are required' });
    }

    const fromPath = resolveInsideRoot(String(fromRelativePath));
    const toPath = resolveInsideRoot(String(toRelativePath));

    const toDir = path.dirname(toPath);
    fs.mkdirSync(toDir, { recursive: true });
    fs.renameSync(fromPath, toPath);

    return res.json({ ok: true, fromPath, toPath });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/files/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, sha256, mime_type, original_name, size_bytes, storage_key, created_at
       FROM files WHERE id=? LIMIT 1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ message: 'File not found' });
    return res.json(rows[0]);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/intakes/latest', async (req, res) => {
  const fileId = String(req.query.fileId || '').trim();
  const sourceRef = req.query.sourceRef !== undefined ? String(req.query.sourceRef) : undefined;
  if (!fileId) return res.status(400).json({ message: 'fileId is required' });

  try {
    let sql = `SELECT id, file_id, source_ref FROM file_intakes WHERE file_id=?`;
    const params: any[] = [fileId];
    if (sourceRef !== undefined) {
      sql += ` AND (source_ref = ? OR source_ref IS NULL)`;
      params.push(sourceRef);
    }
    sql += ` ORDER BY id DESC LIMIT 1`;
    const [rows] = await pool.execute<any[]>(sql, params);
    return res.json(rows[0] ?? null);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.patch('/intakes/:id/mark-dedup-done', async (req, res) => {
  try {
    await pool.execute(
      `UPDATE file_intakes SET intake_status='DONE', dedup_hit=1, finished_at=? WHERE id=?`,
      [now(), req.params.id],
    );
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/jobs/latest', async (req, res) => {
  const intakeId = String(req.query.intakeId || '').trim();
  const jobType = req.query.jobType ? String(req.query.jobType) : undefined;
  if (!intakeId) return res.status(400).json({ message: 'intakeId is required' });

  try {
    let sql = `SELECT id FROM file_jobs WHERE intake_id=?`;
    const params: any[] = [intakeId];
    if (jobType) {
      sql += ` AND job_type=?`;
      params.push(jobType);
    }
    sql += ` ORDER BY created_at DESC LIMIT 1`;
    const [rows] = await pool.execute<any[]>(sql, params);
    return res.json(rows[0] ?? null);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/trace/files/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const sourceRef = req.query.sourceRef ? String(req.query.sourceRef) : null;

  try {
    const [fileRows] = await pool.execute<any[]>(
      `SELECT id, sha256, mime_type, original_name, size_bytes, storage_key, created_at
       FROM files WHERE id=? LIMIT 1`,
      [fileId],
    );
    if (!fileRows.length) return res.status(404).json({ message: 'File not found' });

    let intakeSql = `SELECT * FROM file_intakes WHERE file_id=?`;
    const intakeParams: any[] = [fileId];
    if (sourceRef) {
      intakeSql += ` AND (source_ref=? OR source_ref IS NULL)`;
      intakeParams.push(sourceRef);
    }
    intakeSql += ` ORDER BY received_at ASC`;
    const [intakes] = await pool.execute<any[]>(intakeSql, intakeParams);

    const intakeIds = intakes.map((i) => i.id);
    let jobs: any[] = [];
    if (intakeIds.length > 0) {
      const placeholders = intakeIds.map(() => '?').join(',');
      const [jobRows] = await pool.execute<any[]>(
        `SELECT * FROM file_jobs WHERE file_id=? AND (intake_id IN (${placeholders}) OR intake_id IS NULL) ORDER BY created_at ASC`,
        [fileId, ...intakeIds],
      );
      jobs = jobRows;
    } else {
      const [jobRows] = await pool.execute<any[]>(`SELECT * FROM file_jobs WHERE file_id=? ORDER BY created_at ASC`, [fileId]);
      jobs = jobRows;
    }

    const [events] = await pool.execute<any[]>(
      `SELECT * FROM file_events WHERE file_id=? ORDER BY event_at ASC LIMIT 1000`,
      [fileId],
    );

    return res.json({ file: fileRows[0], intakes, jobs, events });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/trace/file-jobs/:fileJobId', async (req, res) => {
  const fileJobId = req.params.fileJobId;

  try {
    const [jobRows] = await pool.execute<any[]>(
      `SELECT j.*, f.id as file_id_ref, f.sha256, f.mime_type, f.original_name, f.storage_key, f.created_at as file_created_at,
              i.id as intake_id_ref, i.source, i.source_ref, i.intake_status
       FROM file_jobs j
       LEFT JOIN files f ON f.id = j.file_id
       LEFT JOIN file_intakes i ON i.id = j.intake_id
       WHERE j.id=? LIMIT 1`,
      [fileJobId],
    );

    if (!jobRows.length) return res.status(404).json({ message: 'File job not found' });

    const [artifacts] = await pool.execute<any[]>(
      `SELECT * FROM file_artifacts WHERE file_job_id=? ORDER BY created_at ASC`,
      [fileJobId],
    );

    const [events] = await pool.execute<any[]>(
      `SELECT * FROM file_events WHERE file_job_id=? ORDER BY event_at ASC`,
      [fileJobId],
    );

    return res.json({ job: jobRows[0], artifacts, events });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/intakes/register-upload', async (req, res) => {
  const body = req.body || {};
  const sha256 = String(body.hash || '').trim();
  if (!sha256) return res.status(400).json({ message: 'hash is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const filePath: string = body.filePath;
    const originalName: Nullable<string> = body.originalName ?? null;
    const mimeType: Nullable<string> = body.mimeType ?? null;
    const sizeBytes: Nullable<number> = body.sizeBytes ?? null;
    const companyId: Nullable<number> = body.companyId ?? null;
    const receivedBy: Nullable<number> = body.receivedBy ?? null;
    const source: string = body.source ?? 'UPLOAD_UI';
    const sourceRef: Nullable<string> = body.sourceRef ?? null;
    const extension = originalName ? String(originalName).split('.').pop()?.toLowerCase() ?? null : null;

    const [existingRows] = await conn.execute<any[]>(`SELECT id, company_id FROM files WHERE sha256 = ? LIMIT 1`, [sha256]);

    let fileId: string;
    const dedupHit = existingRows.length > 0;

    if (dedupHit) {
      fileId = existingRows[0].id;
      await conn.execute(
        `UPDATE files
         SET company_id = COALESCE(company_id, ?),
             size_bytes = COALESCE(?, size_bytes),
             mime_type = COALESCE(?, mime_type),
             original_name = COALESCE(?, original_name),
             extension = COALESCE(?, extension),
             deleted_at = NULL
         WHERE id = ?`,
        [companyId, sizeBytes, mimeType, originalName, extension, fileId],
      );
    } else {
      await conn.execute(
        `INSERT INTO files (
          id, company_id, sha256, size_bytes, mime_type, original_name, extension,
          storage_backend, storage_key, storage_bucket, uploaded_by
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'LOCAL', ?, NULL, ?)`,
        [companyId, sha256, sizeBytes, mimeType, originalName, extension, filePath, receivedBy],
      );

      const [fileRows] = await conn.execute<any[]>(`SELECT id FROM files WHERE sha256 = ? LIMIT 1`, [sha256]);
      fileId = fileRows[0].id;
    }

    await conn.execute(
      `INSERT INTO file_intakes (id, file_id, source, source_ref, intake_status, dedup_hit, received_by)
       VALUES (UUID(), ?, ?, ?, 'RECEIVED', ?, ?)`,
      [fileId, source, sourceRef, dedupHit ? 1 : 0, receivedBy],
    );

    const [intakeRows] = await conn.execute<any[]>(`SELECT id FROM file_intakes WHERE file_id = ? ORDER BY id DESC LIMIT 1`, [fileId]);
    const intakeId = intakeRows[0].id;

    await conn.execute(
      `INSERT INTO file_events (id, file_id, intake_id, event_type, event_payload, actor_contact_id, event_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW())`,
      [
        fileId,
        intakeId,
        dedupHit ? 'FILE_REUSED' : 'FILE_REGISTERED',
        JSON.stringify({ source, sourceRef, sha256, storageKey: filePath }),
        receivedBy,
      ],
    );

    await conn.commit();
    return res.json({ fileId, intakeId, fileHash: sha256, dedupHit });
  } catch (error: any) {
    await conn.rollback();
    return res.status(500).json({ message: error.message });
  } finally {
    conn.release();
  }
});

app.post('/jobs/create-processing', async (req, res) => {
  const body = req.body || {};
  const fileId = String(body.fileId || '').trim();
  const jobType = String(body.jobType || '').trim();
  const processor = String(body.processor || '').trim();
  const processorVersion = String(body.processorVersion || 'v1').trim();
  const intakeId: Nullable<string> = body.intakeId ?? null;
  const priority = Number(body.priority ?? 5);
  const idempotencyKey: Nullable<string> = body.idempotencyKey ?? null;

  if (!fileId || !jobType || !processor) {
    return res.status(400).json({ message: 'fileId, jobType and processor are required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO file_jobs (
        id, file_id, intake_id, job_type, processor, processor_version,
        job_status, priority, attempt, progress_current, progress_total,
        started_at, finished_at, error_message, idempotency_key
      ) VALUES (
        UUID(), ?, ?, ?, ?, ?,
        'QUEUED', ?, 1, 0, 0,
        NULL, NULL, NULL, ?
      )
      ON DUPLICATE KEY UPDATE
        intake_id = VALUES(intake_id),
        job_status = 'QUEUED',
        priority = VALUES(priority),
        attempt = 1,
        progress_current = 0,
        progress_total = 0,
        started_at = NULL,
        finished_at = NULL,
        error_message = NULL,
        idempotency_key = VALUES(idempotency_key)`,
      [fileId, intakeId, jobType, processor, processorVersion, priority, idempotencyKey],
    );

    const [jobRows] = await conn.execute<any[]>(
      `SELECT id FROM file_jobs WHERE file_id = ? AND job_type = ? AND processor = ? AND processor_version = ? LIMIT 1`,
      [fileId, jobType, processor, processorVersion],
    );
    const fileJobId = jobRows[0].id;

    if (intakeId) {
      await conn.execute(`UPDATE file_intakes SET intake_status='QUEUED', queued_at=? WHERE id=?`, [now(), intakeId]);
    }

    await conn.execute(
      `INSERT INTO file_events (id, file_id, intake_id, file_job_id, event_type, event_payload, event_at)
       VALUES (UUID(), ?, ?, ?, 'JOB_QUEUED', ?, NOW())`,
      [fileId, intakeId, fileJobId, JSON.stringify({ jobType, processor, processorVersion, priority })],
    );

    await conn.commit();
    return res.json({ id: fileJobId });
  } catch (error: any) {
    await conn.rollback();
    return res.status(500).json({ message: error.message });
  } finally {
    conn.release();
  }
});

app.post('/jobs/:id/start', async (req, res) => {
  const fileJobId = req.params.id;
  const { fileId, intakeId } = req.body || {};
  if (!fileId) return res.status(400).json({ message: 'fileId is required' });

  try {
    await pool.execute(`UPDATE file_jobs SET job_status='PROCESSING', started_at=?, error_message=NULL WHERE id=?`, [now(), fileJobId]);
    if (intakeId) await pool.execute(`UPDATE file_intakes SET intake_status='PROCESSING', started_at=? WHERE id=?`, [now(), intakeId]);
    await appendEvent({ fileId, intakeId, fileJobId, eventType: 'JOB_STARTED' });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/jobs/:id/progress', async (req, res) => {
  const fileJobId = req.params.id;
  const { fileId, intakeId, current, total } = req.body || {};
  if (!fileId) return res.status(400).json({ message: 'fileId is required' });

  try {
    await pool.execute(`UPDATE file_jobs SET progress_current=?, progress_total=?, job_status='PROCESSING' WHERE id=?`, [Number(current || 0), Number(total || 0), fileJobId]);
    await appendEvent({ fileId, intakeId, fileJobId, eventType: 'JOB_PROGRESS', payload: { current, total } });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/jobs/:id/complete', async (req, res) => {
  const fileJobId = req.params.id;
  const { fileId, intakeId, payload } = req.body || {};
  if (!fileId) return res.status(400).json({ message: 'fileId is required' });

  try {
    await pool.execute(`UPDATE file_jobs SET job_status='DONE', finished_at=?, error_message=NULL WHERE id=?`, [now(), fileJobId]);
    if (intakeId) await pool.execute(`UPDATE file_intakes SET intake_status='DONE', finished_at=?, error_message=NULL WHERE id=?`, [now(), intakeId]);
    await appendEvent({ fileId, intakeId, fileJobId, eventType: 'JOB_COMPLETED', payload: payload || {} });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/jobs/:id/fail', async (req, res) => {
  const fileJobId = req.params.id;
  const { fileId, intakeId, errorMessage } = req.body || {};
  if (!fileId) return res.status(400).json({ message: 'fileId is required' });

  try {
    await pool.execute(`UPDATE file_jobs SET job_status='ERROR', finished_at=?, error_message=? WHERE id=?`, [now(), String(errorMessage || 'Unknown error'), fileJobId]);
    if (intakeId) {
      await pool.execute(`UPDATE file_intakes SET intake_status='ERROR', finished_at=?, error_message=? WHERE id=?`, [now(), String(errorMessage || 'Unknown error'), intakeId]);
    }
    await appendEvent({ fileId, intakeId, fileJobId, eventType: 'JOB_FAILED', payload: { errorMessage } });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/artifacts/upsert', async (req, res) => {
  const { fileJobId, artifactType, contentJson, artifactVersion } = req.body || {};
  if (!fileJobId || !artifactType) {
    return res.status(400).json({ message: 'fileJobId and artifactType are required' });
  }

  const version = Number(artifactVersion || 1);

  try {
    await pool.execute(
      `INSERT INTO file_artifacts (id, file_job_id, artifact_type, artifact_version, content_json)
       VALUES (UUID(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content_json=VALUES(content_json)`,
      [fileJobId, artifactType, version, JSON.stringify(contentJson ?? {})],
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT id, file_job_id, artifact_type, artifact_version FROM file_artifacts
       WHERE file_job_id=? AND artifact_type=? AND artifact_version=? LIMIT 1`,
      [fileJobId, artifactType, version],
    );

    return res.json(rows[0]);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`file-hub listening on :${port} (root=${fileServerRoot})`);
});
