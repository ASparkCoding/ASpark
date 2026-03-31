/** 统一的 Service 返回类型 */
export interface ServiceResult<T> {
  data: T;
  error: string | null;
}

export interface ServiceListResult<T> {
  data: T[];
  count: number;
  error: string | null;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  orderBy?: string;
  ascending?: boolean;
}
