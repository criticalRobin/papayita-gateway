export interface WhatsappMedia {
  buffer: Buffer;
  mimeType: string;
}

export interface WhatsappClient {
  sendTextMessage(to: string, body: string): Promise<void>;
  sendCtaMessage(
    to: string,
    bodyText: string,
    buttonText: string,
    url: string,
  ): Promise<void>;
  downloadMedia(mediaId: string): Promise<WhatsappMedia>;
  markAsRead(messageId: string): Promise<void>;
}
