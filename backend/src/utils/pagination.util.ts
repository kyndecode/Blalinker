export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPaginationParams(query: Record<string, unknown>): PaginationParams {
  const page  = Math.max(1, Number(query.page)  || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  return { page, limit };
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function getSkip({ page, limit }: PaginationParams): number {
  return (page - 1) * limit;
}
