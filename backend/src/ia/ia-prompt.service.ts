import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IaTask } from './ia.types';

export type PromptType = 'SYSTEM' | 'TASK_INSTRUCTION';

interface PromptCacheEntry {
  content: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class IaPromptService implements OnModuleInit {
  private readonly logger = new Logger(IaPromptService.name);
  private readonly cache = new Map<string, PromptCacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Pré-aquece o cache na inicialização
    await this.warmUpCache();
  }

  async getPrompt(task: IaTask, type: PromptType): Promise<string | null> {
    const key = `${task}:${type}`;
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.content;
    }

    const prompt = await this.prisma.ia_prompts.findFirst({
      where: { task, prompt_type: type, is_active: true },
      orderBy: { version: 'desc' },
      select: { content: true },
    });

    if (prompt) {
      this.cache.set(key, { content: prompt.content, expiresAt: Date.now() + CACHE_TTL_MS });
      return prompt.content;
    }

    return null;
  }

  invalidateCache(task?: IaTask, type?: PromptType) {
    if (task && type) {
      this.cache.delete(`${task}:${type}`);
    } else if (task) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${task}:`)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }

  // ── Admin: CRUD de prompts ──────────────────────────────────────────────

  async listVersions(task: IaTask, type: PromptType) {
    return this.prisma.ia_prompts.findMany({
      where: { task, prompt_type: type },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, is_active: true, notes: true, created_at: true },
    });
  }

  async createVersion(task: IaTask, type: PromptType, content: string, notes?: string, createdBy?: number) {
    const latest = await this.prisma.ia_prompts.findFirst({
      where: { task, prompt_type: type },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = (latest?.version ?? 0) + 1;

    // Desativa a versão anterior
    await this.prisma.ia_prompts.updateMany({
      where: { task, prompt_type: type, is_active: true },
      data: { is_active: false },
    });

    const created = await this.prisma.ia_prompts.create({
      data: { task, prompt_type: type, content, version: nextVersion, is_active: true, notes, created_by: createdBy },
    });

    this.invalidateCache(task, type);
    this.logger.log(`Prompt [${task}/${type}] atualizado para v${nextVersion}`);
    return created;
  }

  async rollback(task: IaTask, type: PromptType) {
    const versions = await this.prisma.ia_prompts.findMany({
      where: { task, prompt_type: type },
      orderBy: { version: 'desc' },
      take: 2,
    });

    if (versions.length < 2) {
      throw new Error(`Não há versão anterior para [${task}/${type}]`);
    }

    await this.prisma.ia_prompts.update({ where: { id: versions[0].id }, data: { is_active: false } });
    await this.prisma.ia_prompts.update({ where: { id: versions[1].id }, data: { is_active: true } });

    this.invalidateCache(task, type);
    this.logger.log(`Prompt [${task}/${type}] revertido para v${versions[1].version}`);
    return versions[1];
  }

  // ── Privado ────────────────────────────────────────────────────────────────

  private async warmUpCache() {
    try {
      const prompts = await this.prisma.ia_prompts.findMany({
        where: { is_active: true },
        select: { task: true, prompt_type: true, content: true },
      });

      for (const p of prompts) {
        const key = `${p.task}:${p.prompt_type}`;
        this.cache.set(key, { content: p.content, expiresAt: Date.now() + CACHE_TTL_MS });
      }

      this.logger.log(`Cache de prompts aquecido: ${prompts.length} entradas`);
    } catch {
      this.logger.warn('Falha ao aquecer cache de prompts — banco pode estar indisponível');
    }
  }
}
