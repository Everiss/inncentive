import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get('templates')
  getTemplates() {
    return this.importsService.getTemplates();
  }

  @Post('templates')
  createTemplate(@Body() payload: any) {
    return this.importsService.createTemplate(payload);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @Query('templateCode') templateCode: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!templateCode) throw new BadRequestException('templateCode e obrigatorio');
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    return this.importsService.upload(templateCode, file);
  }

  @Post('empresas-cnpj')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadCompanies(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    return this.importsService.uploadLegacy('COMPANIES', file);
  }

  @Post('upload-contacts')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadContacts(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    return this.importsService.uploadLegacy('CONTACTS', file);
  }

  @Post('upload-collaborators')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadCollaborators(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    return this.importsService.uploadLegacy('COLLABORATORS', file);
  }

  @Post('upload-projects')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadProjects(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo nao enviado');
    return this.importsService.uploadLegacy('PROJECTS', file);
  }

  @Get('batches')
  getBatches(@Query() query: Record<string, any>) {
    return this.importsService.getBatches(query);
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.importsService.getBatch(id);
  }

  @Get('batches/:id/items')
  getBatchItems(
    @Param('id') id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.importsService.getBatchRows(id, query);
  }

  @Get('batches/:id/rows')
  getBatchRows(
    @Param('id') id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.importsService.getBatchRows(id, query);
  }

  @Post('batches/:id/reprocess')
  reprocess(@Param('id') id: string) {
    return this.importsService.reprocessBatch(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.importsService.deleteBatch(id);
  }

  @Get('batches/:id/trace')
  getBatchTrace(@Param('id') id: string) {
    return this.importsService.getBatchTrace(id);
  }

  @Get('file-jobs/:id/trace')
  getFileJobTrace(@Param('id') id: string) {
    return this.importsService.getFileJobTrace(id);
  }
}
