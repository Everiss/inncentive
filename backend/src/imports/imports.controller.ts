import { Controller, Post, Get, Delete, Param, Query, UseInterceptors, UploadedFile, BadRequestException, ParseIntPipe, Body, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload-cnpjs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCnpjs(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.importsService.processCnpjFileInBackground(file);
  }

  @Post('upload-contacts')
  @UseInterceptors(FileInterceptor('file'))
  async uploadContacts(
    @UploadedFile() file: Express.Multer.File,
    @Query('companyId') companyId?: string
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.importsService.processContactsFile(file, companyId ? Number(companyId) : undefined);
  }

  @Post('upload-collaborators')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCollaborators(
    @UploadedFile() file: Express.Multer.File,
    @Query('companyId') companyId?: string
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.importsService.processCollaboratorsFile(file, companyId ? Number(companyId) : undefined);
  }

  @Post('upload-projects')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProjects(
    @UploadedFile() file: Express.Multer.File,
    @Query('companyId') companyId?: string
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.importsService.processProjectsFile(file, companyId ? Number(companyId) : undefined);
  }

  /**
   * Upload a FORMP&D PDF for AI extraction.
   * - Without companyId: global flow — asks user if company is unknown
   * - With companyId: company-scoped flow — rejects if extracted CNPJ doesn't match
   */
  @Post('upload-formpd-ai')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadFormpdAi(
    @UploadedFile() file: Express.Multer.File,
    @Query('companyId') companyId?: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    const destDir = path.join(process.cwd(), 'upload', 'pending', 'FORM');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const timestamp = Date.now();
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const finalFileName = `${timestamp}-${cleanFileName}`;
    const finalPath = path.join(destDir, finalFileName);

    fs.writeFileSync(finalPath, file.buffer);

    file.path = finalPath;
    file.destination = destDir;
    file.filename = finalFileName;

    return this.importsService.processFormpdPdf(
      file,
      companyId ? Number(companyId) : undefined,
    );
  }

  /** Register the company found in a COMPANY_NOT_FOUND FORMPD batch. */
  @Post('formpd/batches/:id/register-company')
  async registerCompanyForBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.registerCompanyForBatch(id);
  }

  /** Stream the original PDF file for a FORMPD batch (for review UI). */
  @Get('formpd/batches/:id/pdf')
  async getBatchPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    return this.importsService.streamBatchPdf(id, res);
  }

  /** Discard a FORMPD batch — moves PDF to rejected folder. */
  @Post('formpd/batches/:id/discard')
  async discardBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.discardBatch(id);
  }

  /** Approve a FORMPD batch — promotes data to formpd_forms + projects. */
  @Post('formpd/batches/:id/approve')
  async approveBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.approveBatch(id);
  }

  @Get('check-cnpj')
  async checkCnpj(@Query('cnpj') cnpj: string) {
    if (!cnpj) throw new BadRequestException('CNPJ é obrigatório');
    return this.importsService.checkCnpj(cnpj);
  }

  @Get('batches')
  async getBatches(
    @Query('companyId') companyId?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.importsService.getBatches(
      companyId ? Number(companyId) : undefined,
      entityType,
    );
  }

  @Get('batches/:id/items')
  async getBatchItems(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.importsService.getBatchItems(id, Number(page) || 1, Number(limit) || 20);
  }

  @Get('batches/:id/trace')
  async getBatchTrace(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.getBatchTrace(id);
  }

  @Get('file-jobs/:id/trace')
  async getFileJobTrace(@Param('id') id: string) {
    return this.importsService.getFileJobTrace(id);
  }

  @Post('batches/:id/reprocess')
  async reprocessBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.reprocessBatch(id);
  }

  @Delete('batches/:id')
  async deleteBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.deleteBatch(id);
  }
}
