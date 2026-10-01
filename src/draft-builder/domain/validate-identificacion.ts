// Why a buyer identificacion can't be looked up at all. Checked in code
// before any Core API call — a malformed number must never reach the CTA
// (the webview would open with an empty, unverifiable buyer).
export type IdentificacionProblem =
  'faltante' | 'formato' | 'digito_verificador';

const CONSUMIDOR_FINAL = '9999999999999';

// null = looks like a real cédula/RUC (or consumidor final), worth a lookup.
export function findIdentificacionProblem(
  identificacion: string | null,
): IdentificacionProblem | null {
  const digits = (identificacion ?? '').replace(/\D/g, '');
  if (!digits) return 'faltante';
  if (digits === CONSUMIDOR_FINAL) return null;
  // Letters mixed in (e.g. "18501379A8") — separators like "-" are fine.
  if (/[a-z]/i.test(identificacion ?? '')) return 'formato';
  if (digits.length === 10) {
    return isValidCedula(digits) ? null : 'digito_verificador';
  }
  if (digits.length === 13) {
    return isValidRuc(digits) ? null : 'digito_verificador';
  }
  return 'formato';
}

// Province 01-24 (or 30 for Ecuadorians registered abroad), third digit
// < 6 (natural person), mod-10 check digit with coefficients 2,1,2,1,...
function isValidCedula(digits: string): boolean {
  const province = Number(digits.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(digits[2]) >= 6) return false;

  const sum = digits
    .slice(0, 9)
    .split('')
    .reduce((acc, char, index) => {
      const product = Number(char) * (index % 2 === 0 ? 2 : 1);
      return acc + (product > 9 ? product - 9 : product);
    }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}

// Natural-person RUC (third digit < 6) = valid cédula + establecimiento.
// Public (6) and private (9) entity RUCs only get a structural check: SRI
// has issued real RUCs that fail the published mod-11 algorithm, and a
// false rejection here would block a legitimate invoice.
function isValidRuc(digits: string): boolean {
  const province = Number(digits.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;

  const third = Number(digits[2]);
  if (third < 6) {
    return isValidCedula(digits.slice(0, 10)) && digits.slice(10) !== '000';
  }
  if (third === 6) return digits.slice(9) !== '0000';
  if (third === 9) return digits.slice(10) !== '000';
  return false;
}
