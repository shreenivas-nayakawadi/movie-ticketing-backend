import { prisma } from './prisma';

export { prisma };

export async function checkPostgresConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
