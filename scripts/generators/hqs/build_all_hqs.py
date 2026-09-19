"""Batch-run all 10 VNU HQ generators via Blender headless."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCHOOLS = [
    "hcmut",
    "hcmus",
    "hcmussh",
    "uit",
    "uel",
    "iu",
    "uhs",
    "ubb",
    "uflis",
    "ulpa",
]

HQ_DIR = Path(__file__).resolve().parent
BLENDER = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")


def main():
    if not BLENDER.exists():
        print(f"Blender not found: {BLENDER}", file=sys.stderr)
        sys.exit(1)

    failed = []
    for school in SCHOOLS:
        script = HQ_DIR / f"build_{school}_hq.py"
        print(f"=== Building {school} ({script.name}) ===")
        result = subprocess.run(
            [str(BLENDER), "-b", "-P", str(script)],
            cwd=str(HQ_DIR.parents[2]),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        out = (result.stdout or "") + "\n" + (result.stderr or "")
        print(out[-4000:])
        if result.returncode != 0 or "[HQ]" not in out:
            failed.append(school)

    if failed:
        print(f"FAILED schools: {failed}")
        sys.exit(2)
    print("All HQ builds completed.")


if __name__ == "__main__":
    main()
