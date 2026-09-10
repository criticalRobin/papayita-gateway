import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { WebviewSessionGuard } from '../webview-session/webview-session.guard';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import { DraftBuilderService } from './draft-builder.service';
import { ConfirmDraftDto } from './dto/confirm-draft.dto';

@Controller('webview/draft')
@UseGuards(WebviewSessionGuard)
export class DraftBuilderController {
  constructor(private readonly draftBuilderService: DraftBuilderService) {}

  @Get()
  async getDraft(@Req() req: RequestWithWebviewSession) {
    return this.draftBuilderService.getDraft(
      req.webviewSession.phoneNumber,
      req.webviewSession.correlationId!,
    );
  }

  @Post('confirm')
  async confirmDraft(
    @Req() req: RequestWithWebviewSession,
    @Body() dto: ConfirmDraftDto,
  ) {
    await this.draftBuilderService.confirmAndSubmit(
      req.webviewSession.phoneNumber,
      req.webviewSession.correlationId!,
      dto,
    );
    // Matches the documented frontend contract exactly — the assembled
    // Core-API-facing invoice is an internal artifact, never returned here.
    return {
      correlationId: req.webviewSession.correlationId,
      status: 'submitted',
    };
  }
}
