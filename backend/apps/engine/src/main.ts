import { logger } from '@es-trading/logging';
import { createApiServer, listenApiServer } from './http';
import { createBackendApplicationServices, createPersistentBackendApplicationServices } from './services';
import { MongoDatabase } from '@es-trading/database';
import { MarketRuntime } from '@es-trading/market';
import { parseLevelsFromCsv, validateLevelCount } from '@es-trading/levels';
import { strategyConfigSchema, type SupportResistanceLevel } from '@es-trading/shared';
import { TopstepXExecutionProvider, TopstepXPollingMarketProvider, TopstepXRestAdapter } from '@es-trading/topstepx';
import { JsonFileRiskStateStore, TradingRiskState, calendarTradingDayResolver } from '@es-trading/risk';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const engineDirectory = globalThis.process.cwd();
const workspaceDirectory = resolve(globalThis.process.env.INIT_CWD ?? engineDirectory).endsWith('backend')
	? resolve(globalThis.process.env.INIT_CWD ?? engineDirectory, '..')
	: resolve(globalThis.process.env.INIT_CWD ?? engineDirectory);
dotenv.config({ path: resolve(workspaceDirectory, 'backend', '.env') });

logger.info('Engine architecture loaded; market connections and order execution are disabled.');

function mongoUriFromCredentialsFile(): string | undefined {
	const filePath = resolve(workspaceDirectory, 'credentials.txt');
	if (!existsSync(filePath)) return undefined;
	const content = readFileSync(filePath, 'utf8');
	const uri = content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith('mongodb+srv://'));
	return uri;
}

async function start(): Promise<void> {
	const port = globalThis.process.env.PORT ?? globalThis.process.env.API_PORT ?? '3001';
	const uri = globalThis.process.env.MONGODB_URI ?? mongoUriFromCredentialsFile();
	const riskState = new TradingRiskState({ tradingDayResolver: calendarTradingDayResolver('America/New_York'), stateStore: new JsonFileRiskStateStore(resolve(workspaceDirectory, 'backend/data/risk-state.json')) });
	let services;
	if (!uri) {
		logger.warn('MongoDB configuration is unavailable; API starting in degraded local mode.');
		services = createBackendApplicationServices({ riskState });
	} else {
		const database = new MongoDatabase({ uri, databaseName: globalThis.process.env.MONGODB_DATABASE ?? 'es_trading_bot' });
		try {
			services = await createPersistentBackendApplicationServices(database, { riskState });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown MongoDB connection error.';
			logger.warn({ error: message }, 'MongoDB unavailable; API starting in degraded local mode.');
			services = createBackendApplicationServices({ riskState });
		}
	}
	await listenApiServer(createApiServer({ services }), Number(port));
	logger.info({ port: Number(port) }, 'Backend API listening.');
	await startLiveEsRuntime(workspaceDirectory, riskState);
}

async function startLiveEsRuntime(rootDirectory: string, riskState: TradingRiskState): Promise<void> {
	const { TOPSTEPX_BASE_URL: baseUrl, TOPSTEPX_USERNAME: username, TOPSTEPX_API_KEY: apiKey, TOPSTEPX_ACCOUNT_ID: accountId } = globalThis.process.env;
	const dryRun = (globalThis.process.env.DRY_RUN ?? 'true').toLowerCase() === 'true';
	if (!baseUrl || !username || !apiKey || !accountId) {
		logger.warn('TopstepX /ES runtime is disabled until TOPSTEPX_BASE_URL, TOPSTEPX_USERNAME, TOPSTEPX_API_KEY, and TOPSTEPX_ACCOUNT_ID are configured.');
		return;
	}

	const levelsPath = resolve(rootDirectory, globalThis.process.env.LEVELS_FILE ?? 'backend/levels/es.csv');
	if (!existsSync(levelsPath)) {
		logger.warn({ levelsPath }, 'TopstepX /ES runtime is disabled because the manual levels file is missing.');
		return;
	}

	const prices = parseLevelsFromCsv(readFileSync(levelsPath, 'utf8'));
	validateLevelCount(prices);
	const levels: readonly SupportResistanceLevel[] = prices.map((price, index) => ({ id: `manual-es-${index + 1}`, price, active: true }));
	const config = strategyConfigSchema.parse({
		symbol: '/ES',
		timeframe: '15m',
		tradingTimezone: globalThis.process.env.TRADING_TIMEZONE ?? 'America/New_York',
		noNewTradesAtOrAfter: globalThis.process.env.NO_NEW_TRADES_AT_OR_AFTER ?? '16:00',
		levels: { source: 'manual_file', minimumCount: 80, maximumCount: 200, selectionPolicy: 'NEAREST_RELEVANT' }
	});
	const adapter = new TopstepXRestAdapter({ baseUrl, username, apiKey, accountId });
	const provider = new TopstepXPollingMarketProvider(adapter);
	const execution = new TopstepXExecutionProvider(adapter, dryRun);
	const runtime = new MarketRuntime({ provider, execution, levels, config, timeframeMinutes: 15, riskState });
	await runtime.start();
	logger.info({ instrument: '/ES', timeframe: '15m', levels: levels.length, dryRun }, 'TopstepX /ES runtime started.');
}

void start().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown startup error.';
	logger.error({ error: message }, 'Backend startup failed; API remains unavailable.');
});
