import { prisma } from '../../src/lib/prisma';

// Each test file gets its own module registry (and Prisma client); close it so Jest can exit cleanly.
afterAll(async () => {
  await prisma.$disconnect();
});
