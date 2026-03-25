/**
 * Rebuilds contact_companies links that were lost during the QSA migration.
 *
 * Strategy:
 *  1. Contacts with email  → match companies.email
 *  2. Contacts without email but with phone → match company_phones.number
 *
 * All rebuilt links get role='PONTO_FOCAL', notes='Responsável Principal'.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  let linked = 0;
  let skipped = 0;
  let ambiguous = 0;

  // ── 1. Contacts with email ─────────────────────────────────────────
  const contactsWithEmail = await prisma.contacts.findMany({
    where: { email: { not: null } },
    select: { id: true, name: true, email: true },
  });

  console.log(`Processing ${contactsWithEmail.length} contacts with email...`);

  for (const contact of contactsWithEmail) {
    const companies = await prisma.companies.findMany({
      where: { email: contact.email! },
      select: { id: true, legal_name: true },
    });

    if (companies.length === 0) {
      skipped++;
      continue;
    }

    for (const company of companies) {
      const exists = await prisma.contact_companies.findFirst({
        where: { contact_id: contact.id, company_id: company.id },
      });
      if (!exists) {
        await prisma.contact_companies.create({
          data: {
            contact_id: contact.id,
            company_id: company.id,
            role: 'PONTO_FOCAL',
            notes: 'Responsável Principal',
            is_active: true,
          },
        });
        linked++;
      }
    }

    if (companies.length > 1) {
      ambiguous++;
      console.log(`  ⚠ "${contact.name}" linked to ${companies.length} companies (shared email ${contact.email})`);
    }
  }

  // ── 2. Contacts without email but with phones ──────────────────────
  const contactsPhoneOnly = await prisma.contacts.findMany({
    where: { email: null, phones: { some: {} } },
    select: { id: true, name: true, phones: { select: { number: true } } },
  });

  console.log(`\nProcessing ${contactsPhoneOnly.length} contacts with phone only...`);

  for (const contact of contactsPhoneOnly) {
    const numbers = contact.phones.map(p => p.number.replace(/\D/g, ''));
    const matchedCompanyIds = new Set<number>();

    for (const number of numbers) {
      const companyPhones = await prisma.company_phones.findMany({
        where: { number: { contains: number } },
        select: { company_id: true },
      });
      companyPhones.forEach(cp => matchedCompanyIds.add(cp.company_id));
    }

    if (matchedCompanyIds.size === 0) {
      skipped++;
      continue;
    }

    for (const companyId of matchedCompanyIds) {
      const exists = await prisma.contact_companies.findFirst({
        where: { contact_id: contact.id, company_id: companyId },
      });
      if (!exists) {
        await prisma.contact_companies.create({
          data: {
            contact_id: contact.id,
            company_id: companyId,
            role: 'PONTO_FOCAL',
            notes: 'Responsável Principal',
            is_active: true,
          },
        });
        linked++;
      }
    }
  }

  console.log(`\nDone. Linked: ${linked}, Skipped (no match): ${skipped}, Shared email (multiple companies): ${ambiguous}.`);

  const finalCount = await prisma.contact_companies.count();
  console.log(`contact_companies total now: ${finalCount}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
