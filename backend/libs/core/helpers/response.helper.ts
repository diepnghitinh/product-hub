/**
 * A flat, paginated list envelope. Controllers return this for list endpoints;
 * the {@link TransformInterceptor} nests it under `data`. Kept flat (items +
 * counters, no nested `meta` object) per the project response convention.
 */
export interface IServiceListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ServiceResponse {
  /** Build a paginated list response, computing `totalPages` from `total`/`limit`. */
  static paginate<T>(
    items: T[],
    total: number,
    page = 1,
    limit = 10,
  ): IServiceListResponse<T> {
    const safeLimit = limit && limit > 0 ? limit : total || 1;
    return {
      items,
      total,
      page: page && page > 0 ? page : 1,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }
}
