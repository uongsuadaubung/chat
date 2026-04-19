import { FILE_CHUNK_SIZE } from '$lib/features/webrtc/webrtc.constant';
import ReaderWorker from '$lib/core/workers/fileReader.worker.ts?worker';

// Khởi tạo global Worker pool để đẩy tác vụ đọc file sang CPU phụ
let fileWorker: Worker | null = null;
let reqCounter = 0;
const workerPromises = new Map<
  number,
  { resolve: (data: ArrayBuffer) => void; reject: (err: Error) => void }
>();

export function initWorker() {
  if (!fileWorker && typeof window !== 'undefined') {
    fileWorker = new ReaderWorker();
    fileWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'CHUNK_READ') {
        const handlers = workerPromises.get(payload.reqId);
        if (handlers) {
          handlers.resolve(payload.data);
          workerPromises.delete(payload.reqId);
        }
      } else if (type === 'ERROR') {
        const handlers = workerPromises.get(payload.reqId);
        if (handlers) {
          handlers.reject(new Error(payload.error));
          workerPromises.delete(payload.reqId);
        }
      }
    };
  }
}

// Cải tiến đọc Binary bằng Web Worker (Tránh đơ Main Thread hoàn toàn)
export function readSliceAsArrayBuffer(file: File, index: number): Promise<ArrayBuffer> {
  initWorker();
  return new Promise((resolve, reject) => {
    const reqId = reqCounter++;
    workerPromises.set(reqId, { resolve, reject });
    fileWorker!.postMessage({
      type: 'READ_CHUNK',
      payload: { file, index, chunkSize: FILE_CHUNK_SIZE, reqId }
    });
  });
}
