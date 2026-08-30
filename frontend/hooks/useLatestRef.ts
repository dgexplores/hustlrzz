import { useEffect, useRef } from "react";

/**
 * Mirrors a fast-changing value into a ref so a loop, event handler, or
 * interval can always read the latest value without being re-created every
 * time that value changes (which would otherwise mean adding it to an
 * effect's dependency array).
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
