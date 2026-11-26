---
'@e2e-dev/moli': patch
---

Releasing a Moli browser waits up to a second for its process group to end after it has to kill it. Before, a wrapper's child could still be running and accepting connections when the release finished.
