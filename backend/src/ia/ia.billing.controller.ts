import { Controller, Get, Query } from '@nestjs/common';
import { IaExecutionService } from './ia-execution.service';

@Controller('ia/billing')
export class IaBillingController {
  constructor(private readonly executionService: IaExecutionService) {}

  /**
   * Resumo de custo/tokens por tarefa e modelo no período.
   * GET /ia/billing/summary?from=2025-01-01&to=2025-12-31
   */
  @Get('summary')
  getSummary(@Query('from') from: string, @Query('to') to: string) {
    const fromDate = from ? new Date(from) : this.startOfMonth();
    const toDate   = to   ? new Date(to)   : new Date();
    return this.executionService.getSummary(fromDate, toDate);
  }

  /**
   * Custo agrupado por empresa no período.
   * GET /ia/billing/by-company?from=2025-01-01&to=2025-12-31
   */
  @Get('by-company')
  getByCompany(@Query('from') from: string, @Query('to') to: string) {
    const fromDate = from ? new Date(from) : this.startOfMonth();
    const toDate   = to   ? new Date(to)   : new Date();
    return this.executionService.getSummaryByCompany(fromDate, toDate);
  }

  /**
   * Evolução mensal de tokens e custo.
   * GET /ia/billing/monthly?months=12
   */
  @Get('monthly')
  getMonthly(@Query('months') months?: string) {
    return this.executionService.getMonthly(months ? Number(months) : 12);
  }

  /**
   * Log de execuções individuais com filtros.
   * GET /ia/billing/executions?task=FORMPD_EXTRACTION&status=ERROR&limit=50
   */
  @Get('executions')
  getExecutions(
    @Query('task')      task?: string,
    @Query('status')    status?: string,
    @Query('companyId') companyId?: string,
    @Query('limit')     limit?: string,
  ) {
    return this.executionService.getExecutions({
      task,
      status,
      companyId: companyId ? Number(companyId) : undefined,
      limit:     limit     ? Number(limit)     : 100,
    });
  }

  private startOfMonth(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
