import { logger } from '@es-trading/logging';
import { createApiServer, listenApiServer } from './http';
import { createBackendApplicationServices, createPersistentBackendApplicationServices } from './services';
import { MongoDatabase } from '@es-trading/database';
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
	const port = globalThis.process.env.API_PORT ?? '3001';
	const uri = globalThis.process.env.MONGODB_URI ?? mongoUriFromCredentialsFile();
	let services;
	if (!uri) {
		logger.warn('MongoDB configuration is unavailable; API starting in degraded local mode.');
		services = createBackendApplicationServices();
	} else {
		const database = new MongoDatabase({ uri, databaseName: globalThis.process.env.MONGODB_DATABASE ?? 'es_trading_bot' });
		try {
			services = await createPersistentBackendApplicationServices(database);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown MongoDB connection error.';
			logger.warn({ error: message }, 'MongoDB unavailable; API starting in degraded local mode.');
			services = createBackendApplicationServices();
		}
	}
	await listenApiServer(createApiServer({ services }), Number(port));
	logger.info({ port: Number(port) }, 'Local backend API listening.');
}

void start().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown startup error.';
	logger.error({ error: message }, 'Backend startup failed; API remains unavailable.');
});
