import { supabase, isSupabaseConnected } from './supabase';

/**
 * 文件存储服务 — 基于 Supabase Storage
 * 离线模式下使用 Object URL 本地预览
 */

export interface UploadResult {
  url: string | null;
  path: string | null;
  error: string | null;
}

// 离线模式的本地文件存储
const localFiles = new Map<string, string>();

export const storageService = {
  /**
   * 上传文件到存储桶
   * @param bucket - 存储桶名称（如 'avatars', 'documents', 'images'）
   * @param filePath - 文件路径（如 'user-123/avatar.png'）
   * @param file - 要上传的 File 对象
   */
  async upload(bucket: string, filePath: string, file: File): Promise<UploadResult> {
    if (!isSupabaseConnected) {
      // 离线模式：创建本地 Object URL
      const url = URL.createObjectURL(file);
      const key = `${bucket}/${filePath}`;
      localFiles.set(key, url);
      return { url, path: key, error: null };
    }

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (error) {
        console.error(`[Storage] Upload error:`, error.message);
        // 降级到本地
        const url = URL.createObjectURL(file);
        return { url, path: filePath, error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return { url: urlData.publicUrl, path: data.path, error: null };
    } catch (err) {
      const url = URL.createObjectURL(file);
      return { url, path: filePath, error: String(err) };
    }
  },

  /**
   * 删除文件
   */
  async delete(bucket: string, paths: string[]): Promise<{ error: string | null }> {
    if (!isSupabaseConnected) {
      for (const p of paths) {
        const key = `${bucket}/${p}`;
        const url = localFiles.get(key);
        if (url) {
          URL.revokeObjectURL(url);
          localFiles.delete(key);
        }
      }
      return { error: null };
    }

    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) return { error: error.message };
      return { error: null };
    } catch (err) {
      return { error: String(err) };
    }
  },

  /**
   * 获取文件的公开访问 URL
   */
  getPublicUrl(bucket: string, filePath: string): string {
    if (!isSupabaseConnected) {
      return localFiles.get(`${bucket}/${filePath}`) || '';
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  },

  /**
   * 列出存储桶中的文件
   */
  async list(bucket: string, folder?: string): Promise<{ files: { name: string; size: number; url: string }[]; error: string | null }> {
    if (!isSupabaseConnected) {
      const prefix = folder ? `${bucket}/${folder}/` : `${bucket}/`;
      const files = Array.from(localFiles.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, url]) => ({ name: k.split('/').pop() || k, size: 0, url }));
      return { files, error: null };
    }

    try {
      const { data, error } = await supabase.storage.from(bucket).list(folder || '', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });

      if (error) return { files: [], error: error.message };

      const files = (data || [])
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const path = folder ? `${folder}/${f.name}` : f.name;
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
          return {
            name: f.name,
            size: (f.metadata as any)?.size || 0,
            url: urlData.publicUrl,
          };
        });

      return { files, error: null };
    } catch (err) {
      return { files: [], error: String(err) };
    }
  },
};
