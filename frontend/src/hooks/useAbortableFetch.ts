import { useRef, useCallback } from "react";

export function useAbortableFetch() {
  const controllerRef = useRef<AbortController | null>(null);

  const getSignal = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current.signal;
  }, []);

  return { getSignal };
}
