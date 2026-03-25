import { Controller, Post, Get, Param, Query, UseInterceptors, UploadedFile, BadRequestException, ParseIntPipe, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

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

  @Post('upload-formpd-ai')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadFormpdAi(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    // CNPJ e ano-base serão extraídos do PDF pela IA
    const destDir = path.join(process.cwd(), 'upload', 'pending', 'FORM');

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const timestamp = Date.now();
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const finalFileName = `${timestamp}-${cleanFileName}`;
    const finalPath = path.join(destDir, finalFileName);

    fs.writeFileSync(finalPath, file.buffer);

    file.path = finalPath;
    file.destination = destDir;
    file.filename = finalFileName;

    return this.importsService.processFormpdPdf(file);
  }

  @Get('check-cnpj')
  async checkCnpj(@Query('cnpj') cnpj: string) {
    if (!cnpj) throw new BadRequestException('CNPJ é obrigatório');
    return this.importsService.checkCnpj(cnpj);
  }

  @Get('batches')
  async getBatches() {
    return this.importsService.getBatches();
  }

  @Get('batches/:id/items')
  async getBatchItems(
    @Param('id', ParseIntPipe) id: number,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20
  ) {
    return this.importsService.getBatchItems(id, page, limit);
  }

  @Post('batches/:id/reprocess')
  async reprocessBatch(@Param('id', ParseIntPipe) id: number) {
    return this.importsService.reprocessBatch(id);
  }
}
