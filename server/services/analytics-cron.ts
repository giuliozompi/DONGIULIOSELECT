import { generateDailySnapshot, backfillHistoricalData } from './analytics-aggregation';
import { db } from '../db';
import { analyticsSnapshots } from '@shared/schema';
import { desc } from 'drizzle-orm';

function getMoscowTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
}

function getYesterdayDateString(): string {
  const moscowNow = getMoscowTime();
  const yesterday = new Date(moscowNow);
  yesterday.setDate(yesterday.getDate() - 1);

  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayDateString(): string {
  const moscowNow = getMoscowTime();
  const year = moscowNow.getFullYear();
  const month = String(moscowNow.getMonth() + 1).padStart(2, '0');
  const day = String(moscowNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shouldRunDailySnapshot(): boolean {
  const moscowNow = getMoscowTime();
  const currentHour = moscowNow.getHours();
  const currentMinute = moscowNow.getMinutes();

  return currentHour === 2 && currentMinute >= 30 && currentMinute < 45;
}

let lastSnapshotDate: string | null = null;

async function checkAndGenerateSnapshot(): Promise<void> {
  if (!shouldRunDailySnapshot()) {
    return;
  }

  const targetDate = getYesterdayDateString();

  if (lastSnapshotDate === targetDate) {
    console.log(`[Analytics Cron] Snapshot for ${targetDate} already generated in this session`);
    return;
  }

  console.log(`[Analytics Cron] Generating snapshot for ${targetDate}...`);

  try {
    await generateDailySnapshot(targetDate);
    lastSnapshotDate = targetDate;
    console.log(`[Analytics Cron] ✅ Snapshot completed for ${targetDate}`);
  } catch (error) {
    console.error(`[Analytics Cron] ❌ Failed to generate snapshot for ${targetDate}:`, error);
  }
}

async function autoBackfillMissingSnapshots(): Promise<void> {
  try {
    const yesterday = getYesterdayDateString();
    const today = getTodayDateString();

    const latestSnapshot = await db
      .select({ snapshotDate: analyticsSnapshots.snapshotDate })
      .from(analyticsSnapshots)
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(1);

    let startDate: string;

    if (latestSnapshot.length === 0) {
      const thirtyDaysAgo = new Date(getMoscowTime());
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const y = thirtyDaysAgo.getFullYear();
      const m = String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0');
      const d = String(thirtyDaysAgo.getDate()).padStart(2, '0');
      startDate = `${y}-${m}-${d}`;
      console.log(`[Analytics Cron] No snapshots found, backfilling last 30 days from ${startDate}`);
    } else {
      const lastDate = latestSnapshot[0].snapshotDate;
      if (lastDate >= yesterday) {
        console.log(`[Analytics Cron] Snapshots up to date (last: ${lastDate})`);
        return;
      }
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const y = nextDay.getFullYear();
      const m = String(nextDay.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDay.getDate()).padStart(2, '0');
      startDate = `${y}-${m}-${dd}`;
      console.log(`[Analytics Cron] Gap detected: last snapshot ${lastDate}, backfilling from ${startDate} to ${yesterday}`);
    }

    if (startDate > yesterday) {
      console.log(`[Analytics Cron] Nothing to backfill`);
      return;
    }

    await backfillHistoricalData(startDate, yesterday);
    console.log(`[Analytics Cron] ✅ Auto-backfill complete`);
  } catch (error) {
    console.error(`[Analytics Cron] ❌ Auto-backfill failed:`, error);
  }
}

export function startAnalyticsCron(intervalMinutes: number = 15): NodeJS.Timeout {
  console.log(
    `[Analytics Cron] Starting cron job with ${intervalMinutes} minute interval (daily snapshot at 02:30 MSK)`
  );

  autoBackfillMissingSnapshots();

  checkAndGenerateSnapshot();

  return setInterval(() => {
    checkAndGenerateSnapshot();
  }, intervalMinutes * 60 * 1000);
}
