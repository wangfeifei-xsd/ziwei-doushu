/** Bridge native IPC chunks to the shared SSE reader, including early completion. */
export function createAIByteStream(cancelNative: () => Promise<void>) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() {
      // The SSE reader cancels on [DONE]/response.completed, before Rust's
      // invocation necessarily settles. A canceled stream is already closed.
      closed = true;
      return cancelNative();
    },
  });
  function finish(error?: unknown) {
    if (closed) return;
    closed = true;
    if (error) controller.error(error);
    else controller.close();
  }
  function enqueue(bytes: number[]) {
    if (closed) return;
    if (Math.max(0, -(controller.desiredSize ?? 0)) > 1024) {
      finish(new Error('响应队列过长，已取消请求。'));
      void cancelNative();
      return;
    }
    controller.enqueue(new Uint8Array(bytes));
  }
  return { stream, enqueue, finish };
}
