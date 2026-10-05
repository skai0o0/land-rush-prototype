"""Verify the single retained HCMUT runtime model and its manifest."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "client" / "public" / "models" / "hqs"

def verify():
    manifest = json.loads((MODEL_DIR / "manifest.json").read_text(encoding="utf-8"))
    if set(manifest["schools"]) != {"hcmut"}:
        raise ValueError("Runtime manifest must contain HCMUT only")
    model = MODEL_DIR / "hcmut_hq.glb"
    data = model.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or size != len(data):
        raise ValueError("Invalid HCMUT GLB header")
    if manifest["schools"]["hcmut"]["model"] != "models/hqs/hcmut_hq.glb":
        raise ValueError("Manifest does not reference the retained HCMUT model")
    models = list((ROOT / "client" / "public" / "models").rglob("*.glb"))
    if models != [model]:
        raise ValueError("Unexpected runtime models; HCMUT is the sole retained GLB")
    print(f"HCMUT model verified: {len(data):,} bytes; one runtime GLB")

if __name__ == "__main__":
    verify()  # Missing/invalid assets intentionally produce a nonzero exit code.
