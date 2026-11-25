/**
 * A frame the page removes, reloads, or replaces while a locate reads it. A
 * removed one ends the read with a retryable error instead of holding the step
 * until its deadline for the frame to come back. One that is still there, or
 * back, is read, or fails as retryable.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EngineError, type LocatorExpression } from '@e2e-dev/core/engine';
import { surfaceOf, web } from '../../src/index.ts';
import { ignoreTrace, noSecrets } from '../helpers/secrets.ts';

const DOCUMENT = '<iframe id="outer" srcdoc="<iframe id=\'inner\' srcdoc=\'<button>Nested</button>\'></iframe><button>Outer</button>"></iframe>';

/** The button in the frame chain `selectors`, outermost first. */
function buttonIn(...selectors: readonly string[]): LocatorExpression {
  return selectors.reduceRight<LocatorExpression>(
    (source, selector) => ({ kind: 'frame', selector, source }),
    { kind: 'selector', selector: 'button' },
  );
}

describe('a frame the page removes while it is read', () => {
  const engine = web({});
  const artifactsDir = mkdtempSync(path.join(tmpdir(), 'e2e-removed-frame-'));
  const signal = new AbortController().signal;
  const operation = { signal, timeoutMs: 5_000, runId: 'frames', attemptId: 'attempt', origin: 'test' as const };
  const cleanup = { signal, timeoutMs: 30_000 };
  let page: Page;

  beforeAll(async () => {
    await engine.init!({ runId: 'frames', targetName: 'fixture', projectRoot: process.cwd(), app: {}, env: {}, headed: false, workerSlot: 0, signal, log: () => undefined });
    await engine.startAttempt!({ attemptId: 'attempt', artifactsDir, signal, resolveSecret: noSecrets, ...ignoreTrace });
    await engine.session!.open!('about:blank', operation);
    page = surfaceOf(engine)!.page();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await engine.endAttempt!(cleanup);
    await engine.dispose!(cleanup);
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  /**
   * Runs `change` in the page once the locate has made `counts` frame counts.
   * With `delayMs`, the locate goes on and the change lands under its next reads.
   */
  async function changeAfterCounts(counts: number, change: string, delayMs?: number): Promise<void> {
    vi.restoreAllMocks();
    await page.setContent(DOCUMENT);
    await page.frameLocator('#outer').frameLocator('#inner').locator('button').waitFor();
    const prototype = Object.getPrototypeOf(page.locator('body')) as Locator;
    const { count } = prototype;
    let made = 0;
    vi.spyOn(prototype, 'count').mockImplementation(async function counted(this: Locator) {
      const value = await count.call(this);
      made += 1;
      if (made === counts) await page.evaluate(delayMs === undefined ? change : `void setTimeout(() => { ${change} }, ${delayMs})`);
      return value;
    });
  }

  // Each frame is counted twice: once for the frame, once for whether it is shown.
  it.each([
    { title: 'the frame', frames: ['#outer'], counts: 2 },
    { title: 'the frame around it', frames: ['#outer', '#inner'], counts: 4 },
  ])('fails as retryable without waiting when $title leaves after it was counted', async ({ frames, counts }) => {
    await changeAfterCounts(counts, "document.querySelector('#outer').remove()");
    const startedAt = Date.now();
    await expect(engine.locate!(buttonIn(...frames), operation)).rejects.toMatchObject({ code: 'FRAME_NOT_FOUND', retryable: true });
    expect(Date.now() - startedAt).toBeLessThan(operation.timeoutMs / 2);
  });

  it.each([
    { title: 'reloads', change: "document.querySelector('#outer').srcdoc += ' '" },
    { title: 'is replaced by a copy', change: "const outer = document.querySelector('#outer'); outer.replaceWith(outer.cloneNode())" },
  ])('reads the node, or fails as retryable, when the frame around its frame $title', async ({ change }) => {
    const failures: unknown[] = [];
    for (let round = 0; round < 40; round += 1) {
      await changeAfterCounts(4, change, round % 4);
      await engine.locate!(buttonIn('#outer', '#inner'), operation).catch((cause: unknown) => failures.push(cause));
    }
    expect(failures.filter((cause) => !(cause instanceof EngineError && cause.retryable))).toEqual([]);
  }, 60_000);
});
