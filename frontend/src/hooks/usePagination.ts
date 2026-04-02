import { useState, useMemo, useCallback } from "react";

interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const { initialPage = 1, initialPageSize = 20 } = options;

  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(
    () => (total > 0 ? Math.ceil(total / pageSize) : 1),
    [total, pageSize],
  );

  const goNext = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(p - 1, 1));
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    total,
    totalPages,
    setTotal,
    setPage,
    goNext,
    goPrev,
    resetPage,
  };
}
