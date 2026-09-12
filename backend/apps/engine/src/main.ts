import { logger } from '@es-trading/logging';
import { createApiServer, listenApiServer } from './http';
import { createBackendApplicationServices, createPersistentBackendApplicationServices, type BackendApplicationServices } from './services';
import { MongoDatabase } from '@es-trading/database';
import { MarketRuntime } from '@es-trading/market';
import { parseLevelsFromCsv, validateLevelCount } from '@es-trading/levels';
import { strategyConfigSchema, type SupportResistanceLevel, type Instrument, type TradingDecision, type StrategyEvaluation, type LogEntry, type Trade, ES_SYMBOL, MES_SYMBOL } from '@es-trading/shared';
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

let idCounter = 0;
let logCounter = 0;
let correlationId = 0;

function decisionToEvaluation(decision: TradingDecision, config: { stopPoints: number; targetPoints: number }): StrategyEvaluation {
  const ev = decision.evaluation;
  const side = ev.side ?? 'LONG';
  const long = side === 'LONG';
  const nextPrice = ev.nextRelevantLevel?.price ?? null;

  const diagnosticCandle = (c: typeof ev.candle1, _label: 'Candle 1' | 'Candle 2' | 'Candle 3') => {
    if (!c) return { timestamp: new Date(0).toISOString(), open: 0, high: 0, low: 0, close: 0, color: 'NEUTRAL' as const };
    const color: 'GREEN' | 'RED' | 'NEUTRAL' = c.close > c.open ? 'GREEN' : c.close < c.open ? 'RED' : 'NEUTRAL';
    return { timestamp: c.timestamp.toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, color };
  };

  const wickChecks = [ev.candle1, ev.candle2, ev.candle3].map((c, i) => {
    const label = (['Candle 1', 'Candle 2', 'Candle 3'] as const)[i];
    if (!c || nextPrice === null) return { candle: label, high: 0, low: 0, nextLevelPrice: null, touchedNextLevel: false, closedBeyondNextLevel: false };
    const touchedNextLevel = long ? c.high >= nextPrice : c.low <= nextPrice;
    const closedBeyondNextLevel = long ? c.close >= nextPrice : c.close <= nextPrice;
    return { candle: label, high: c.high, low: c.low, nextLevelPrice: nextPrice, touchedNextLevel, closedBeyondNextLevel };
  });

  const hasWickViolation = wickChecks.some((w) => w.touchedNextLevel && !w.closedBeyondNextLevel);

  let emaRelationship: 'FAST_ABOVE_SLOW' | 'FAST_BELOW_SLOW' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (ev.ema9 !== null && ev.ema21 !== null) {
    emaRelationship = ev.ema9 >= ev.ema21 ? 'FAST_ABOVE_SLOW' : 'FAST_BELOW_SLOW';
  }

  return {
    id: `eval-${Date.now()}-${++idCounter}`,
    timestamp: decision.generatedAt.toISOString(),
    direction: side,
    result: ev.accepted ? 'ACCEPTED' : 'REJECTED',
    candles: [diagnosticCandle(ev.candle1, 'Candle 1'), diagnosticCandle(ev.candle2, 'Candle 2'), diagnosticCandle(ev.candle3, 'Candle 3')],
    ema9: ev.ema9, ema21: ev.ema21, emaRelationship,
    relevantSupport: long ? ev.playedLevel?.price ?? null : ev.nextRelevantLevel?.price ?? null,
    relevantResistance: long ? ev.nextRelevantLevel?.price ?? null : ev.playedLevel?.price ?? null,
    allCrossedLevels: [],
    playedLevel: ev.playedLevel?.price ?? null,
    nextLevel: ev.nextRelevantLevel?.price ?? null,
    breathingRoom: ev.tradePlan?.breathingRoomPoints ?? null,
    reasonCode: ev.reasons[0]?.code ?? 'INSUFFICIENT_CANDLES',
    reason: ev.reasons[0]?.description ?? ev.explanation,
    wickChecks: wickChecks as unknown as StrategyEvaluation['wickChecks'],
    finalWickDecision: hasWickViolation ? 'Wick touched forbidden next level.' : 'No wick violations.',
    risk: { entry: ev.tradePlan?.entryPrice ?? null, stop: ev.tradePlan?.stopPrice ?? null, normalTarget: ev.tradePlan ? (long ? ev.tradePlan.entryPrice + config.targetPoints : ev.tradePlan.entryPrice - config.targetPoints) : null, nextLevelTarget: ev.nextRelevantLevel?.price ?? null, finalTarget: ev.tradePlan?.targetPrice ?? null }
  };
}

