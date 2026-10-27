# Meterless conformance runners

These runners are copied unchanged from [meterless/meterless](https://github.com/meterless/meterless)
(Apache-2.0, see `LICENSE` in this folder and `NOTICE` at the repository root), commit 1742dec.
They test this repository's own engine implementations in `src/engines/` (Markovian and H-MEM;
the Scout Intent eval harness lives in `evals/scout/`).

```
npm run conformance
```

Saved scorecards are in `results/`.
