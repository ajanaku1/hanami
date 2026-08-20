import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, hint, children }: FieldProps) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const childProps = isValidElement(children) ? children.props as { id?: string } : {};
  const controlId = childProps.id ?? generatedId;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id: controlId,
        ...(hint ? { "aria-describedby": hintId } : {}),
      })
    : children;
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={controlId}>{label}</label>
      {hint && <span className="ui-field__hint" id={hintId}>{hint}</span>}
      {control}
    </div>
  );
}
