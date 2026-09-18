import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `uploadMedia` nói chuyện với hai thứ: API (qua `apiPost`) và thẳng tới bucket
 * (qua `XMLHttpRequest`). Cả hai đều được giả lập ở đây, nên bài test đo đúng thứ
 * khó nhất của module này — thứ tự các bước, và chuyện gì xảy ra khi một part rớt.
 */
vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly code?: string,
      readonly status?: number,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    apiPost: vi.fn(),
    api: { post: vi.fn() },
  };
});

const { apiPost, api } = await import('@/lib/api');
const { uploadMedia } = await import('./api');

const PART_SIZE = 5 * 1024 * 1024;

/** Một lần gọi PUT sẽ diễn ra thế nào. Mặc định: thành công. */
type Attempt =
  | { kind: 'ok'; etag?: string }
  /** Đi được một nửa rồi đứt — đúng ca "mất mạng giữa chừng". */
  | { kind: 'dropped' }
  /** Chưa byte nào đi: CORS chặn từ preflight. */
  | { kind: 'blocked' }
  /** Bucket trả lời nhưng từ chối. */
  | { kind: 'refused'; status: number }
  /** Lên được nhưng trình duyệt không đọc được ETag (thiếu ExposeHeaders). */
  | { kind: 'noEtag' };

/** URL → kịch bản cho từng lần thử, theo thứ tự. Hết thì mặc định thành công. */
let plan: Map<string, Attempt[]>;
let puts: string[];

function nextAttempt(url: string): Attempt {
  return plan.get(url)?.shift() ?? { kind: 'ok' };
}

class FakeXhr {
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  private url = '';
  private etag: string | null = null;
  private stopped = false;

  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  getResponseHeader(name: string) {
    return name.toLowerCase() === 'etag' ? this.etag : null;
  }
  abort() {
    this.stopped = true;
    queueMicrotask(() => this.onabort?.());
  }

  send(body: Blob) {
    puts.push(this.url);
    const attempt = nextAttempt(this.url);
    const progress = (loaded: number) =>
      this.upload.onprogress?.({ loaded, total: body.size, lengthComputable: true } as ProgressEvent);

    queueMicrotask(() => {
      if (this.stopped) return;
      switch (attempt.kind) {
        case 'dropped':
          progress(Math.floor(body.size / 2));
          this.onerror?.();
          return;
        case 'blocked':
          this.onerror?.();
          return;
        case 'refused':
          this.status = attempt.status;
          this.onload?.();
          return;
        case 'noEtag':
          progress(body.size);
          this.status = 200;
          this.etag = null;
          this.onload?.();
          return;
        default:
          progress(body.size);
          this.status = 200;
          this.etag = attempt.etag ?? `"etag-${this.url.slice(-1)}"`;
          this.onload?.();
      }
    });
  }
}

/** Vé multipart cho một file `size` byte. */
function multipartTicket(size: number) {
  const parts = Math.ceil(size / PART_SIZE);
  return {
    uploadUrl: '',
    url: 'https://bucket/uploads/2026-09-18/abc-clip.mp4',
    name: 'clip.mp4',
    contentType: 'video/mp4',
    size,
    headers: {},
    expiresInSeconds: 3600,
    uploadId: 'upload-1',
    key: 'uploads/2026-09-18/abc-clip.mp4',
    partSize: PART_SIZE,
    partUrls: Array.from({ length: parts }, (_, i) => `https://bucket/part/${i + 1}`),
  };
}

/** Một File giả có `size` và `slice()` thật, không cần cấp phát bộ nhớ thật. */
function fakeFile(size: number): File {
  return {
    name: 'clip.mp4',
    type: 'video/mp4',
    size,
    slice: (start: number, end: number) => ({ size: end - start }) as Blob,
  } as unknown as File;
}

/** Trả lời của API theo route, để mỗi test chỉ khai thứ nó quan tâm. */
function routeApi(ticket: unknown, complete: unknown = { url: 'https://bucket/final.mp4' }) {
  vi.mocked(apiPost).mockImplementation(async (path: string) => {
    if (path === '/uploads/presign') return ticket as never;
    if (path === '/uploads/multipart/complete') return complete as never;
    return { ok: true } as never;
  });
}

