# R2PL world benchmark

Node v24.16.0, win32/x64; Intel(R) Core(TM) i9-14900K, 47.7 GiB RAM. Run at 2026-10-05T11:03:11.065Z. 5 warmups and 40 samples; timings are workstation microbenchmarks.

Dense Uint16 presence: 2,000,000 bytes (1.907 MiB). Fog: 125,000 bytes/school flat; fixed padded chunks use 131,072 bytes/school, 1 MiB for 8 schools / 2 MiB for 16. Legacy display owner buffer remains 1,000,000 bytes. Sparse metadata memory grows with explored tile-school pairs.

| Operation | Median ms | p95 ms | Packet bytes |
|---|---:|---:|---:|
| 10k mutation encode | 0.077 | 0.090 | 80028 |
| 10k mutation decode | 0.132 | 0.183 |  |
| 10k mutation apply (dense buffer) | 0.074 | 0.088 |  |
| 100 mutation encode/decode | 0.005 | 0.008 | 828 |
| 100 mutation validated client apply | 0.013 | 0.051 |  |
| 500 mutation encode/decode | 0.010 | 0.011 | 4028 |
| 500 mutation validated client apply | 0.026 | 0.037 |  |
| 64x64 chunk serialize | 0.051 | 0.151 | 8192 |
| 64x64 chunk deserialize | 0.147 | 0.215 |  |

Event loop delay: mean 15.098 ms, max 16.220 ms (10ms sampling resolution). Observed GC events: 6; total 32.425 ms. Explicit GC available: true. RSS at end: 287.16 MiB.

- 100 simulated client caches: 2.069 ms aggregate apply; allocated dense buffers 190.73 MiB; observed array-buffer delta 190.23 MiB (includes collection of prior tiers).
- 500: skipped by default to avoid allocating 1000 MB of client buffers on the workstation.
- 1000: skipped by default to avoid allocating 2000 MB of client buffers on the workstation.

These tiers allocate full-sized client buffers but touch only the tested chunk; RSS differs from virtual/array-buffer allocations. They simulate client state caches only, not real concurrent sockets, gameplay validation, GPU rendering, SQL throughput, or deployment capacity. Run BENCH_LARGE_TIERS=true explicitly for 500/1000 cache allocation. PostgreSQL latency remains unmeasured without DATABASE_URL.
