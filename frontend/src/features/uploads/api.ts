import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Result of a successful upload — the stored file's public URL + metadata. */
export interface UploadedMedia {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Upload one image or short video to the workspace's configured storage and get
 * back its public URL. Plain async (not a hook) so it works anywhere — including
 * the rich-text editor's image tool. Multipart; axios sets the boundary. Errors
 * surface the API message (e.g. "Video is too large — the limit is 30MB.").
 */
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post('/uploads', body);
  return res.data.data as UploadedMedia;
}

/** Mutation wrapper for components that want pending/error state. */
export function useUploadMedia() {
  return useMutation({ mutationFn: uploadMedia });
}