beforeEach(() => {
  plan = new Map();
  puts = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.mocked(api.post).mockResolvedValue({
    data: { data: { url: 'https://bucket/via-api.mp4', name: 'clip.mp4', contentType: 'video/mp4', size: 1 } },
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('uploadMedia — đường multipart', () => {
  it('gửi đủ từng part rồi mới gọi complete để ghép lại', async () => {
    const size = 2 * PART_SIZE + 1000;
    routeApi(multipartTicket(size));

    const result = await uploadMedia(fakeFile(size));

    expect(puts).toEqual([
      'https://bucket/part/1',
      'https://bucket/part/2',
      'https://bucket/part/3',
    ]);
    // File chỉ tồn tại sau khi ghép — complete mới là bước kết thúc, không phải part cuối.
    expect(apiPost).toHaveBeenCalledWith('/uploads/multipart/complete', {
      key: 'uploads/2026-09-18/abc-clip.mp4',
      uploadId: 'upload-1',
      etags: ['"etag-1"', '"etag-2"', '"etag-3"'],
    });
    expect(result.url).toBe('https://bucket/final.mp4');
  });

  it('part đứt giữa chừng thì gửi lại **đúng part đó**, các part khác giữ nguyên', async () => {
    vi.useFakeTimers();
    const size = 2 * PART_SIZE;
    routeApi(multipartTicket(size));
    plan.set('https://bucket/part/2', [{ kind: 'dropped' }]);

    const promise = uploadMedia(fakeFile(size));
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    // Part 1 đi một lần; part 2 đi hai lần. Đây chính là chỗ presigned-url một
    // phát không làm được: ở đó đứt là mất cả file.
    expect(puts.filter((u) => u.endsWith('/part/1'))).toHaveLength(1);
    expect(puts.filter((u) => u.endsWith('/part/2'))).toHaveLength(2);
  });

  it('thử lại tối đa 3 lần cho một part rồi mới chịu thua', async () => {
    vi.useFakeTimers();
    const size = PART_SIZE + 10;
    routeApi(multipartTicket(size));
    plan.set('https://bucket/part/1', [{ kind: 'dropped' }, { kind: 'dropped' }, { kind: 'dropped' }]);

    const promise = uploadMedia(fakeFile(size)).catch((e) => e as Error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await promise;

    expect(puts.filter((u) => u.endsWith('/part/1'))).toHaveLength(3);
    expect((error as Error).message).toMatch(/Connection lost/);
    // Mạng hỏng thì đường API cũng hỏng — không vòng lại, báo thật cho người dùng.
    expect(api.post).not.toHaveBeenCalled();
    // Và dọn các part đã nằm trên bucket.
    expect(apiPost).toHaveBeenCalledWith('/uploads/multipart/abort', {
      key: 'uploads/2026-09-18/abc-clip.mp4',
      uploadId: 'upload-1',
    });
  });

  it('CORS chặn (chưa byte nào đi) thì không thử lại — vòng qua API ngay', async () => {
    const size = 2 * PART_SIZE;
    routeApi(multipartTicket(size));
    plan.set('https://bucket/part/1', [{ kind: 'blocked' }, { kind: 'blocked' }]);
    plan.set('https://bucket/part/2', [{ kind: 'blocked' }, { kind: 'blocked' }]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await uploadMedia(fakeFile(size));

    expect(result.url).toBe('https://bucket/via-api.mp4');
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('bucket không cho đọc ETag thì coi như không dùng được — vòng qua API', async () => {
    const size = 2 * PART_SIZE;
    routeApi(multipartTicket(size));
    plan.set('https://bucket/part/1', [{ kind: 'noEtag' }]);
    plan.set('https://bucket/part/2', [{ kind: 'noEtag' }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await uploadMedia(fakeFile(size));

    expect(result.url).toBe('https://bucket/via-api.mp4');
    expect(warn.mock.calls[0]?.[0]).toMatch(/ETag/);
  });

  it('hủy giữa chừng thì dừng hẳn, không ghép và không vòng qua API', async () => {
    const size = 3 * PART_SIZE;
    routeApi(multipartTicket(size));
    const controller = new AbortController();
    controller.abort();

    await expect(uploadMedia(fakeFile(size), undefined, controller.signal)).rejects.toMatchObject({
      name: 'CanceledError',
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalledWith('/uploads/multipart/complete', expect.anything());
  });

  it('thanh tiến trình chỉ chạm 100 sau khi ghép xong, không phải sau part cuối', async () => {
    const size = 2 * PART_SIZE;
    routeApi(multipartTicket(size));
    const seen: number[] = [];

    await uploadMedia(fakeFile(size), (p) => seen.push(p));

    expect(Math.max(...seen.slice(0, -1))).toBeLessThanOrEqual(99);
    expect(seen.at(-1)).toBe(100);
  });
});

describe('uploadMedia — file nhỏ vẫn đi một PUT', () => {
  it('không mở multipart khi API trả về uploadUrl', async () => {
    routeApi({
      uploadUrl: 'https://bucket/direct?sig=x',
      url: 'https://bucket/uploads/shot.png',
      name: 'shot.png',
      contentType: 'image/png',
      size: 1000,
      headers: { 'Content-Type': 'image/png' },
      expiresInSeconds: 3600,
      uploadId: '',
      key: '',
      partSize: 0,
      partUrls: [],
    });

    const result = await uploadMedia(fakeFile(1000));

    expect(puts).toEqual(['https://bucket/direct?sig=x']);
    expect(result.url).toBe('https://bucket/uploads/shot.png');
    expect(apiPost).not.toHaveBeenCalledWith('/uploads/multipart/complete', expect.anything());
  });
});
