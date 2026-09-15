import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WebviewSessionGuard } from '../webview-session/webview-session.guard';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import { CreditNoteService } from './credit-note.service';
import { ConfirmCreditNoteDto } from './dto/confirm-credit-note.dto';

@Controller('webview/credit-note')
@UseGuards(WebviewSessionGuard)
export class CreditNoteController {
  constructor(private readonly creditNoteService: CreditNoteService) {}

  @Get()
  async getCandidates(@Req() req: RequestWithWebviewSession) {
    return this.creditNoteService.getCandidates(
      req.webviewSession.phoneNumber,
      req.webviewSession.correlationId!,
    );
  }

  @Get(':claveAcceso')
  async getDraft(
    @Req() req: RequestWithWebviewSession,
    @Param('claveAcceso') claveAcceso: string,
  ) {
    return this.creditNoteService.getDraftForClaveAcceso(
      req.webviewSession.phoneNumber,
      req.webviewSession.correlationId!,
      claveAcceso,
    );
  }

  @Post('confirm')
  async confirm(
    @Req() req: RequestWithWebviewSession,
    @Body() dto: ConfirmCreditNoteDto,
  ) {
    await this.creditNoteService.confirmAndSubmit(
      req.webviewSession.phoneNumber,
      req.webviewSession.correlationId!,
      dto,
    );
    return {
      correlationId: req.webviewSession.correlationId,
      status: 'queued',
    };
  }
}
