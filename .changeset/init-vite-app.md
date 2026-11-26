---
'e2e': patch
---

`e2e init` detects a Vite app and writes a web target that starts its `dev` script on the port Vite uses: the `--port` of the `vite` command, else 5173. Before, it wrote `localhost:3000`, so the first run of a new Vite project failed. Init keeps the placeholder target and says what to set when it cannot tell where the app answers: the `dev` script starts no Vite dev server, has no fixed port, serves another directory, or names its own `--config`; the root `vite.config.*` sets a different `port`; the dev server serves HTTPS; or the project has a backend Vite only serves assets for (Laravel, Symfony, Rails, Django).
