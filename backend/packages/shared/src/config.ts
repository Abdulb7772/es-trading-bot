import { z } from 'zod';

export const runtimeConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DATABASE: z.string().default('es_trading_bot'),
  CANDLE_TIMEFRAME_MINUTES: z.coerce.number().int().positive().default(15)
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
