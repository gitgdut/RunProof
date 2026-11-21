# Frontend deploy notes

Built with Vite. `vite.config.ts` sets `base` from `VITE_BASE` (defaults to `/RunProof/` because the
public demo is served from GitHub Pages under that path). Build for a domain root with `VITE_BASE=/`.

```bash
npm install --registry=https://registry.npmjs.org   # npmmirror lagged on rollup 4.68.8, 404s
npm run build          # tsc -b && vite build
# dist/ -> deploy anywhere static (Vercel root, GH Pages /RunProof/)
```

## Known fix: public RPC rate limiting

A cold dashboard load fires dozens of `eth_call`s in parallel; the public Monad RPC answers with HTTP 429,
which aborted the whole `Promise.all` and left every panel at 0. `src/lib/chain.ts` now
batches the transport and routes reads through `rpcCall`, which caps concurrency at 4 and retries
429s with backoff. Keep that wrapper if you refactor the read layer.