function makeLog(severity: 'INFO' | 'WARN' | 'ERROR', component: 'system' | 'market' | 'strategy' | 'execution', event: string, message: string, evaluationId?: string, tradeId?: string): LogEntry {
  return {
    id: `log-${Date.now()}-${++logCounter}`,
    timestamp: new Date().toISOString(),
    severity, component, event, message,
    evaluationId: evaluationId ?? null,
    tradeId: tradeId ?? null,
    correlationId: `corr-${++correlationId}`
  };
}

async function start(): Promise<void> {
	const port = globalThis.process.env.PORT ?? globalThis.process.env.API_PORT ?? '3001';
	const uri = globalThis.process.env.MONGODB_URI ?? mongoUriFromCredentialsFile();
	const cutoffTime = globalThis.process.env.NO_NEW_TRADES_AT_OR_AFTER ?? '16:00';
	const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map(Number);
	const riskState = new TradingRiskState({
		tradingDayResolver: calendarTradingDayResolver('America/New_York'),
		stateStore: new JsonFileRiskStateStore(resolve(workspaceDirectory, 'backend/data/risk-state.json')),
		maxDailyLoss: Number(globalThis.process.env.MAX_DAILY_LOSS ?? '1000'),
		cutoffHour: cutoffHour ?? 16,
		cutoffMinute: cutoffMinute ?? 0
	});
	const runtimeHolder: { runtime?: MarketRuntime } = {};
	const getRuntime = () => runtimeHolder.runtime;
	const dataDir = resolve(workspaceDirectory, 'backend', 'data');
	let services;
	if (!uri) {
		logger.warn('MongoDB configuration is unavailable; API starting in degraded local mode.');
		services = createBackendApplicationServices({ riskState, getRuntime, dataDirectory: dataDir });
	} else {
		const database = new MongoDatabase({ uri, databaseName: globalThis.process.env.MONGODB_DATABASE ?? 'es_trading_bot' });
		try {
			services = await createPersistentBackendApplicationServices(database, { riskState, getRuntime });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown MongoDB connection error.';
			logger.warn({ error: message }, 'MongoDB unavailable; API starting in degraded local mode.');
			services = createBackendApplicationServices({ riskState, getRuntime, dataDirectory: dataDir });
		}
	}
	await listenApiServer(createApiServer({ services }), Number(port));
	logger.info({ port: Number(port) }, 'Backend API listening.');

	const instruments: Instrument[] = [];
	if ((globalThis.process.env.ENABLE_ES ?? 'true').toLowerCase() === 'true') instruments.push(ES_SYMBOL);
	if ((globalThis.process.env.ENABLE_MES ?? 'false').toLowerCase() === 'true') instruments.push(MES_SYMBOL);
	for (const symbol of instruments) {
		const runtime = await startInstrumentRuntime(workspaceDirectory, riskState, symbol, services);
		if (runtime && !runtimeHolder.runtime) runtimeHolder.runtime = runtime;
	}
}

