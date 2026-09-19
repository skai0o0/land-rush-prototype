"""Script to create / verify manifests for landmarks and HQs."""
import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANDMARKS_DIR = ROOT / "client" / "public" / "models" / "landmarks"
HQS_DIR = ROOT / "client" / "public" / "models" / "hqs"

def verify_and_sync():
    print(f"Checking models in {LANDMARKS_DIR} and {HQS_DIR}...")
    
    # Check landmarks
    landmarks = [
        "cho_dem.glb", "cong_chinh.glb", "doc_tinh.glb", "duong_danh_nhan.glb",
        "ho_da.glb", "ktx_khu_a.glb", "ktx_khu_b.glb", "nha_dieu_hanh.glb",
        "nvh_sinh_vien.glb", "tram_xe_buyt.glb"
    ]
    print("\n--- 10 LANDMARK GLBs ---")
    lm_ok = True
    for lm in landmarks:
        path = LANDMARKS_DIR / lm
        if path.exists():
            size_kb = path.stat().st_size / 1024.0
            print(f"  [OK] {lm:<20} {size_kb:>8.2f} KB")
        else:
            print(f"  [FAIL] {lm:<20} MISSING")
            lm_ok = False

    # Check HQs
    hqs = [
        "hcmut_hq.glb", "hcmus_hq.glb", "hcmussh_hq.glb", "uit_hq.glb",
        "uel_hq.glb", "iu_hq.glb", "uhs_hq.glb", "ubb_hq.glb",
        "uflis_hq.glb", "ulpa_hq.glb"
    ]
    print("\n--- 10 SCHOOL HQ GLBs ---")
    hq_ok = True
    for hq in hqs:
        path = HQS_DIR / hq
        if path.exists():
            size_kb = path.stat().st_size / 1024.0
            print(f"  [OK] {hq:<20} {size_kb:>8.2f} KB")
        else:
            print(f"  [FAIL] {hq:<20} MISSING")
            hq_ok = False

    print("\nManifest verification complete. Status:", "ALL 20 GLBs OK!" if (lm_ok and hq_ok) else "SOME ASSETS MISSING!")

if __name__ == "__main__":
    verify_and_sync()
