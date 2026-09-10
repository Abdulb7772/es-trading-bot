import { dashboardData } from './mock-data';
import type { DashboardData } from './types';

export async function getDashboardData(): Promise<DashboardData> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 180));
  return dashboardData;
}