async function startInstrumentRuntime(rootDirectory: string, riskState: TradingRiskState, symbol: Instrument, services: BackendApplicationServices): Promise<MarketRuntime | undefined> {
	const { TOPSTEPX_BASE_URL: baseUrl, TOPSTEPX_USERNAME: username, TOPSTEPX_API_KEY: apiKey, TOPSTEPX_ACCOUNT_ID: accountId } = globalThis.process.env;
	const dryRun = (globalThis.process.env.DRY_RUN ?? 'true').toLowerCase() === 'true';
	if (!baseUrl || !username || !apiKey || !accountId) {
		logger.warn(`TopstepX ${symbol} runtime is disabled until TOPSTEPX_BASE_URL, TOPSTEPX_USERNAME, TOPSTEPX_API_KEY, and TOPSTEPX_ACCOUNT_ID are configured.`);
		return undefined;
	}

	const levelsFile = symbol === MES_SYMBOL ? 'backend/levels/mes.csv' : 'backend/levels/es.csv';
	const levelsPath = resolve(rootDirectory, globalThis.process.env.LEVELS_FILE ?? levelsFile);
	if (!existsSync(levelsPath)) {
		logger.warn({ levelsPath }, `TopstepX ${symbol} runtime is disabled because the manual levels file is missing.`);
		return undefined;
	}

	const prices = parseLevelsFromCsv(readFileSync(levelsPath, 'utf8'));
	validateLevelCount(prices);
	const levels: readonly SupportResistanceLevel[] = prices.map((price, index) => ({ id: `manual-${symbol.toLowerCase().replace('/', '')}-${index + 1}`, price, active: true }));
	const config = strategyConfigSchema.parse({
		symbol,
		timeframe: '15m',
		tradingTimezone: globalThis.process.env.TRADING_TIMEZONE ?? 'America/New_York',
		noNewTradesAtOrAfter: globalThis.process.env.NO_NEW_TRADES_AT_OR_AFTER ?? '16:00',
		levels: { source: 'manual_file', minimumCount: 80, maximumCount: 200, selectionPolicy: 'NEAREST_RELEVANT' }
	});
	const adapter = new TopstepXRestAdapter({ baseUrl, username, apiKey, accountId, symbol });
	const provider = new TopstepXPollingMarketProvider(adapter);
	const execution = new TopstepXExecutionProvider(adapter, dryRun);
	const runtime = new MarketRuntime({ provider, execution, levels, config, timeframeMinutes: 15, riskState, onEvent: (event) => {
		if (event.type === 'strategy.evaluated') {
			const evaluation = decisionToEvaluation(event.decision, config);
			services.recordEvaluation(evaluation);
			services.recordLog(makeLog('INFO', 'strategy', 'evaluated', `${event.decision.action} — ${event.decision.evaluation.explanation}`, evaluation.id));
		}
		if (event.type === 'execution.requested') {
			const ev = event.decision.evaluation;
			const side = ev.side?.toLowerCase() === 'short' ? 'short' : 'long';
			const id = `trade-${Date.now()}-${++idCounter}`;
			const trade: Trade = { id, time: new Date().toISOString(), side: side as 'long' | 'short', entry: ev.tradePlan?.entryPrice ?? 0, contracts: config.quantity, pnl: 0, status: 'open' };
			services.recordTrade(trade);
			services.recordLog(makeLog('INFO', 'execution', 'order_submitted', `${side.toUpperCase()} ${config.quantity} lot(s) at ${ev.tradePlan?.entryPrice ?? 'N/A'}`, undefined, id));
		}
		if (event.type === 'candle.completed') {
			services.recordLog(makeLog('INFO', 'market', 'candle_closed', `${symbol} candle closed at ${event.candle.close}`));
		}
		if (event.type === 'market.connected') {
			services.recordLog(makeLog('INFO', 'market', 'connected', `${symbol} market data connected.`));
		}
		if (event.type === 'market.disconnected') {
			services.recordLog(makeLog('WARN', 'market', 'disconnected', `${symbol} market data disconnected: ${event.reason ?? 'unknown'}`));
		}
		if (event.type === 'market.error') {
			services.recordLog(makeLog('ERROR', 'market', 'error', `${symbol} market error: ${event.message}`));
		}
	}});
	await runtime.start();
	logger.info({ instrument: symbol, timeframe: '15m', levels: levels.length, dryRun }, `TopstepX ${symbol} runtime started.`);
	return runtime;
}

void start().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown startup error.';
	logger.error({ error: message }, 'Backend startup failed; API remains unavailable.');
});
