/**
 * One-time migration: move QSA-originated contacts to partners + company_partners.
 *
 * Identifies contacts whose contact_companies.notes look like QSA qualifications
 * (anything that is NOT 'Responsável Principal' and NOT imported via Excel/Collaborador).
 *
 * For each match:
 *  1. Upsert the person into `partners`.
 *  2. Upsert the company link into `company_partners` (qualification = original notes).
 *  3. Delete the contact_companies row.
 *  4. If the contact now has no other links, no email, no phones, no collaborator,
 *     no user → delete the contact record.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SKIP_NOTES = [
  'Responsável Principal',
  'Importado via Excel',
  'Importado via Excel (Colaborador)',
];

async function main() {
  // 1. Find all contact_companies rows that look like QSA entries
  const qsaLinks = await prisma.contact_companies.findMany({
    where: {
      NOT: [
        { notes: null },
        ...SKIP_NOTES.map((n) => ({ notes: n })),
      ],
    },
    include: {
      contact: {
        include: {
          phones: true,
          collaborator: true,
          user: true,
        },
      },
    },
  });

  console.log(`Found ${qsaLinks.length} QSA contact_companies rows to migrate.`);

  let moved = 0;
  let skipped = 0;
  let deleted = 0;

  for (const link of qsaLinks) {
    const contact = link.contact;
    const nome = contact.name?.trim();
    if (!nome) { skipped++; continue; }

    console.log(`  → Migrating: "${nome}" (contact #${contact.id}, company #${link.company_id})`);

    // 2. Upsert partner
    let partner = await prisma.partners.findFirst({
      where: { name: nome, country_origin: null },
    });
    if (!partner) {
      partner = await prisma.partners.create({
        data: { name: nome, country_origin: null },
      });
    }

    // 3. Upsert company_partners
    const existing = await prisma.company_partners.findFirst({
      where: { company_id: link.company_id, partner_id: partner.id },
    });
    if (existing) {
      await prisma.company_partners.update({
        where: { id: existing.id },
        data: { qualification: link.notes },
      });
    } else {
      await prisma.company_partners.create({
        data: {
          company_id: link.company_id,
          partner_id: partner.id,
          qualification: link.notes,
        },
      });
    }

    // 4. Remove the contact_companies link
    await prisma.contact_companies.delete({ where: { id: link.id } });
    moved++;

    // 5. Clean up the contact if it has nothing left
    const remainingLinks = await prisma.contact_companies.count({
      where: { contact_id: contact.id },
    });
    const hasEmail = !!contact.email;
    const hasPhones = contact.phones.length > 0;
    const hasCollaborator = !!contact.collaborator;
    const hasUser = !!contact.user;

    if (!remainingLinks && !hasEmail && !hasPhones && !hasCollaborator && !hasUser) {
      await prisma.contacts.delete({ where: { id: contact.id } });
      console.log(`    ✓ Contact #${contact.id} deleted (no remaining data).`);
      deleted++;
    } else {
      console.log(`    ✓ Contact #${contact.id} kept (has email=${hasEmail}, phones=${contact.phones.length}, otherLinks=${remainingLinks}).`);
    }
  }

  console.log(`\nDone. Moved: ${moved}, Skipped: ${skipped}, Contacts deleted: ${deleted}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
