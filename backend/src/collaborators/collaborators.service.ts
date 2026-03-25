import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollaboratorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    search: string;
    department?: string;
    is_active?: boolean;
    companyId?: number;
  }) {
    const { page, limit, search, department, is_active, companyId } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      is_active: is_active ?? true,
    };

    if (department) {
      where.department = department;
    }

    if (companyId) {
      where.contact = {
        contact_companies: {
          some: { company_id: Number(companyId), is_active: true }
        }
      };
    }

    if (search) {
      where.OR = [
        { position: { contains: search } },
        { department: { contains: search } },
        { contact: { name: { contains: search } } },
        { contact: { email: { contains: search } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.collaborators.findMany({
        where,
        skip,
        take: limit,
        orderBy: { contact: { name: 'asc' } },
        include: {
          contact: {
            include: {
              phones: {
                orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
              },
            },
          },
        },
      }),
      this.prisma.collaborators.count({ where }),
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
    return this.prisma.collaborators.findUnique({
      where: { id },
      include: {
        contact: {
          include: {
            phones: true,
            contact_companies: {
              include: { company: true },
            },
          },
        },
      },
    });
  }

  async create(data: {
    contactId: number;
    position?: string;
    department?: string;
    admission_date?: Date;
    registration_number?: string;
    observations?: string;
  }) {
    return this.prisma.collaborators.create({
      data: {
        contact: { connect: { id: data.contactId } },
        position: data.position,
        department: data.department,
        admission_date: data.admission_date,
        registration_number: data.registration_number,
        observations: data.observations,
      },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.collaborators.update({
      where: { id },
      data,
    });
  }

  async delete(id: number) {
    return this.prisma.collaborators.delete({ where: { id } });
  }
}
