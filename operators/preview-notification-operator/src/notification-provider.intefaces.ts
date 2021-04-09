export interface NotificationProvider {
  notify(source, context, body: string): Promise<void>
}
