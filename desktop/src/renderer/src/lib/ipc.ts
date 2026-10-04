import { IPC } from '@shared/app'

export const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
  window.carrot.invoke<T>(channel, ...args)

export const on = (channel: string, cb: (payload: never) => void): (() => void) =>
  window.carrot.on(channel, cb as (p: unknown) => void)

export { IPC }
