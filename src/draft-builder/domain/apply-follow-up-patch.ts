import type { ExtractedBillingAttempt } from '../../extraction/domain/types';
import { normalize } from '../../classification/domain/rules';
import type { BillingIssue } from './errors';

const ID_NUMBER_GLOBAL = /\b\d{13}\b|\b\d{10}\b/g;

// Zero-LLM fast path for the most common correction-window follow-up: the
// only open problem is the buyer's cédula/RUC and the user replies with just
// the corrected number ("1850137918", "es 1850137918"). Returns the patched
// extraction, or null when the follow-up needs the LLM refine path (product
// issues open, no number, or more than one number — ambiguous).
export function applyFollowUpPatch(
  extracted: ExtractedBillingAttempt,
  issues: BillingIssue[],
  text: string,
): ExtractedBillingAttempt | null {
  const onlyIdentificacionIssues =
    issues.length > 0 &&
    issues.every((issue) => issue.kind === 'identificacion_no_encontrada');
  if (!onlyIdentificacionIssues) return null;

  const numbers = normalize(text).match(ID_NUMBER_GLOBAL) ?? [];
  if (numbers.length !== 1) return null;

  return {
    ...extracted,
    comprador: {
      ...extracted.comprador,
      identificacion: numbers[0],
      // Re-derived from digit count in mergeComprador — never trusted here.
      tipoIdentificacion: null,
    },
  };
}
