import { z } from 'zod';

export const extractedBillingAttemptSchema = z.object({
  comprador: z.object({
    tipoIdentificacion: z.string().nullable(),
    identificacion: z.string().nullable(),
    razonSocial: z.string().nullable(),
  }),
  items: z
    .array(
      z.object({
        idCliente: z.string(),
        textoConsulta: z.string(),
        cantidad: z.number(),
        precioMencionado: z.number().nullable(),
      }),
    )
    .min(1),
  precioTotalMencionado: z.number().nullable(),
  formaPagoMencionada: z.string().nullable(),
});

export type ExtractedBillingAttempt = z.infer<
  typeof extractedBillingAttemptSchema
>;
