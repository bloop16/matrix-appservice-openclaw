type Task = () => Promise<void>;

export class RoomQueue {
  private readonly queues = new Map<string, Promise<void>>();

  enqueue(roomId: string, task: Task): void {
    const tail = this.queues.get(roomId) ?? Promise.resolve();
    const next = tail.then(() => task()).catch((err: unknown) => {
      process.stderr.write(`[queue] error in room ${roomId}: ${err instanceof Error ? err.message : String(err)}\n`);
    }).finally(() => {
      if (this.queues.get(roomId) === next) {
        this.queues.delete(roomId);
      }
    });
    this.queues.set(roomId, next);
  }
}
