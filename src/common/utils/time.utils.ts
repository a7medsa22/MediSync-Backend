import { DayOfWeek } from '@prisma/client';

export class TimeUtils {
  private static readonly MINUTES_PER_DAY = 24 * 60;

  /**
   * Normalize a date to start of day (00:00:00.000) in local timezone
   */
  static normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  /**
   * Normalize date range and validate it
   */
  static normalizeDateRange(startDate: Date, endDate: Date): { start: Date; end: Date } | null {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return null;

    const start = this.normalizeDate(startDate);
    const end = this.normalizeDate(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      return null;
    }

    return { start, end };
  }

  /**
   * Convert minutes from midnight to Date object for given date
   */
  static minutesToDate(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    result.setSeconds(0);
    result.setMilliseconds(0);
    return result;
  }

  /**
   * Convert Date object to minutes from midnight
   */
  static dateToMinutes(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
  }

  /**
   * Convert minutes to time string (HH:MM format)
   */
  static minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Check if two time ranges overlap
   */
  static timeRangesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Validate time range (start < end, within 24 hours)
   */
  static isValidTimeRange(start: number, end: number): boolean {
    return (
      typeof start === 'number' &&
      typeof end === 'number' &&
      start >= 0 &&
      end > start &&
      end <= this.MINUTES_PER_DAY
    );
  }

  /**
   * Validate slot duration
   */
  static isValidSlotDuration(duration: number): boolean {
    return typeof duration === 'number' && duration > 0 && duration <= 480; // max 8 hours
  }

  /**
   * Validate max appointments per day
   */
  static isValidMaxAppointments(max: number): boolean {
    return typeof max === 'number' && max > 0 && max <= 100;
  }

  /**
   * Get day of week from Date
   */
  static getDayOfWeek(date: Date): DayOfWeek {
    const dayNumber = date.getDay();
    const dayMap: Record<number, DayOfWeek> = {
      0: DayOfWeek.SUNDAY,
      1: DayOfWeek.MONDAY,
      2: DayOfWeek.TUESDAY,
      3: DayOfWeek.WEDNESDAY,
      4: DayOfWeek.THURSDAY,
      5: DayOfWeek.FRIDAY,
      6: DayOfWeek.SATURDAY,
    };
    return dayMap[dayNumber];
  }

  /**
   * Get date key for comparison (YYYY-MM-DD format)
   */
  static getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Add days to a date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  

  /**
   * Check if date is in the past (before today)
   */
  static isPastDate(date: Date): boolean {
    const today = this.normalizeDate(new Date());
    const checkDate = this.normalizeDate(date);
    return checkDate.getTime() < today.getTime();
  }

  /**
   * Check if date is today
   */
  static isToday(date: Date): boolean {
    const today = this.normalizeDate(new Date());
    const checkDate = this.normalizeDate(date);
    return checkDate.getTime() === today.getTime();
  }
}