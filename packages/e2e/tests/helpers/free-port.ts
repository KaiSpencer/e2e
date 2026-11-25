import { createServer } from 'node:net';

const handedOut = new Set<number>();

/**
 * A loopback port nothing listens on right now, for an app command's readiness
 * endpoint. Never the same port twice in one process: the system picks from a
 * few thousand, so two calls in a row now and then get the same one.
 */
export async function freePort(): Promise<number> {
  for (;;) {
    const port = await unusedPort();
    if (handedOut.has(port)) continue;
    handedOut.add(port);
    return port;
  }
}

/** The port the system picks for a server that closes again. */
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
  return address.port;
}
