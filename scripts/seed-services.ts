import path from 'path';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ServiceEntry {
    name:       string;
    slug:       string;
    domain?:    string;
    pricingUrl: string;
    logoUrl?:   string;
}

async function main(): Promise<void> {
    const filePath = path.join(__dirname, '..', 'data', 'services.json');
    const services = JSON.parse(readFileSync(filePath, 'utf-8')) as ServiceEntry[];

    let created = 0;
    let updated = 0;

    for (const s of services) {
        const result = await prisma.service.upsert({
            where:  { slug: s.slug },
            create: { name: s.name, slug: s.slug, domain: s.domain ?? null, pricingUrl: s.pricingUrl, logoUrl: s.logoUrl ?? null },
            update: { name: s.name, domain: s.domain ?? null, pricingUrl: s.pricingUrl },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            created++;
        } else {
            updated++;
        }
    }

    console.log(`[seed] done — ${created} created, ${updated} updated`);
}

main()
    .catch(err => { console.error('[seed] error:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
