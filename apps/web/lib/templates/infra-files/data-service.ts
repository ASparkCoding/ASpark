import { supabase, isSupabaseConnected } from './supabase';

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface ListResult<T> {
  data: T[];
  count: number;
  error: string | null;
}

export interface EntityServiceOptions<T> {
  tableName: string;
  sampleData: T[];
  searchFields?: (keyof T)[];
  defaultOrderBy?: keyof T;
}

export function createEntityService<T extends { id: string }>(
  options: EntityServiceOptions<T>
) {
  const { tableName, sampleData, searchFields = [], defaultOrderBy = 'created_at' as keyof T } = options;

  let localData: T[] = [...sampleData];
  let nextLocalId = 1000;

  return {
    async getAll(params?: {
      search?: string;
      page?: number;
      pageSize?: number;
      orderBy?: keyof T;
      ascending?: boolean;
      filters?: Partial<Record<keyof T, any>>;
    }): Promise<ListResult<T>> {
      const { search, page = 1, pageSize = 20, orderBy = defaultOrderBy, ascending = false, filters } = params || {};

      if (!isSupabaseConnected) {
        let filtered = [...localData];
        if (search && searchFields.length > 0) {
          const s = search.toLowerCase();
          filtered = filtered.filter(item =>
            searchFields.some(f => String(item[f] || '').toLowerCase().includes(s))
          );
        }
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null && value !== '') {
              filtered = filtered.filter(item => item[key as keyof T] === value);
            }
          }
        }
        const start = (page - 1) * pageSize;
        return { data: filtered.slice(start, start + pageSize), count: filtered.length, error: null };
      }

      try {
        let query = supabase.from(tableName).select('*', { count: 'exact' });

        if (search && searchFields.length > 0) {
          const orConditions = searchFields.map(f => `${String(f)}.ilike.%${search}%`).join(',');
          query = query.or(orConditions);
        }

        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null && value !== '') {
              query = query.eq(key, value);
            }
          }
        }

        query = query
          .order(String(orderBy), { ascending })
          .range((page - 1) * pageSize, page * pageSize - 1);

        const { data, error, count } = await query;

        if (error) {
          console.error(`[${tableName}] getAll error:`, error.message);
          return { data: localData.slice(0, pageSize), count: localData.length, error: error.message };
        }

        return { data: (data as T[]) || [], count: count || 0, error: null };
      } catch (err) {
        console.error(`[${tableName}] getAll exception:`, err);
        return { data: localData.slice(0, pageSize), count: localData.length, error: String(err) };
      }
    },

    async getById(id: string): Promise<ServiceResult<T>> {
      if (!isSupabaseConnected) {
        return { data: localData.find(d => d.id === id) || null, error: null };
      }
      try {
        const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
        if (error) return { data: localData.find(d => d.id === id) || null, error: error.message };
        return { data: data as T, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },

    async create(input: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceResult<T>> {
      if (!isSupabaseConnected) {
        const newItem = {
          ...input,
          id: `local-${nextLocalId++}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as T;
        localData.unshift(newItem);
        return { data: newItem, error: null };
      }
      try {
        const { data, error } = await supabase.from(tableName).insert(input as any).select().single();
        if (error) return { data: null, error: error.message };
        return { data: data as T, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },

    async update(id: string, input: Partial<T>): Promise<ServiceResult<T>> {
      if (!isSupabaseConnected) {
        const idx = localData.findIndex(d => d.id === id);
        if (idx === -1) return { data: null, error: 'Not found' };
        localData[idx] = { ...localData[idx], ...input, updated_at: new Date().toISOString() } as T;
        return { data: localData[idx], error: null };
      }
      try {
        const { data, error } = await supabase
          .from(tableName)
          .update({ ...input, updated_at: new Date().toISOString() } as any)
          .eq('id', id)
          .select()
          .single();
        if (error) return { data: null, error: error.message };
        return { data: data as T, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },

    async delete(id: string): Promise<{ error: string | null }> {
      if (!isSupabaseConnected) {
        localData = localData.filter(d => d.id !== id);
        return { error: null };
      }
      try {
        const { error } = await supabase.from(tableName).delete().eq('id', id);
        if (error) return { error: error.message };
        return { error: null };
      } catch (err) {
        return { error: String(err) };
      }
    },

    getSampleData(): T[] {
      return [...sampleData];
    },
  };
}
