import { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import { X, RefreshCw, Clock3, Database, Workflow, FileJson, Download, Copy } from 'lucide-react';

interface Props {
  batch: { id: number; file_name: string; entity_type: string };
  onClose: () => void;
}

type TraceEvent = {
  id: string;
  event_type: string;
  event_at: string;
  event_payload?: Record<string, any> | null;
  file_job_id?: string | null;
  intake_id?: string | null;
};

export function ImportBatchTraceModal({ batch, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [jobDetails, setJobDetails] = useState<Record<string, any>>({});
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL');
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'1h' | '24h' | '7d' | 'all'>('all');

  const fetchTrace = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/imports/batches/${batch.id}/trace`);
      const trace = res.data;
      setData(trace);

      const jobIds: string[] = (trace?.jobs ?? []).map((j: any) => j.id).filter(Boolean);
      const uniqueJobIds = Array.from(new Set(jobIds)).slice(0, 10);
      const details = await Promise.all(
        uniqueJobIds.map(async (id) => {
          try {
            const r = await api.get(`/imports/file-jobs/${id}/trace`);
            return [id, r.data] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      const mapped: Record<string, any> = {};
      for (const [id, d] of details) mapped[id] = d;
      setJobDetails(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrace(false);
    const timer = setInterval(() => fetchTrace(true), 10000);
    return () => clearInterval(timer);
  }, [batch.id]);

  const timeline = useMemo(() => {
    const events = [...(data?.events ?? [])] as TraceEvent[];
    return events.sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
  }, [data]);

  const filteredTimeline = useMemo(() => {
    const jobsById: Record<string, any> = {};
    for (const job of data?.jobs ?? []) jobsById[job.id] = job;

    const now = Date.now();
    const periodLimit =
      periodFilter === '1h'
        ? now - 60 * 60 * 1000
        : periodFilter === '24h'
          ? now - 24 * 60 * 60 * 1000
          : periodFilter === '7d'
            ? now - 7 * 24 * 60 * 60 * 1000
            : 0;

    return timeline.filter((ev) => {
      if (eventTypeFilter !== 'ALL' && ev.event_type !== eventTypeFilter) return false;
      if (periodLimit > 0 && new Date(ev.event_at).getTime() < periodLimit) return false;

      if (jobStatusFilter !== 'ALL') {
        if (!ev.file_job_id) return false;
        const status = jobsById[ev.file_job_id]?.job_status ?? '';
        if (status !== jobStatusFilter) return false;
      }

      return true;
    });
  }, [timeline, data?.jobs, eventTypeFilter, jobStatusFilter, periodFilter]);

  const availableEventTypes = useMemo(() => {
    const values = Array.from(
      new Set<string>((data?.events ?? []).map((e: any) => String(e.event_type)).filter(Boolean)),
    );
    return values.sort();
  }, [data?.events]);

  const availableJobStatuses = useMemo(() => {
    const values = Array.from(
      new Set<string>((data?.jobs ?? []).map((j: any) => String(j.job_status)).filter(Boolean)),
    );
    return values.sort();
  }, [data?.jobs]);

  const formatEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'FILE_REGISTERED':
        return 'Arquivo registrado';
      case 'FILE_REUSED':
        return 'Arquivo reutilizado (dedup)';
      case 'JOB_QUEUED':
        return 'Job enfileirado';
      case 'JOB_STARTED':
        return 'Job iniciado';
      case 'JOB_PROGRESS':
        return 'Job em progresso';
      case 'JOB_COMPLETED':
        return 'Job concluído';
      case 'JOB_FAILED':
        return 'Job com falha';
      default:
        return eventType;
    }
  };

  const isErrorEvent = (ev: TraceEvent) => {
    if (ev.event_type === 'JOB_FAILED') return true;
    const payload = ev.event_payload ?? {};
    const msg = JSON.stringify(payload).toLowerCase();
    return msg.includes('error') || msg.includes('falha') || msg.includes('failed');
  };

  const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const payload = {
      batchId: batch.id,
      filters: {
        eventType: eventTypeFilter,
        jobStatus: jobStatusFilter,
        period: periodFilter,
      },
      generatedAt: new Date().toISOString(),
      events: filteredTimeline,
      intakes: data?.intakes ?? [],
      jobs: data?.jobs ?? [],
    };
    downloadTextFile(
      `batch-${batch.id}-trace.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const exportJsonFull = () => {
    const payload = {
      batchId: batch.id,
      filters: {
        eventType: 'ALL',
        jobStatus: 'ALL',
        period: 'all',
      },
      generatedAt: new Date().toISOString(),
      events: timeline,
      intakes: data?.intakes ?? [],
      jobs: data?.jobs ?? [],
    };
    downloadTextFile(
      `batch-${batch.id}-trace-full.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const copyJson = async () => {
    const payload = {
      batchId: batch.id,
      filters: {
        eventType: eventTypeFilter,
        jobStatus: jobStatusFilter,
        period: periodFilter,
      },
      generatedAt: new Date().toISOString(),
      events: filteredTimeline,
      intakes: data?.intakes ?? [],
      jobs: data?.jobs ?? [],
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for restricted clipboard environments
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const exportCsv = () => {
    const escapeCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'event_id',
      'event_type',
      'event_label',
      'event_at',
      'file_job_id',
      'intake_id',
      'is_error',
      'event_payload_json',
    ];
    const lines = filteredTimeline.map((ev) => [
      ev.id,
      ev.event_type,
      formatEventLabel(ev.event_type),
      ev.event_at,
      ev.file_job_id ?? '',
      ev.intake_id ?? '',
      isErrorEvent(ev) ? '1' : '0',
      ev.event_payload ? JSON.stringify(ev.event_payload) : '',
    ]);
    const csv = [header, ...lines].map((row) => row.map(escapeCsv).join(',')).join('\n');
    downloadTextFile(`batch-${batch.id}-trace.csv`, csv, 'text/csv;charset=utf-8');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/40 dark:bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-5xl border border-blue-100 dark:border-slate-800 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-5 border-b border-blue-50 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-blue-900 dark:text-slate-100">Timeline do Lote #{batch.id}</h3>
            <p className="text-sm text-slate-500">{batch.file_name} · {batch.entity_type}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportJson}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
                JSON
              </span>
            </button>
            <button
              onClick={exportJsonFull}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
                JSON Full
              </span>
            </button>
            <button
              onClick={exportCsv}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
                CSV
              </span>
            </button>
            <button
              onClick={copyJson}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-2">
                <Copy className="w-4 h-4" />
                Copiar JSON
              </span>
            </button>
            <button
              onClick={() => { setRefreshing(true); fetchTrace(true); }}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Atualizar
              </span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-slate-50/60 dark:bg-slate-800/30 border border-blue-50 dark:border-slate-800 rounded-xl p-4">
            <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Clock3 className="w-4 h-4 text-blue-500" /> Eventos
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="text-xs rounded-lg border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200"
              >
                <option value="ALL">Tipo: Todos</option>
                {availableEventTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={jobStatusFilter}
                onChange={(e) => setJobStatusFilter(e.target.value)}
                className="text-xs rounded-lg border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200"
              >
                <option value="ALL">Status Job: Todos</option>
                {availableJobStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as any)}
                className="text-xs rounded-lg border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200"
              >
                <option value="all">Período: Tudo</option>
                <option value="1h">Última 1h</option>
                <option value="24h">Últimas 24h</option>
                <option value="7d">Últimos 7 dias</option>
              </select>
            </div>
            {loading ? (
              <div className="text-sm text-slate-500">Carregando timeline...</div>
            ) : filteredTimeline.length === 0 ? (
              <div className="text-sm text-slate-500">Sem eventos para este lote.</div>
            ) : (
              <div className="space-y-3">
                {filteredTimeline.map((ev) => (
                  <div
                    key={ev.id}
                    className={`rounded-lg border p-3 ${
                      isErrorEvent(ev)
                        ? 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/20'
                        : 'border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-sm font-semibold ${isErrorEvent(ev) ? 'text-red-700 dark:text-red-300' : 'text-blue-900 dark:text-slate-100'}`}>
                        {formatEventLabel(ev.event_type)}
                      </p>
                      <p className="text-xs text-slate-500">{new Date(ev.event_at).toLocaleString('pt-BR')}</p>
                    </div>
                    {(ev.file_job_id || ev.intake_id) && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {ev.file_job_id ? `job: ${ev.file_job_id}` : ''} {ev.intake_id ? `intake: ${ev.intake_id}` : ''}
                      </p>
                    )}
                    {ev.event_payload && Object.keys(ev.event_payload).length > 0 && (
                      <pre className="mt-2 p-2 text-[11px] bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700 overflow-auto text-slate-700 dark:text-slate-300">
                        {JSON.stringify(ev.event_payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50/60 dark:bg-slate-800/30 border border-blue-50 dark:border-slate-800 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-blue-500" /> Intake
              </h4>
              <p className="text-xs text-slate-500">Registros: {data?.intakes?.length ?? 0}</p>
              {(data?.intakes ?? []).slice(0, 3).map((it: any) => (
                <div key={it.id} className="mt-2 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{it.intake_status}</p>
                  <p className="text-slate-500">{new Date(it.received_at).toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-50/60 dark:bg-slate-800/30 border border-blue-50 dark:border-slate-800 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                <Workflow className="w-4 h-4 text-blue-500" /> Jobs
              </h4>
              <p className="text-xs text-slate-500">Total: {data?.jobs?.length ?? 0}</p>
              {(data?.jobs ?? []).slice(0, 5).map((job: any) => (
                <div key={job.id} className="mt-2 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{job.job_type}</p>
                  <p className="text-slate-500">{job.job_status} · {job.progress_current}/{job.progress_total}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-50/60 dark:bg-slate-800/30 border border-blue-50 dark:border-slate-800 rounded-xl p-4">
              <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                <FileJson className="w-4 h-4 text-blue-500" /> Artifacts
              </h4>
              {Object.keys(jobDetails).length === 0 ? (
                <p className="text-xs text-slate-500">Sem artefatos carregados.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(jobDetails).map(([jobId, detail]) => {
                    const artifacts = detail?.artifacts ?? [];
                    return (
                      <div key={jobId} className="text-xs">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">job {jobId.slice(0, 8)}...</p>
                        <p className="text-slate-500">{artifacts.length} artefato(s)</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
