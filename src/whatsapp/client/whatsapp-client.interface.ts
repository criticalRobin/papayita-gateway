export interface WhatsappMedia {
  buffer: Buffer;
  mimeType: string;
}

export interface WhatsappClient {
  sendTextMessage(to: string, body: string): Promise<void>;
  downloadMedia(mediaId: string): Promise<WhatsappMedia>;
}
