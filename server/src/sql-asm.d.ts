// Type declarations for sql.js (missing from the package).
declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: Record<string, any>): Record<string, any>;
    free(): boolean;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  function initSqlJs(config?: Record<string, any>): Promise<SqlJsStatic>;
  export default initSqlJs;
}

// Pure-JS (asm.js) build — no WASM dependency, ideal for pkg packaging.
declare module 'sql.js/dist/sql-asm.js' {
  export * from 'sql.js';
  export { default } from 'sql.js';
}
