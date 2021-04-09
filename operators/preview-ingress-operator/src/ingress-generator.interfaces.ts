export interface IngressGenerator {
  apply(namespace: string, name: string, host: string, port: number, tls?: string): Promise<void>
  delete(namespace: string, name: string): Promise<void>
}
