import { useEffect, useState } from 'react';
import api from '../../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  X,
  Hash,
  Calendar,
  Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType =
  | 'ECF' | 'ECD' | 'DIRBI' | 'BALANCETE'
  | 'RELATORIO_LINHA_PESQUISA' | 'FOLHA_PAGAMENTO' | 'TIMESHEET'
  | 'NOTA_FISCAL' | 'CONTRATO' | 'LAUDO_TECNICO' | 'OUTRO';

interface ProgramDocument {
  id: number;
  doc_type: DocType;
  description: string | null;
  reference_year: number | null;
  reference_period: string | null;
  file_id: string | null;
  external_ref: string | null;
  notes: string | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<DocType, string> = {
  ECF: 'ECF',
  ECD: 'ECD',
  DIRBI: 'DIRBI',
  BALANCETE: 'Balancete',
  RELATORIO_LINHA_PESQUISA: 'Relatório de Linha de Pesquisa',
  FOLHA_PAGAMENTO: 'Folha de Pagamento',
  TIMESHEET: 'Timesheet / Controle de Horas',
  NOTA_FISCAL: 'Nota Fiscal',
  CONTRATO: 'Contrato',
  LAUDO_TECNICO: 'Laudo Técnico',
  OUTRO: 'Outro',
};

const DOC_COLORS: Partial<Record<DocType, string>> = {
  ECF: 'bg-blue-100 text-blue-700',
  ECD: 'bg-blue-100 text-blue-700',
  DIRBI: 'bg-teal-100 text-teal-700',
  BALANCETE: 'bg-violet-100 text-violet-700',
  RELATORIO_LINHA_PESQUISA: 'bg-indigo-100 text-indigo-700',
  FOLHA_PAGAMENTO: 'bg-green-100 text-green-700',
  TIMESHEET: 'bg-green-100 text-green-700',
  NOTA_FISCAL: 'bg-amber-100 text-amber-700',
  CONTRATO: 'bg-orange-100 text-orange-700',
  LAUDO_TECNICO: 'bg-rose-100 text-rose-700',
  OUTRO: 'bg-slate-100 text-slate-600',
};

const DOC_GROUPS: { label: string; types: DocType[] }[] = [
  { label: 'Fiscais / Obrigações', types: ['ECF', 'ECD', 'DIRBI'] },
  { label: 'Contábeis',            types: ['BALANCETE'] },
  { label: 'Técnicos',             types: ['RELATORIO_LINHA_PESQUISA', 'LAUDO_TECNICO', 'TIMESHEET'] },
  { label: 'Financeiros',          types: ['FOLHA_PAGAMENTO', 'NOTA_FISCAL', 'CONTRATO'] },
  { label: 'Outros',               types: ['OUTRO'] },
];

// ── Add Document Modal ────────────────────────────────────────────────────────

function AddDocModal({
  programId,
  onCreated,
  onClose,
}: {
  programId: number;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    docType: 'ECF' as DocType,
    description: '',
    referenceYear: new Date().getFullYear() - 1,
    referencePeriod: '',
    externalRef: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/programs/${programId}/documents`, {
        docType: form.docType,
        description: form.description || undefined,
        referenceYear: form.referenceYear || undefined,
        referencePeriod: form.referencePeriod || undefined,
        externalRef: form.externalRef || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Documento registrado');
      onCreated();
      onClose();
    } catch {
      toast.error('Erro ao registrar documento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Registrar Documento / Evidência</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Tipo de documento
            </label>
            <div className="space-y-2">
              {DOC_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.types.map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm((f) => ({ ...f, docType: t }))}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                          form.docType === t
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        }`}
                      >
                        {DOC_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Year + Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Ano de referência
              </label>
              <input
                type="number"
                value={form.referenceYear}
                onChange={(e) => setForm((f) => ({ ...f, referenceYear: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Período (ex: 2024-01)
              </label>
              <input
                type="text"
                value={form.referencePeriod}
                onChange={(e) => setForm((f) => ({ ...f, referencePeriod: e.target.value }))}
                placeholder="2024-01 ou 2024-Q1"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Descrição
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={`Ex: ${DOC_LABELS[form.docType]} ${form.referenceYear}`}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          {/* External ref */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Referência externa (protocolo, nº recibo)
            </label>
            <input
              type="text"
              value={form.externalRef}
              onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value }))}
              placeholder="Protocolo MCTI, nº SEFIN, etc."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Observações
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Informações adicionais sobre este documento..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function ProgramTabDocumentos({
  programId,
  onRefresh,
}: {
  programId: number;
  onRefresh: () => void;
}) {
  const [docs, setDocs] = useState<ProgramDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/programs/${programId}/documents`);
      setDocs(r.data);
    } catch {
      toast.error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [programId]);

  const remove = async (docId: number) => {
    setRemoving(docId);
    try {
      await api.delete(`/programs/${programId}/documents/${docId}`);
      toast.success('Documento removido');
      load();
      onRefresh();
    } catch {
      toast.error('Erro ao remover documento');
    } finally {
      setRemoving(null);
    }
  };

  // Group by doc_type
  const byType = new Map<DocType, ProgramDocument[]>();
  for (const d of docs) {
    if (!byType.has(d.doc_type)) byType.set(d.doc_type, []);
    byType.get(d.doc_type)!.push(d);
  }

  return (
    <>
      {showAdd && (
        <AddDocModal
          programId={programId}
          onCreated={() => { load(); onRefresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Documentos e Evidências</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{docs.length} documento(s) registrado(s)</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Registrar Documento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum documento registrado</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
            Registre as evidências do programa: ECF, ECD, DIRBI, balancete, relatórios técnicos, etc.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 mx-auto"
          >
            <Plus className="w-4 h-4" />
            Registrar primeiro documento
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byType.entries()).map(([type, items]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${DOC_COLORS[type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {DOC_LABELS[type]}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                <AnimatePresence>
                  {items.map((doc) => (
                    <motion.div
                      key={doc.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {doc.description || DOC_LABELS[doc.doc_type]}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-400 dark:text-slate-500">
                          {doc.reference_year && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{doc.reference_year}
                            </span>
                          )}
                          {doc.reference_period && <span>{doc.reference_period}</span>}
                          {doc.external_ref && (
                            <span className="flex items-center gap-1">
                              <Hash className="w-3 h-3" />{doc.external_ref}
                            </span>
                          )}
                          {doc.file_id && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Link2 className="w-3 h-3" />Arquivo
                            </span>
                          )}
                        </div>
                        {doc.notes && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{doc.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => remove(doc.id)}
                        disabled={removing === doc.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 dark:text-slate-600 hover:text-red-500 flex-shrink-0 disabled:opacity-50"
                      >
                        {removing === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
