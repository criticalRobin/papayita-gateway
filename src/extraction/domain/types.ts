import { z } from 'zod';

export const extractedBillingAttemptSchema = z.object({
  comprador: z.object({
    tipoIdentificacion: z.string().nullable(),
    identificacion: z.string().nullable(),
  }),
  items: z
    .array(
      z.object({
        idCliente: z.string(),
        textoConsulta: z.string(),
        cantidad: z.number(),
      }),
    )
    .min(1),
});

export type ExtractedBillingAttempt = z.infer<
  typeof extractedBillingAttemptSchema
>;
