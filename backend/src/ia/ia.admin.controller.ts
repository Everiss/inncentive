import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IaConfig } from './ia.config';
import { IaPromptService, PromptType } from './ia-prompt.service';
import { IaTask } from './ia.types';

@Controller('ia/admin')
export class IaAdminController {
  constructor(
    private readonly iaConfig: IaConfig,
    private readonly promptService: IaPromptService,
  ) {}

  // ── Task Configs ────────────────────────────────────────────────────────────

  /** Lista todas as configurações de tarefas IA */
  @Get('task-configs')
  listTaskConfigs() {
    return this.iaConfig.listAll();
  }

  /** Atualiza configuração de uma tarefa (model, provider, maxTokens, etc.) */
  @Patch('task-configs/:task')
  updateTaskConfig(
    @Param('task') task: IaTask,
    @Body() body: {
      provider?: string;
      model?: string;
      maxTokens?: number;
      temperature?: number | null;
      extendedThinking?: boolean;
      thinkingBudget?: number | null;
      isActive?: boolean;
    },
    @Query('updatedBy') updatedBy?: string,
  ) {
    return this.iaConfig.update(task, body, updatedBy ? Number(updatedBy) : undefined);
  }

  // ── Prompts ─────────────────────────────────────────────────────────────────

  /** Lista versões de um prompt */
  @Get('prompts/:task/:type')
  listPromptVersions(
    @Param('task') task: IaTask,
    @Param('type') type: PromptType,
  ) {
    return this.promptService.listVersions(task, type);
  }

  /** Cria nova versão de prompt (ativa automaticamente) */
  @Post('prompts/:task/:type')
  createPromptVersion(
    @Param('task') task: IaTask,
    @Param('type') type: PromptType,
    @Body() body: { content: string; notes?: string },
    @Query('createdBy') createdBy?: string,
  ) {
    return this.promptService.createVersion(
      task, type, body.content, body.notes,
      createdBy ? Number(createdBy) : undefined,
    );
  }

  /** Reverte para a versão anterior do prompt */
  @Post('prompts/:task/:type/rollback')
  rollbackPrompt(
    @Param('task') task: IaTask,
    @Param('type') type: PromptType,
  ) {
    return this.promptService.rollback(task, type);
  }

  /** Invalida o cache manualmente (força releitura do banco) */
  @Post('cache/invalidate')
  invalidateCache(@Query('task') task?: IaTask) {
    this.iaConfig.invalidateCache(task);
    this.promptService.invalidateCache(task);
    return { message: task ? `Cache invalidado para tarefa [${task}]` : 'Cache global invalidado' };
  }
}
