type Task = () => Promise<void>;

export class RoomQueue {
  private readonly queues = new Map<string, Promise<void>>();

  enqueue(roomId: string, task: Task): void {
    const tail = this.queues.get(roomId) ?? Promise.resolve();
    const next = tail.then(() => task()).catch(() => {
      // errors are swallowed to keep the chain alive
    }).finally(() => {
      if (this.queues.get(roomId) === next) {
        this.queues.delete(roomId);
      }
    });
    this.queues.set(roomId, next);
  }
}
