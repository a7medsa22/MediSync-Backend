import { Test, TestingModule } from '@nestjs/testing';
import { SlotGeneratorService } from './slot-generator.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

describe('SlotGeneratorService', () => {
  let service: SlotGeneratorService;

  const prismaMock = {
    doctorAvailability: { findMany: jest.fn() },
    doctorBreak: { findMany: jest.fn() },
    doctorDayOff: { findMany: jest.fn() },
    appointment: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotGeneratorService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SlotGeneratorService>(SlotGeneratorService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns [] when date range is invalid (end before start)', async () => {
    // normalizeDateRange is in TimeUtils; for an obvious invalid range end < start
    const slots = await service.generateSlots({
      doctorId: 'doc_1',
      startDate: new Date('2026-01-02T10:00:00.000Z'),
      endDate: new Date('2026-01-01T10:00:00.000Z'),
    });

    expect(slots).toEqual([]);
    expect(prismaMock.doctorAvailability.findMany).not.toHaveBeenCalled();
  });

  it('generates slots for a single day availability and skips overlaps with booked appointments', async () => {
    // Choose a known weekday: 2026-01-05 is Monday.
    const baseDay = new Date('2026-01-05T00:00:00.000Z');
    const startDate = new Date(baseDay);
    const endDate = new Date('2026-01-05T23:59:59.000Z');

    prismaMock.doctorAvailability.findMany.mockResolvedValue([
      {
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: 9 * 60, // 09:00
        endTime: 10 * 60 + 0, // 10:00
        slotDuration: 30,
      },
    ]);

    prismaMock.doctorBreak.findMany.mockResolvedValue([]);
    prismaMock.doctorDayOff.findMany.mockResolvedValue([]);

    const bookedStart = new Date('2026-01-05T09:30:00.000Z');
    const bookedEnd = new Date('2026-01-05T10:00:00.000Z');

    // Appointment from 09:30 to 10:00 should block overlapping slots
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        startTime: bookedStart,
        endTime: bookedEnd,
      },
    ]);

    const slots = await service.generateSlots({
      doctorId: 'doc_1',
      startDate,
      endDate,
      timezone: 'UTC',
    });

    // Expect: no generated slot overlaps the booked appointment
    const hasOverlap = slots.some((slot) => {
      return slot.start < bookedEnd && slot.end > bookedStart;
    });

    expect(hasOverlap).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('skips slots that fall inside breaks', async () => {
    const baseDay = new Date('2026-01-06T00:00:00.000Z'); // Tuesday
    const startDate = new Date(baseDay);
    const endDate = new Date('2026-01-06T23:59:59.000Z');

    prismaMock.doctorAvailability.findMany.mockResolvedValue([
      {
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: 9 * 60,
        endTime: 11 * 60,
        slotDuration: 30, // 09:00, 09:30, 10:00, 10:30
      },
    ]);

    const breakStartMinutes = 9 * 60 + 30; // 09:30
    const breakEndMinutes = 10 * 60 + 30; // 10:30

    prismaMock.doctorBreak.findMany.mockResolvedValue([
      {
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: breakStartMinutes,
        endTime: breakEndMinutes,
        // overlaps slots 09:30-10:00 and 10:00-10:30
      },
    ]);

    prismaMock.doctorDayOff.findMany.mockResolvedValue([]);
    prismaMock.appointment.findMany.mockResolvedValue([]);

    const slots = await service.generateSlots({
      doctorId: 'doc_1',
      startDate,
      endDate,
      timezone: 'UTC',
    });

    // Expect: no generated slot overlaps the break window.
    // We translate break minutes into a concrete timestamp on the same day
    // based on the test day start (timezone handling is internal, but overlap
    // checks are still safe because we only compare Date intervals).
    const dayBase = new Date('2026-01-06T00:00:00.000Z');
    const breakStart = new Date(
      dayBase.getTime() + breakStartMinutes * 60 * 1000,
    );
    const breakEnd = new Date(dayBase.getTime() + breakEndMinutes * 60 * 1000);

    const hasOverlap = slots.some((slot) => {
      return slot.start < breakEnd && slot.end > breakStart;
    });

    expect(hasOverlap).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('skips an entire day when it is a day-off', async () => {
    const baseDay = new Date('2026-01-07T00:00:00.000Z'); // Wednesday
    const startDate = new Date(baseDay);
    const endDate = new Date('2026-01-07T23:59:59.000Z');

    prismaMock.doctorAvailability.findMany.mockResolvedValue([
      {
        dayOfWeek: DayOfWeek.WEDNESDAY,
        startTime: 9 * 60,
        endTime: 10 * 60,
        slotDuration: 30,
      },
    ]);

    prismaMock.doctorBreak.findMany.mockResolvedValue([]);
    prismaMock.appointment.findMany.mockResolvedValue([]);

    prismaMock.doctorDayOff.findMany.mockResolvedValue([
      { date: new Date('2026-01-07T12:00:00.000Z') },
    ]);

    const slots = await service.generateSlots({
      doctorId: 'doc_1',
      startDate,
      endDate,
      timezone: 'UTC',
    });

    expect(slots).toEqual([]);
  });
});
