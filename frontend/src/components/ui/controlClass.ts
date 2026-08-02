/**
 * The redesign's form-control skin, for the controls `Field` cannot wrap:
 * `<select>`, `<textarea>`, and inputs that need to sit inside a custom row
 * (an icon picker beside them, a currency select glued to their left edge).
 *
 * Kept verbatim in step with `Field`'s own input so a select never drifts a
 * shade away from the text box above it. Import this rather than retyping the
 * six classes; `Field` remains the right choice whenever a plain labelled
 * input will do.
 */
export const CONTROL_CLASS =
    'w-full px-3 py-2.5 rounded-sw-row bg-sw-sunk text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 disabled:opacity-45';
