import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EmissionTimeoutJobDto } from './dto/emission-timeout-job.dto';

// Guards against Core API accepting an emitir() call and then never firing a
// comprobante.autorizado/rechazado webhook back — e.g. SRI itself is down
// and Core API's own SRI job dies internally with no failure webhook. Without
// this, the conversation sits in 'submitting' until Redis TTLs quietly
// expire it, with the user never told anything went wrong.
//
// Job id is prefixed to stay out of the 'comprobante-event' jobs' id space
// (those are keyed by claveAcceso). InvoiceEmissionProcessor checks
// pendingEmissionStore for this same correlationId when the delay elapses —
// if the webhook already arrived (or a newer emission superseded this one,
// see PendingEmissionStore's known emisorId-only limitation), it's a no-op.
@Injectable()
export class EmissionWatchdogService {
  constructor(
    @InjectQueue('invoice-emission-events')
    private readonly queue: Queue<EmissionTimeoutJobDto>,
    private readonly config: ConfigService,
  ) {}

  async scheduleTimeout(params: EmissionTimeoutJobDto): Promise<void> {
    const timeoutSeconds = this.config.get<number>(
      'EMISSION_CONFIRMATION_TIMEOUT_SECONDS',
      300,
    );
    await this.queue.add('emission-timeout', params, {
      jobId: `timeout-${params.correlationId}`,
      delay: timeoutSeconds * 1000,
    });
  }
}
