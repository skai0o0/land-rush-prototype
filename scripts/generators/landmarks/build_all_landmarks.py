"""Build all 10 VNUHCM landmark GLBs and print a summary table."""
from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

BUILDERS = [
    ("ho_da", "build_ho_da.py"),
    ("doc_tinh", "build_doc_tinh.py"),
    ("duong_danh_nhan", "build_duong_danh_nhan.py"),
    ("nha_dieu_hanh", "build_nha_dieu_hanh.py"),
    ("nvh_sinh_vien", "build_nvh_sinh_vien.py"),
    ("cho_dem", "build_cho_dem.py"),
    ("ktx_khu_a", "build_ktx_khu_a.py"),
    ("ktx_khu_b", "build_ktx_khu_b.py"),
    ("tram_xe_buyt", "build_tram_xe_buyt.py"),
    ("cong_chinh", "build_cong_chinh.py"),
]


def main():
    results = []
    for landmark_id, filename in BUILDERS:
        path = HERE / filename
        print(f"\n=== Building {landmark_id} ({filename}) ===")
        try:
            runpy.run_path(str(path), run_name="__main__")
            results.append(landmark_id)
        except Exception as exc:
            print(f"[FAIL] {landmark_id}: {exc}")
            results.append(f"FAIL:{landmark_id}")

    # Rewrite clean manifest from whatever was exported
    import _landmark_common as lm

    raw = {}
    if lm.MANIFEST_PATH.exists():
        raw = json.loads(lm.MANIFEST_PATH.read_text(encoding="utf-8"))
    landmarks = raw.get("landmarks", [])
    # order by BUILDERS
    by_id = {}
    for entry in landmarks:
        for lid, _ in BUILDERS:
            if entry.get("id") == f"landmark_{lid}" or entry.get("model_path", "").endswith(f"{lid}.glb"):
                by_id[lid] = entry
    ordered = [by_id[lid] for lid, _ in BUILDERS if lid in by_id]
    manifest = {
        "tile_meters": lm.TILE_METERS,
        "aesthetic": "Chunky Low-Poly, Flat Shading",
        "polygon_budget": f"{lm.POLY_MIN}-{lm.POLY_MAX} triangles",
        "pivot": [0.0, 0.0, 0.0],
        "up_axis_export": "+Y",
        "default_faction_color": lm.FACTION_HEX,
        "landmarks": ordered,
    }
    lm.MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    lm.MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 88)
    print(f"{'ID':<22} {'TRIS':>6} {'KB':>8} {'TILES':>8} {'ROLE':<24} STATUS")
    print("-" * 88)
    for lid, _ in BUILDERS:
        e = by_id.get(lid)
        if not e:
            print(f"{lid:<22} {'—':>6} {'—':>8} {'—':>8} {'MISSING':<24} FAIL")
            continue
        tiles = f"{e['tile_footprint']['width']}x{e['tile_footprint']['depth']}"
        status = "OK"
        if not e.get("poly_budget_ok", True):
            status = "POLY_WARN"
        if not e.get("size_budget_ok", True):
            status = "SIZE_WARN"
        print(
            f"{lid:<22} {e['tris_count']:>6} {e['file_size_kb']:>8.2f} {tiles:>8} "
            f"{e.get('gameplay_role',''):<24} {status}"
        )
    print("=" * 88)
    print(f"Manifest: {lm.MANIFEST_PATH}")
    print(f"Build results: {results}")


if __name__ == "__main__":
    main()
