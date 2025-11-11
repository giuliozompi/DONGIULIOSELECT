import { generateDailySnapshot } from './analytics-aggregation';

function getMoscowTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
}

function getMoscowMidnight(date: Date): Date {
  const moscowDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  moscowDate.setHours(0, 0, 0, 0);
  return moscowDate;
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

export function startAnalyticsCron(intervalMinutes: number = 15): NodeJS.Timeout {
  console.log(
    `[Analytics Cron] Starting cron job with ${intervalMinutes} minute interval (daily snapshot at 02:30 MSK)`
  );
  
  checkAndGenerateSnapshot();
  
  return setInterval(() => {
    checkAndGenerateSnapshot();
  }, intervalMinutes * 60 * 1000);
}
