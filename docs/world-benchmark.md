# R2PL world benchmark

Node v24.16.0, win32/x64; Intel(R) Core(TM) i9-14900K, 47.7 GiB RAM. Run at 2026-10-05T09:36:54.562Z. 5 warmups and 40 samples; timings are workstation microbenchmarks.

Dense Uint16 presence: 2,000,000 bytes (1.907 MiB). Fog: 125,000 bytes/school flat; fixed padded chunks use 131,072 bytes/school, 1 MiB for 8 schools / 2 MiB for 16. Legacy display owner buffer remains 1,000,000 bytes. Sparse metadata memory grows with explored tile-school pairs.

| Operation | Median ms | p95 ms | Packet bytes |
|---|---:|---:|---:|
| 10k mutation encode | 0.075 | 0.087 | 80028 |
| 10k mutation decode | 0.129 | 0.287 |  |
| 10k mutation apply (dense buffer) | 0.006 | 0.294 |  |
| 100 mutation encode/decode | 0.002 | 0.004 | 828 |
| 100 mutation validated client apply | 0.012 | 0.035 |  |
| 500 mutation encode/decode | 0.012 | 0.055 | 4028 |
| 500 mutation validated client apply | 0.057 | 0.088 |  |
| 64x64 chunk serialize | 0.212 | 0.418 | 8192 |
| 64x64 chunk deserialize | 0.143 | 0.189 |  |

Event loop delay: mean 26.031 ms, max 67.502 ms (10ms sampling resolution). Observed GC events: 18; total 86.304 ms. Explicit GC available: true. RSS at end: 296.03 MiB.

- 100 simulated client caches: 2.311 ms aggregate apply; allocated dense buffers 190.73 MiB; observed array-buffer delta 190.28 MiB (includes collection of prior tiers).
- 500 simulated client caches: 2.519 ms aggregate apply; allocated dense buffers 953.67 MiB; observed array-buffer delta 954.07 MiB (includes collection of prior tiers).
- 1000 simulated client caches: 9.271 ms aggregate apply; allocated dense buffers 1907.35 MiB; observed array-buffer delta 1360.33 MiB (includes collection of prior tiers).

These tiers allocate full-sized client buffers but touch only the tested chunk; RSS differs from virtual/array-buffer allocations. They simulate client state caches only, not real concurrent sockets, gameplay validation, GPU rendering, SQL throughput, or deployment capacity. Run BENCH_LARGE_TIERS=true explicitly for 500/1000 cache allocation. PostgreSQL latency remains unmeasured without DATABASE_URL.
