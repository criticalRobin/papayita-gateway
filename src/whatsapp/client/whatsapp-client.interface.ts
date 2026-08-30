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
  uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string>;
  sendDocumentMessage(
    to: string,
    mediaId: string,
    filename: string,
    caption?: string,
  ): Promise<void>;
}
