import { prisma } from './prisma';

export { prisma };

// Lightweight liveness check for Postgres connectivity.
export async function checkPostgresConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
