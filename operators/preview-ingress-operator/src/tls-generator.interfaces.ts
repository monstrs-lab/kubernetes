export interface TlsGenerator {
  apply(namespace: string, name: string, host: string): Promise<void>
  delete(namespace: string, name: string): Promise<void>
}
