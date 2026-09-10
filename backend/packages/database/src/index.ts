import mongoose, { type Connection, type Model, type Schema } from 'mongoose';
import type { LevelSet, LogEntry, StrategyConfig, StrategyEvaluation, Trade } from '@es-trading/shared';

export interface DatabaseConfig {
  readonly uri: string;
  readonly databaseName: string;
}

export interface DatabaseCollections {
  readonly config: StrategyConfig | null;
  readonly levels: LevelSet | null;
  readonly evaluations: readonly StrategyEvaluation[];
  readonly trades: readonly Trade[];
  readonly logs: readonly LogEntry[];
}

type DocumentShape = Record<string, unknown>;

function model<T extends DocumentShape>(connection: Connection, name: string, schema: Schema<T>): Model<T> {
  return connection.models[name] as Model<T> ?? connection.model<T>(name, schema);
}

const documentSchema = new mongoose.Schema<DocumentShape>({ data: { type: mongoose.Schema.Types.Mixed, required: true } }, { timestamps: true });

export class MongoDatabase {
  private connection: Connection | null = null;
  private configModel: Model<DocumentShape> | null = null;
  private levelsModel: Model<DocumentShape> | null = null;
  private evaluationModel: Model<DocumentShape> | null = null;
  private tradeModel: Model<DocumentShape> | null = null;
  private logModel: Model<DocumentShape> | null = null;

  constructor(private readonly databaseConfig: DatabaseConfig) {}

  async connect(): Promise<void> {
    if (this.connection?.readyState === 1) return;
    this.connection = await mongoose.createConnection(this.databaseConfig.uri, { dbName: this.databaseConfig.databaseName }).asPromise();
    this.configModel = model(this.connection, 'RuntimeConfig', documentSchema);
    this.levelsModel = model(this.connection, 'LevelSet', documentSchema);
    this.evaluationModel = model(this.connection, 'StrategyEvaluation', documentSchema);
    this.tradeModel = model(this.connection, 'Trade', documentSchema);
    this.logModel = model(this.connection, 'LogEntry', documentSchema);
  }

  async close(): Promise<void> {
    await this.connection?.close();
    this.connection = null;
  }

  async load(): Promise<DatabaseCollections> {
    this.requireConnection();
    const [config, levels, evaluations, trades, logs] = await Promise.all([
      this.configModel?.findOne().lean(), this.levelsModel?.findOne().lean(), this.evaluationModel?.find().sort({ createdAt: 1 }).lean(), this.tradeModel?.find().sort({ createdAt: 1 }).lean(), this.logModel?.find().sort({ createdAt: 1 }).lean()
    ]);
    return {
      config: (config?.data as StrategyConfig | undefined) ?? null,
      levels: (levels?.data as LevelSet | undefined) ?? null,
      evaluations: (evaluations ?? []).map((document) => document.data as StrategyEvaluation),
      trades: (trades ?? []).map((document) => document.data as Trade),
      logs: (logs ?? []).map((document) => document.data as LogEntry)
    };
  }

  async saveConfig(config: StrategyConfig): Promise<void> { await this.replaceSingleton(this.configModel, config); }
  async saveLevels(levels: LevelSet): Promise<void> { await this.replaceSingleton(this.levelsModel, levels); }

  private async replaceSingleton(collection: Model<DocumentShape> | null, data: unknown): Promise<void> {
    this.requireCollection(collection);
    await collection.replaceOne({}, { data }, { upsert: true });
  }

  private requireConnection(): void { if (!this.connection || this.connection.readyState !== 1) throw new Error('MongoDB is not connected.'); }
  private requireCollection<T>(collection: Model<T> | null): asserts collection is Model<T> { this.requireConnection(); if (!collection) throw new Error('MongoDB collections are not initialized.'); }
}
