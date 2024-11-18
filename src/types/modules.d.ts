declare module 'inquirer' {
  export interface QuestionCollection {
    type: string;
    name: string;
    message: string;
    choices?: string[];
  }

  const inquirer: {
    prompt<T>(questions: QuestionCollection[]): Promise<T>;
  };

  export default inquirer;
}

declare module 'ora' {
  interface Ora {
    start(): Ora;
    stop(): Ora;
    succeed(): Ora;
    fail(): Ora;
  }

  function ora(options: string | { text: string }): Ora;
  export default ora;
}

declare module 'idb' {
  export interface IDBPDatabase<T = any> {
    createObjectStore(
      name: string,
      options?: IDBObjectStoreParameters
    ): IDBObjectStore;
    objectStoreNames: DOMStringList;
    add(storeName: string, value: any): Promise<any>;
    get(storeName: string, key: any): Promise<any>;
    getAll(storeName: string): Promise<any[]>;
  }

  export function openDB<T>(
    name: string,
    version: number,
    options?: {
      upgrade?(db: IDBPDatabase<T>): void;
    }
  ): Promise<IDBPDatabase<T>>;
}
