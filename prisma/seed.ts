import { Prisma, PrismaClient, ShowStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const auditorium = await prisma.auditorium.upsert({
    where: { name: 'Audi 1' },
    update: {},
    create: {
      name: 'Audi 1',
      rows: 6,
      cols: 10,
    },
  });

  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seatNumbers = Array.from({ length: 10 }, (_value, index) => index + 1);

  const existingSeatCount = await prisma.seat.count({
    where: { auditoriumId: auditorium.id },
  });

  if (existingSeatCount === 0) {
    await prisma.seat.createMany({
      data: rowLabels.flatMap((rowLabel) =>
        seatNumbers.map((seatNumber) => ({
          auditoriumId: auditorium.id,
          rowLabel,
          seatNumber,
        })),
      ),
    });
  }

  const showStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const intervalAt = new Date(showStart.getTime() + 60 * 60 * 1000);

  let show = await prisma.show.findFirst({
    where: {
      movieTitle: 'Seed Movie',
      auditoriumId: auditorium.id,
      status: ShowStatus.SCHEDULED,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!show) {
    show = await prisma.show.create({
      data: {
        movieTitle: 'Seed Movie',
        startsAt: showStart,
        intervalAt,
        auditoriumId: auditorium.id,
      },
    });
  }

  const seats = await prisma.seat.findMany({
    where: { auditoriumId: auditorium.id },
    select: { id: true },
  });

  const existingShowSeatCount = await prisma.showSeat.count({
    where: { showId: show.id },
  });

  if (existingShowSeatCount === 0) {
    await prisma.showSeat.createMany({
      data: seats.map((seat) => ({
        showId: show!.id,
        seatId: seat.id,
        price: new Prisma.Decimal(250),
      })),
      skipDuplicates: true,
    });
  }

  await prisma.comboRule.upsert({
    where: { code: 'TWO_TICKETS_POPCORN_20' },
    update: {
      isActive: true,
      minTickets: 2,
      targetSku: 'LARGE_POPCORN',
      discountPercent: new Prisma.Decimal(20),
      description: 'Buy 2 tickets and get 20% off on Large Popcorn',
    },
    create: {
      code: 'TWO_TICKETS_POPCORN_20',
      description: 'Buy 2 tickets and get 20% off on Large Popcorn',
      minTickets: 2,
      targetSku: 'LARGE_POPCORN',
      discountPercent: new Prisma.Decimal(20),
      isActive: true,
    },
  });

  console.log('Seed completed');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
