export type IntentCategory =
  'greeting' | 'info_request' | 'billing_attempt' | 'out_of_context';

export type ClassificationMethod =
  'rule' | 'embedding' | 'low_confidence_fallback';

export interface ClassificationResult {
  category: IntentCategory;
  confidence: number;
  method: ClassificationMethod;
}
