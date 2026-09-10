import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { createBackendApplicationServices, healthSchema, levelsRequestSchema, type BackendApplicationServices } from './services';
import { fixtureSchema, levelsValidationSchema } from './services';
import {
  currentMarketSchema,
  levelSetSchema,
  simulationRequestSchema,
  simulationResultSchema,
  strategyConfigContractSchema,
  systemStatusSchema,
  tradingDayStateSchema,
  type SimulationRequest
} from '@es-trading/shared';

export interface ApiServerOptions {
  readonly services?: BackendApplicationServices;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : undefined;
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('access-control-allow-origin', 'http://localhost:3000');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('vary', 'Origin');
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

function respondDto<T>(response: ServerResponse, status: number, schema: z.ZodType<T>, value: T): void {
  send(response, status, schema.parse(value));
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  const services = options.services ?? createBackendApplicationServices();
  return createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const path = new globalThis.URL(request.url ?? '/', 'http://localhost').pathname;
      if (method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('access-control-allow-origin', 'http://localhost:3000');
        response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
        response.setHeader('access-control-allow-headers', 'content-type');
        response.setHeader('vary', 'Origin');
        response.end();
        return;
      }
      if (method === 'GET' && path === '/health') return respondDto(response, 200, healthSchema, services.getHealth());
      if (method === 'GET' && path === '/api/status') return respondDto(response, 200, systemStatusSchema, services.getStatus());
      if (method === 'GET' && path === '/api/market') return respondDto(response, 200, currentMarketSchema, services.getMarket());
      if (method === 'GET' && path === '/api/config') return respondDto(response, 200, strategyConfigContractSchema, services.getConfig());
      if (method === 'PUT' && path === '/api/config') return respondDto(response, 200, strategyConfigContractSchema, services.updateConfig(await readJson(request)));
      if (method === 'GET' && path === '/api/levels') return respondDto(response, 200, levelSetSchema, services.getLevels());
      if (method === 'PUT' && path === '/api/levels') return respondDto(response, 200, levelSetSchema, services.updateLevels(await readJson(request)));
      if (method === 'POST' && path === '/api/levels/validate') return respondDto(response, 200, levelsValidationSchema, services.validateLevels(await readJson(request)));
      if (method === 'GET' && path === '/api/evaluations') return send(response, 200, services.getEvaluations());
      if (method === 'GET' && path.startsWith('/api/evaluations/')) { const value = services.getEvaluation(path.split('/').pop() ?? ''); return value ? send(response, 200, value) : send(response, 404, { error: 'Evaluation not found.' }); }
      if (method === 'GET' && path === '/api/trades') return send(response, 200, services.getTrades());
      if (method === 'GET' && path.startsWith('/api/trades/')) { const value = services.getTrade(path.split('/').pop() ?? ''); return value ? send(response, 200, value) : send(response, 404, { error: 'Trade not found.' }); }
      if (method === 'GET' && path === '/api/daily-state') return respondDto(response, 200, tradingDayStateSchema, services.getDailyState());
      if (method === 'GET' && path === '/api/logs') return send(response, 200, services.getLogs());
      if (method === 'GET' && path === '/api/simulator/fixtures') return send(response, 200, z.array(fixtureSchema).parse(services.getSimulationFixtures()));
      if (method === 'POST' && path === '/api/simulator/run') { const body: SimulationRequest = simulationRequestSchema.parse(await readJson(request)); return respondDto(response, 200, simulationResultSchema, await services.runSimulation(body)); }
      return send(response, 404, { error: 'Route not found.' });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return send(response, status, { error: error instanceof Error ? error.message : 'Request failed.', issues: error instanceof z.ZodError ? error.issues : undefined });
    }
  });
}

export async function listenApiServer(server: Server, port = 3001): Promise<Server> {
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port);
  });
  return server;
}

export { levelsRequestSchema };