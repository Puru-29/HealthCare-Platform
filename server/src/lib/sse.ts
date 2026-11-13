import type { Request, Response } from 'express'

// In-process pub/sub over Server-Sent Events. One server instance is enough for
// a district; for multiple instances, back this with Redis pub/sub.

type Channel = string
const subscribers = new Map<Channel, Set<Response>>()

export function subscribe(req: Request, res: Response, channels: Channel[], initial?: { event: string; data: unknown }) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  for (const ch of channels) {
    if (!subscribers.has(ch)) subscribers.set(ch, new Set())
    subscribers.get(ch)!.add(res)
  }
  if (initial) send(res, initial.event, initial.data)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000)
  req.on('close', () => {
    clearInterval(heartbeat)
    for (const ch of channels) {
      const set = subscribers.get(ch)
      set?.delete(res)
      if (set?.size === 0) subscribers.delete(ch)
    }
  })
}

function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function publish(channel: Channel, event: string, data: unknown) {
  for (const res of subscribers.get(channel) ?? []) send(res, event, data)
}

export function subscriberCount(channel: Channel): number {
  return subscribers.get(channel)?.size ?? 0
}

export const channels = {
  incident: (id: string) => `incident:${id}`,
  hospital: (id: string) => `hospital:${id}`,
}
