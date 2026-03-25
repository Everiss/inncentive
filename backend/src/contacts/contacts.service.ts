import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseReceitaWSPhones } from '../common/phone-parser.util';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Extracts contact data from a ReceitaWS company response and
   * upserts each valid contact linked to the given company.
   *
   * Criteria — must have:
   *  - a name (nome)
   *  - AND at least one of: email OR phone
   *
   * Phone numbers are stored in `contact_phones` (1:N).
   */
  async syncContactsFromReceitaWS(companyId: number, data: any): Promise<void> {
    const qsa: any[] = data.qsa || [];
    const responsavel: string | null = data.responsavel?.trim() || null;
    const companyEmail: string | null = data.email?.trim() || null;
    const companyPhone: string | null = data.telefone?.trim() || null;

    const phones = parseReceitaWSPhones(companyPhone);

    // Heuristic: Identify the "Lead" contact who gets the company's main email/phone
    // Favor explicit "responsavel" field, or the first person in QSA.
    const leadPartner = qsa.find((s) => !this.looksLikeLegalEntity(s.nome));
    const mainName = responsavel || leadPartner?.nome;

    if (mainName && !this.looksLikeLegalEntity(mainName)) {
      this.logger.log(`Syncing lead contact: ${mainName}`);
      await this.upsertContactComplete({
        name: mainName,
        email: companyEmail,
        phones,
        companyId,
        role: 'PONTO_FOCAL',
        notes: responsavel ? 'Responsável Principal' : 'Lead Partner (QSA)',
      });
    }

    // Process all other partners in QSA
    for (const socio of qsa) {
      const nome: string = socio.nome?.trim() || '';
      if (!nome || this.looksLikeLegalEntity(nome) || nome === mainName) continue;

      this.logger.log(`Syncing partner: ${nome}`);
      await this.upsertContactComplete({
        name: nome,
        email: null,
        phones: [], // QSA usually doesn't provide phones for every partner
        companyId,
        role: 'PONTO_FOCAL',
        notes: socio.qual || 'Sócio',
      });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /**
   * Unified upsert that handles name/email matching, phone sync, and company linking.
   */
  async upsertContactComplete(params: {
    name: string;
    email?: string | null;
    phones: { number: string; type: string; isPrimary: boolean }[];
    companyId: number;
    role: string;
    notes?: string | null;
  }) {
    const { name, email, phones, companyId, role, notes } = params;
    const safeEmail = email ? email.slice(0, 191).trim() : null;

    // 1. Resolve Contact (by Email first, then Name)
    let contact = safeEmail
      ? await this.prisma.contacts.findUnique({ where: { email: safeEmail } })
      : null;

    if (!contact) {
      contact = await this.prisma.contacts.findFirst({ where: { name: name.trim() } });
    }

    if (contact) {
      contact = await this.prisma.contacts.update({
        where: { id: contact.id },
        data: {
          name: name.trim(),
          email: safeEmail || contact.email,
          updated_at: new Date(),
        },
      });
    } else {
      contact = await this.prisma.contacts.create({
        data: { name: name.trim(), email: safeEmail },
      });
    }

    // 2. Sync Phones (1:N)
    if (phones.length > 0) {
      await this.syncPhones(contact.id, phones);
    }

    // 3. Link to Company (Role & Notes)
    await this.linkContactToCompany(contact.id, companyId, role, notes);
  }

  private async syncPhones(
    contactId: number,
    phones: { number: string; type: string; isPrimary: boolean }[],
  ) {
    for (const ph of phones) {
      const cleanNumber = ph.number.replace(/\D/g, '').slice(0, 30);
      if (!cleanNumber) continue;

      const existing = await this.prisma.contact_phones.findFirst({
        where: { contact_id: contactId, number: cleanNumber },
      });

      if (!existing) {
        await this.prisma.contact_phones.create({
          data: {
            contact_id: contactId,
            number: cleanNumber,
            type: ph.type as any,
            is_primary: ph.isPrimary,
          },
        });
      } else if (ph.isPrimary && !existing.is_primary) {
        await this.prisma.contact_phones.update({
          where: { id: existing.id },
          data: { is_primary: true },
        });
      }
    }
  }

  private async linkContactToCompany(
    contactId: number,
    companyId: number,
    role: string,
    notes?: string | null,
  ) {
    const existing = await this.prisma.contact_companies.findFirst({
      where: { contact_id: contactId, company_id: companyId, role },
    });

    if (existing) {
      await this.prisma.contact_companies.update({
        where: { id: existing.id },
        data: { notes: notes ?? existing.notes, is_active: true },
      });
    } else {
      await this.prisma.contact_companies.create({
        data: { contact_id: contactId, company_id: companyId, role, notes },
      });
    }
  }

  private looksLikeLegalEntity(name: string): boolean {
    const upper = name.toUpperCase().trim();
    const legalSuffixes = [
      'LTDA', 'S/A', 'S.A.', 'SA', 'ME', 'EPP', 'EIRELI', 'PME',
      'MICROEMPRESA', 'SOCIEDADE', 'ASSOCIACAO', 'ASSOCIAÇÃO',
      'FUNDACAO', 'FUNDAÇÃO', 'SERVICOS', 'SERVIÇOS', 'INDUSTRIA',
      'CONSTRUTORA', 'HOLDING', 'PARTICIPACOES', 'PARTICIPAÇÕES',
    ];
    return legalSuffixes.some((suffix) => upper.includes(suffix) || upper.endsWith(' ' + suffix));
  }

  async findAll(params: {
    page: number;
    limit: number;
    search: string;
    role: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    companyId?: number;
  }) {
    const { page, limit, search, role, sortBy, sortOrder, companyId } = params;
    const skip = (page - 1) * limit;

    const companyLinkWhere: any = { is_active: true };
    if (role) companyLinkWhere.role = role;
    if (companyId) companyLinkWhere.company_id = Number(companyId);

    const allowedSortFields = ['name', 'email', 'created_at'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'name';

    const where: any = {
      contact_companies: { some: companyLinkWhere },
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        // Search by phone number inside the phones relation
        { phones: { some: { number: { contains: search } } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contacts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
        include: {
          phones: {
            orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
          },
          contact_companies: {
            where: { is_active: true },
            include: {
              company: {
                select: { id: true, legal_name: true, trade_name: true, cnpj: true },
              },
            },
          },
          collaborator: {
            select: { id: true, position: true, department: true, is_active: true },
          },
          user: {
            select: { id: true, system_role: true, is_active: true, last_login: true },
          },
        },
      }),
      this.prisma.contacts.count({ where }),
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
    return this.prisma.contacts.findUnique({
      where: { id },
      include: {
        phones: {
          orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
        },
        contact_companies: {
          where: { is_active: true },
          include: {
            company: {
              select: { id: true, legal_name: true, trade_name: true, cnpj: true },
            },
          },
        },
        collaborator: {
          select: {
            id: true,
            position: true,
            department: true,
            admission_date: true,
            registration_number: true,
            is_active: true,
          },
        },
        user: {
          select: {
            id: true,
            system_role: true,
            is_active: true,
            last_login: true,
            created_at: true,
          },
        },
      },
    });
  }
}
