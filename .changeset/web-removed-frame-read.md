---
'@e2e-dev/web': patch
---

A read inside an iframe no longer hangs until its timeout when the app removes the iframe while it is being read. `expect(browser.frameLocator('iframe').locator('button')).toBeHidden()` could fail with `operation timed out` instead of passing once the iframe was gone.
