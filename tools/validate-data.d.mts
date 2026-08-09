/** Result of one full pass over data/. */
export interface DataValidation {
  /** Problems that should fail the build. */
  errors: string[];
  /** Known, deliberately tolerated gaps - see PENDING_ASSETS. */
  notes: string[];
}

export function validateAll(): DataValidation;
