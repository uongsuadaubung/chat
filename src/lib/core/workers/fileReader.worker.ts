/// <reference lib="webworker" />

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'READ_CHUNK') {
    const { file, index, chunkSize, reqId } = payload;
    const slice = file.slice(index * chunkSize, (index + 1) * chunkSize);

    try {
      // FileReaderSync chỉ có sẵn trong môi trường Web Worker để đọc đồng bộ siêu nhanh
      const reader = new FileReaderSync();
      const arrayBuffer = reader.readAsArrayBuffer(slice);

      self.postMessage(
        {
          type: 'CHUNK_READ',
          payload: { reqId, data: arrayBuffer }
        },
        [arrayBuffer]
      ); // Transferable, zero-copy Main-Thread
    } catch (err: unknown) {
      self.postMessage({
        type: 'ERROR',
        payload: { reqId, error: err instanceof Error ? err.message : String(err) }
      });
    }
  }
};
