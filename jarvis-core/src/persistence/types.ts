export interface PersistenceQuery {
  key?: string;
  prefix?: string;
  limit?: number;
  offset?: number;
}

export interface PersistenceEntry {
  key: string;
  value: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PersistenceAdapter {
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(prefix?: string): Promise<string[]>;
  query(query: PersistenceQuery): Promise<PersistenceEntry[]>;

  // Transaction-like batch operations
  batchGet(keys: string[]): Promise<Record<string, any>>;
  batchSet(entries: Record<string, any>): Promise<void>;
}
