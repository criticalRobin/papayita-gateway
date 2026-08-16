export interface WhatsappClient {
  sendTextMessage(to: string, body: string): Promise<void>;
}
