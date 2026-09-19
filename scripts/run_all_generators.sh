#!/bin/bash
set -e
mkdir -p client/public/models/landmarks client/public/models/hqs

echo "===> Generating 10 Landmarks..."
for file in scripts/generators/landmarks/*.py; do
    echo "Running Blender on $file..."
    blender --background --python "$file"
done

echo "===> Generating 10 School HQs..."
for file in scripts/generators/hqs/*.py; do
    echo "Running Blender on $file..."
    blender --background --python "$file"
done

echo "===> Generating Manifest files..."
python3 scripts/create_manifests.py
echo "===> Asset Pipeline Completed Successfully!"
