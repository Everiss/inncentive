import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, ChevronDown, ChevronRight, ChevronLeft,
  ZoomIn, ZoomOut, Loader2, Building2, FileText,
  Users, DollarSign, Layers, ClipboardList, AlertCircle,
  CheckCircle2, LayoutGrid,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// ─── types ──────────────────────────────────────────────────────────────────

interface Block {
  block_no: number;
  text: string;
  bbox: [number, number, number, number]; // scaled pixels
}

interface PageData {
  page: number;
  page_count: number;
  width: number;
  height: number;
  image_b64: string;
  blocks: Block[];
}

interface FieldNode {
  id: string;
  label: string;
  value?: string | null;
  color: string;        // tailwind bg class for badge
  hexColor: string;     // canvas rect color
  children?: FieldNode[];
  matchedBlock?: Block;
  page?: number;        // page where this field lives (0-based)
}

interface Props {
  batchId: number;
  formData: any;
  fileName: string;
  onClose: () => void;
}

// ─── color palette (per section) ────────────────────────────────────────────

const COLORS = {
  company:    { bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200',   hex: '#3b82f6' },
  registry:   { bg: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200', hex: '#6366f1' },
  receipt:    { bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200',  hex: '#f59e0b' },
  ident:      { bg: 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200',    hex: '#14b8a6' },
  proj:       ['#8b5cf6','#ec4899','#10b981','#f97316','#06b6d4','#84cc16'],
  hr:         { bg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300', hex: '#a855f7' },
  expense:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200', hex: '#10b981' },
  equipment:  { bg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200', hex: '#f97316' },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function normText(s?: string | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBestBlock(value: string | null | undefined, blocks: Block[]): Block | undefined {
  if (!value) return undefined;
  const nv = normText(value);
  if (!nv || nv.length < 3) return undefined;
  // Try full match first, then partial
  for (const b of blocks) {
    if (normText(b.text).includes(nv)) return b;
  }
  // Partial: match at least 60% of words
  const words = nv.split(' ').filter(w => w.length > 3);
  if (!words.length) return undefined;
  let best: Block | undefined;
  let bestHits = 0;
  for (const b of blocks) {
    const nb = normText(b.text);
    const hits = words.filter(w => nb.includes(w)).length;
    if (hits > bestHits && hits >= Math.ceil(words.length * 0.6)) {
      bestHits = hits;
      best = b;
    }
  }
  return best;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number')
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

// ─── build field tree from form_data ─────────────────────────────────────────

function buildTree(formData: any, blocks: Block[]): FieldNode[] {
  const nodes: FieldNode[] = [];

  // Company Info
  const ci = formData?.company_info;
  if (ci) {
    nodes.push({
      id: 'company_info',
      label: 'Empresa',
      color: COLORS.company.bg,
      hexColor: COLORS.company.hex,
      children: [
        { id: 'ci.cnpj', label: 'CNPJ', value: ci.cnpj, color: COLORS.company.bg, hexColor: COLORS.company.hex, matchedBlock: findBestBlock(ci.cnpj, blocks) },
        { id: 'ci.name', label: 'Razão Social', value: ci.legal_name, color: COLORS.company.bg, hexColor: COLORS.company.hex, matchedBlock: findBestBlock(ci.legal_name, blocks) },
      ],
    });
  }

  // Company Registry
  const cr = formData?.company_registry?.fields;
  if (cr && Object.keys(cr).length) {
    nodes.push({
      id: 'company_registry',
      label: 'Dados Cadastrais',
      color: COLORS.registry.bg,
      hexColor: COLORS.registry.hex,
      children: Object.entries(cr).slice(0, 10).map(([k, v]) => ({
        id: `cr.${k}`,
        label: k.replace(/_/g, ' '),
        value: fmt(v),
        color: COLORS.registry.bg,
        hexColor: COLORS.registry.hex,
        matchedBlock: findBestBlock(String(v ?? ''), blocks),
      })),
    });
  }

  // Submission Receipt
  const sr = formData?.submission_receipt;
  if (sr) {
    nodes.push({
      id: 'receipt',
      label: 'Recibo de Entrega',
      color: COLORS.receipt.bg,
      hexColor: COLORS.receipt.hex,
      children: [
        { id: 'sr.sender', label: 'Remetente', value: sr.sender_name, color: COLORS.receipt.bg, hexColor: COLORS.receipt.hex, matchedBlock: findBestBlock(sr.sender_name, blocks) },
        { id: 'sr.cpf', label: 'CPF', value: sr.sender_cpf, color: COLORS.receipt.bg, hexColor: COLORS.receipt.hex, matchedBlock: findBestBlock(sr.sender_cpf, blocks) },
        { id: 'sr.expedition', label: 'Expedição', value: sr.expedition_at, color: COLORS.receipt.bg, hexColor: COLORS.receipt.hex, matchedBlock: findBestBlock(sr.expedition_at, blocks) },
        { id: 'sr.auth', label: 'Autenticidade', value: sr.authenticity_code, color: COLORS.receipt.bg, hexColor: COLORS.receipt.hex, matchedBlock: findBestBlock(sr.authenticity_code, blocks) },
      ].filter(n => n.value),
    });
  }

  // Company Identification
  const id_ = formData?.company_identification;
  if (id_) {
    const children: FieldNode[] = [];
    const fields: Record<string, string> = {
      company_type: 'Tipo de Empresa',
      company_status: 'Situação',
      rnd_organizational_structure: 'Estrutura Organizacional',
      shareholder_type: 'Tipo de Sócio',
    };
    for (const [k, label] of Object.entries(fields)) {
      if (id_[k]) {
        children.push({ id: `ident.${k}`, label, value: id_[k], color: COLORS.ident.bg, hexColor: COLORS.ident.hex, matchedBlock: findBestBlock(id_[k], blocks) });
      }
    }
    if (children.length) {
      nodes.push({ id: 'ident', label: 'Identificação', color: COLORS.ident.bg, hexColor: COLORS.ident.hex, children });
    }
  }

  // Projects
  const projects: any[] = formData?.projects ?? [];
  projects.forEach((proj: any, pi: number) => {
    const hex = COLORS.proj[pi % COLORS.proj.length];
    const bg = 'bg-slate-100 dark:bg-slate-700/40 text-slate-800 dark:text-slate-200';
    const projChildren: FieldNode[] = [
      { id: `proj${pi}.title`, label: 'Título', value: proj.title, color: bg, hexColor: hex, matchedBlock: findBestBlock(proj.title, blocks) },
      { id: `proj${pi}.cat`, label: 'Categoria', value: proj.category, color: bg, hexColor: hex, matchedBlock: findBestBlock(proj.category, blocks) },
      { id: `proj${pi}.nature`, label: 'Natureza', value: proj.nature, color: bg, hexColor: hex },
      { id: `proj${pi}.trl`, label: 'TRL', value: proj.trl_initial != null ? `${proj.trl_initial}→${proj.trl_final ?? proj.trl_initial}` : null, color: bg, hexColor: hex },
    ].filter(n => n.value);

    // HR
    const hr: any[] = proj.human_resources ?? [];
    if (hr.length) {
      projChildren.push({
        id: `proj${pi}.hr`,
        label: `Recursos Humanos (${hr.length})`,
        color: COLORS.hr.bg,
        hexColor: COLORS.hr.hex,
        children: hr.slice(0, 6).map((h: any, hi: number) => ({
          id: `proj${pi}.hr${hi}`,
          label: h.name ?? `Colaborador ${hi + 1}`,
          value: h.role ?? h.qualification,
          color: COLORS.hr.bg,
          hexColor: COLORS.hr.hex,
          matchedBlock: findBestBlock(h.name, blocks),
        })),
      });
    }

    // Expenses / Third-party
    const exp: any[] = proj.expenses ?? [];
    if (exp.length) {
      projChildren.push({
        id: `proj${pi}.exp`,
        label: `Despesas / Fornecedores (${exp.length})`,
        color: COLORS.expense.bg,
        hexColor: COLORS.expense.hex,
        children: exp.map((e: any, ei: number) => ({
          id: `proj${pi}.exp${ei}`,
          label: e.supplier_name ?? e.category ?? `Despesa ${ei + 1}`,
          value: e.supplier_cnpj_raw
            ? `${e.supplier_cnpj_raw} — R$ ${(e.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            : `R$ ${(e.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          color: COLORS.expense.bg,
          hexColor: COLORS.expense.hex,
          matchedBlock: findBestBlock(e.supplier_name ?? e.supplier_cnpj_raw, blocks),
        })),
      });
    }

    // Equipment
    const eq: any[] = proj.equipment ?? [];
    if (eq.length) {
      projChildren.push({
        id: `proj${pi}.eq`,
        label: `Equipamentos (${eq.length})`,
        color: COLORS.equipment.bg,
        hexColor: COLORS.equipment.hex,
        children: eq.map((e: any, ei: number) => ({
          id: `proj${pi}.eq${ei}`,
          label: e.description ?? `Equipamento ${ei + 1}`,
          value: `R$ ${(e.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          color: COLORS.equipment.bg,
          hexColor: COLORS.equipment.hex,
          matchedBlock: findBestBlock(e.description, blocks),
        })),
      });
    }

    nodes.push({
      id: `proj${pi}`,
      label: `Projeto ${pi + 1}`,
      color: bg,
      hexColor: hex,
      children: projChildren,
    });
  });

  return nodes;
}

// ─── FieldTree node ──────────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  activeId,
  onActivate,
}: {
  node: FieldNode;
  depth: number;
  activeId: string | null;
  onActivate: (node: FieldNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isActive = activeId === node.id;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setOpen(o => !o);
          onActivate(node);
        }}
        className={`w-full flex items-start gap-1.5 px-2 py-1 rounded-lg text-left transition-colors text-xs group
          ${isActive ? 'bg-slate-200 dark:bg-slate-600' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span className="mt-0.5 shrink-0 text-slate-400">
          {hasChildren
            ? open
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            : <span className="w-3 h-3 inline-block" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{node.label}</span>
          {node.value && (
            <span className="ml-1.5 text-slate-500 dark:text-slate-400 truncate">{node.value}</span>
          )}
        </span>
        {node.matchedBlock && (
          <span
            className="shrink-0 w-2 h-2 rounded-full mt-1"
            style={{ backgroundColor: node.hexColor }}
            title="Campo localizado no documento"
          />
        )}
      </button>

      {hasChildren && open && (
        <div>
          {node.children!.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Canvas overlay renderer ─────────────────────────────────────────────────

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  blocks: Block[],
  activeNode: FieldNode | null,
  allNodes: FieldNode[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Collect all leaf nodes that have a matched block on this page
  function collectLeaves(nodes: FieldNode[]): FieldNode[] {
    const result: FieldNode[] = [];
    for (const n of nodes) {
      if (n.matchedBlock) result.push(n);
      if (n.children) result.push(...collectLeaves(n.children));
    }
    return result;
  }

  const leaves = collectLeaves(allNodes);

  // Draw all matched blocks with subtle fill
  for (const leaf of leaves) {
    if (!leaf.matchedBlock) continue;
    const [x0, y0, x1, y1] = leaf.matchedBlock.bbox;
    const isActive = activeNode?.id === leaf.id || activeNode?.matchedBlock === leaf.matchedBlock;
    ctx.save();
    ctx.fillStyle = leaf.hexColor + (isActive ? '55' : '22');
    ctx.strokeStyle = leaf.hexColor + (isActive ? 'ff' : '88');
    ctx.lineWidth = isActive ? 2.5 : 1;
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Active node: bold highlight + label
  if (activeNode?.matchedBlock) {
    const [x0, y0, x1, y1] = activeNode.matchedBlock.bbox;
    ctx.save();
    ctx.strokeStyle = activeNode.hexColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = activeNode.hexColor;
    ctx.shadowBlur = 8;
    rrect(ctx, x0 - 2, y0 - 2, (x1 - x0) + 4, (y1 - y0) + 4, 4);
    ctx.stroke();

    // Label tag
    ctx.shadowBlur = 0;
    const tag = activeNode.label;
    ctx.font = 'bold 11px system-ui';
    const tw = ctx.measureText(tag).width + 10;
    const tx = Math.min(x0, canvas.width - tw - 4);
    const ty = y0 - 20;
    ctx.fillStyle = activeNode.hexColor;
    rrect(ctx, tx, ty > 0 ? ty : y1 + 4, tw, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(tag, tx + 5, (ty > 0 ? ty : y1 + 4) + 13);
    ctx.restore();
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function StructureCheckPanel({ batchId, formData, fileName, onClose }: Props) {
  const [meta, setMeta] = useState<{ page_count: number; pages: { page: number; width: number; height: number }[] } | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [activeNode, setActiveNode] = useState<FieldNode | null>(null);
  const [tree, setTree] = useState<FieldNode[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Fetch page count on mount
  useEffect(() => {
    setLoadingMeta(true);
    fetch(`${API}/imports/formpd/batches/${batchId}/inspect/meta`)
      .then(r => r.json())
      .then(d => { setMeta(d); setLoadingMeta(false); })
      .catch(() => setLoadingMeta(false));
  }, [batchId]);

  // Fetch page image + blocks
  const loadPage = useCallback((page: number) => {
    setLoadingPage(true);
    setPageData(null);
    fetch(`${API}/imports/formpd/batches/${batchId}/inspect/page/${page}?scale=1.5`)
      .then(r => r.json())
      .then((d: PageData) => {
        setPageData(d);
        setLoadingPage(false);
        // Rebuild tree with new blocks
        setTree(buildTree(formData, d.blocks));
      })
      .catch(() => setLoadingPage(false));
  }, [batchId, formData]);

  // Load first page when meta arrives
  useEffect(() => {
    if (meta) loadPage(currentPage);
  }, [meta]); // eslint-disable-line

  // Navigate page
  const goToPage = (p: number) => {
    if (!meta || p < 0 || p >= meta.page_count) return;
    setCurrentPage(p);
    loadPage(p);
    setActiveNode(null);
    setActiveId(null);
  };

  // Redraw canvas whenever pageData, activeNode, or tree changes
  useEffect(() => {
    if (!canvasRef.current || !pageData) return;
    canvasRef.current.width = pageData.width;
    canvasRef.current.height = pageData.height;
    drawOverlay(canvasRef.current, pageData.blocks, activeNode, tree);
  }, [pageData, activeNode, tree]);

  // Handle node activation
  const handleActivate = (node: FieldNode) => {
    setActiveNode(node);
    setActiveId(node.id);
    // If the node has a matched block on a different page, we could navigate –
    // for now, highlight on current page only
  };

  // Count matched fields
  function countMatches(nodes: FieldNode[]): number {
    let c = 0;
    for (const n of nodes) {
      if (n.matchedBlock) c++;
      if (n.children) c += countMatches(n.children);
    }
    return c;
  }
  function countLeaves(nodes: FieldNode[]): number {
    let c = 0;
    for (const n of nodes) {
      if (!n.children?.length) c++;
      else c += countLeaves(n.children);
    }
    return c;
  }
  const matched = countMatches(tree);
  const total = countLeaves(tree);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <LayoutGrid className="w-5 h-5 text-blue-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">Structure Check</p>
          <p className="text-xs text-slate-400 truncate">{fileName}</p>
        </div>
        {/* Match stats */}
        {total > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">
              <span className="text-emerald-400 font-bold">{matched}</span>/{total} campos localizados
            </span>
          </div>
        )}
        <button
          onClick={onClose}
          className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Left: page viewer ───────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 bg-slate-950">
          {/* Page nav bar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border-b border-slate-700 shrink-0">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0 || loadingPage}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-300 min-w-[80px] text-center">
              {loadingMeta ? '…' : `Pág. ${currentPage + 1} / ${meta?.page_count ?? '?'}`}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!meta || currentPage >= meta.page_count - 1 || loadingPage}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex-1" />

            {/* Quick-jump to page input */}
            <input
              type="number"
              min={1}
              max={meta?.page_count ?? 1}
              value={currentPage + 1}
              onChange={e => {
                const v = Number(e.target.value) - 1;
                if (Number.isFinite(v)) goToPage(v);
              }}
              className="w-16 px-2 py-1 rounded-md bg-slate-700 text-slate-200 text-xs text-center border border-slate-600 focus:outline-none focus:border-blue-500"
            />

            {loadingPage && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
          </div>

          {/* Page canvas */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            {loadingMeta || (loadingPage && !pageData) ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-sm">Carregando documento…</p>
              </div>
            ) : pageData ? (
              <div className="relative inline-block shadow-2xl rounded overflow-hidden">
                <img
                  ref={imgRef}
                  src={`data:image/png;base64,${pageData.image_b64}`}
                  alt={`Página ${currentPage + 1}`}
                  className="block select-none"
                  style={{ maxWidth: '100%' }}
                  draggable={false}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-20 text-slate-500">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm">Falha ao carregar página</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: field tree (grafo reconstruído) ──────────────────────── */}
        <div className="w-80 flex flex-col bg-slate-800 border-l border-slate-700 shrink-0">
          <div className="px-4 py-3 border-b border-slate-700 shrink-0">
            <p className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
              Grafo Extraído
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Clique em um campo para localizar no documento
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-700 shrink-0">
            {[
              { label: 'Empresa', hex: COLORS.company.hex },
              { label: 'Cadastro', hex: COLORS.registry.hex },
              { label: 'Recibo', hex: COLORS.receipt.hex },
              { label: 'Projetos', hex: COLORS.proj[0] },
              { label: 'RH', hex: COLORS.hr.hex },
              { label: 'Despesas', hex: COLORS.expense.hex },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.hex }} />
                {l.label}
              </span>
            ))}
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-2 px-1">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p className="text-xs">Construindo grafo…</p>
              </div>
            ) : (
              tree.map(node => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  activeId={activeId}
                  onActivate={handleActivate}
                />
              ))
            )}
          </div>

          {/* Active field info */}
          {activeNode && (
            <div
              className="shrink-0 mx-3 mb-3 p-3 rounded-xl border text-xs"
              style={{ borderColor: activeNode.hexColor + '66', backgroundColor: activeNode.hexColor + '18' }}
            >
              <p className="font-bold text-slate-200 mb-0.5">{activeNode.label}</p>
              {activeNode.value && (
                <p className="text-slate-400 break-words">{activeNode.value}</p>
              )}
              {activeNode.matchedBlock ? (
                <p className="mt-1.5 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Localizado na pág. {currentPage + 1}
                </p>
              ) : (
                <p className="mt-1.5 text-slate-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Não encontrado nesta página
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
