export interface TlsGenerator {
  apply(namespace: string, name: string, host: string): Promise<string>
  delete(namespace: string, name: string): Promise<void>
}
