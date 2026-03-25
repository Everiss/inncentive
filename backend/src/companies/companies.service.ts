import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ContactsService } from '../contacts/contacts.service';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { parseReceitaWSPhones } from '../common/phone-parser.util';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private contactsService: ContactsService,
  ) {}

  async findAll(params: { page: number; limit: number; search: string; sortBy: string; sortOrder: 'asc' | 'desc' }) {
    const { page, limit, search, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.companiesWhereInput = search
      ? {
          OR: [
            { legal_name: { contains: search } },
            { cnpj: { contains: search } },
            { trade_name: { contains: search } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.companies.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          addresses: true,
          company_cnaes: {
            include: {
              cnaes: true,
            },
          },
        },
      }),
      this.prisma.companies.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number) {
    return this.prisma.companies.findUnique({
      where: { id },
      include: {
        addresses: true,
        phones: {
          orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
        },
        company_cnaes: {
          include: { cnaes: true },
        },
        company_partners: {
          include: { partners: true },
        },
        tax_regregimes: true,
      },
    });
  }

  /**
   * Checks if a CNPJ already exists in the local DB.
   * Returns { exists, company } so the frontend can decide what to show.
   */
  async checkCnpj(rawCnpj: string) {
    const cnpj = this.cleanCnpj(rawCnpj);
    if (!cnpj) return { exists: false, company: null };

    const company = await this.prisma.companies.findUnique({
      where: { cnpj },
      include: { addresses: true },
    });

    return { exists: !!company, company };
  }

  /**
   * Registers or updates a company by fetching data from ReceitaWS.
   * If forceUpdate=true, it will update an existing record.
   */
  async registerByCnpj(rawCnpj: string, forceUpdate: boolean) {
    const cnpj = this.cleanCnpj(rawCnpj);
    if (!cnpj) throw new Error('CNPJ inválido.');

    // If not forcing update, check existence
    if (!forceUpdate) {
      const existing = await this.prisma.companies.findUnique({ where: { cnpj } });
      if (existing) {
        return { alreadyExists: true, company: existing };
      }
    }

    // Fetch from ReceitaWS
    const rawToken = this.configService.get<string>('RECEITA_WS_TOKEN') || '';
    const token = rawToken.replace(/"/g, '').trim();
    const baseUrl = 'https://www.receitaws.com.br/v1/cnpj/';
    const url = token 
      ? `${baseUrl}${cnpj}/days/30` // Versão comercial (com defasagem)
      : `${baseUrl}${cnpj}`;        // Versão gratuita 

    try {
      this.logger.log(`Consultando CNPJ ${cnpj} via ReceitaWS (${token ? 'Comercial' : 'Pública'})`);
      const headers: any = { 'Accept': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`; // Padrão OAuth2/Bearer
      }

      const { data } = await firstValueFrom(
        this.httpService.get(url, { headers, timeout: 15000 }),
      );

      if (data.status === 'ERROR') {
        return { success: false, error: data.message || 'CNPJ não encontrado na Receita Federal.' };
      }

      const capitalSocial = data.capital_social ? parseFloat(data.capital_social) : 0;
      let openDate: Date | null = null;
      if (data.abertura) {
        const parts = data.abertura.split('/');
        if (parts.length === 3) openDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      }

      const company = await this.prisma.companies.upsert({
        where: { cnpj },
        update: {
          legal_name: data.nome,
          trade_name: data.fantasia || null,
          legal_nature: data.natureza_juridica || null,
          porte: data.porte || null,
          email: data.email || null,
          capital_social: capitalSocial,
          situation: data.situacao || null,
          situation_reason: data.motivo_situacao || null,
          updated_at: new Date(),
        },
        create: {
          cnpj,
          legal_name: data.nome,
          trade_name: data.fantasia || null,
          open_date: openDate,
          legal_nature: data.natureza_juridica || null,
          porte: data.porte || null,
          email: data.email || null,
          capital_social: capitalSocial,
          situation: data.situacao || null,
          situation_reason: data.motivo_situacao || null,
          status: 'OK',
          created_at: new Date(),
        },
      });

      // Sync company phones
      await this.syncCompanyPhones(company.id, data.telefone);

      // Sync address
      if (data.logradouro) {
        await this.prisma.addresses.deleteMany({ where: { company_id: company.id } });
        await this.prisma.addresses.create({
          data: {
            company_id: company.id,
            street: data.logradouro,
            number: data.numero,
            complement: data.complemento,
            neighborhood: data.bairro,
            city: data.municipio,
            state: data.uf,
            zip_code: data.cep ? data.cep.replace(/\D/g, '') : null,
          },
        });
      }

      // Sync CNAEs
      if (data.atividade_principal && data.atividade_principal.length > 0) {
        const cnaeArr = [data.atividade_principal[0], ...(data.atividades_secundarias || [])];
        for (let idx = 0; idx < cnaeArr.length; idx++) {
          const act = cnaeArr[idx];
          if (!act.code || act.code === '00.00-0-00') continue;
          const cnaeCode = act.code.replace(/[^\d.-]/g, '');
          await this.prisma.cnaes.upsert({
            where: { code: cnaeCode },
            update: { description: act.text },
            create: { code: cnaeCode, description: act.text },
          });
          await this.prisma.company_cnaes.upsert({
            where: { company_id_cnae_code: { company_id: company.id, cnae_code: cnaeCode } },
            update: { is_primary: idx === 0 },
            create: { company_id: company.id, cnae_code: cnaeCode, is_primary: idx === 0 },
          });
        }
      }

      // Sync contacts from ReceitaWS response
      try {
        await this.contactsService.syncContactsFromReceitaWS(company.id, data);
      } catch (contactErr: any) {
        this.logger.warn(`Contacts sync failed for ${cnpj}: ${contactErr.message}`);
      }

      return { success: true, company, updated: forceUpdate };
    } catch (err: any) {
      this.logger.error(`Failed to register CNPJ ${cnpj}: ${err.message}`);
      return { success: false, error: 'Falha ao consultar a ReceitaWS. Tente novamente.' };
    }
  }

  private async syncCompanyPhones(companyId: number, rawPhone: string | null) {
    const phones = parseReceitaWSPhones(rawPhone);
    for (const ph of phones) {
      const existing = await this.prisma.company_phones.findFirst({
        where: { company_id: companyId, number: ph.number },
      });
      if (!existing) {
        await this.prisma.company_phones.create({
          data: {
            company_id: companyId,
            number: ph.number,
            type: ph.type,
            is_primary: ph.isPrimary,
          },
        });
      } else {
        await this.prisma.company_phones.update({
          where: { id: existing.id },
          data: { is_primary: ph.isPrimary },
        });
      }
    }
  }

  private cleanCnpj(raw: string): string | null {
    if (!raw) return null;
    const onlyDigits = String(raw).replace(/\D/g, '');
    if (onlyDigits.length === 0) return null;
    return onlyDigits.padStart(14, '0');
  }
}
