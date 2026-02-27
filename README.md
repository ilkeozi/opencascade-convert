# opencascade-convert

Browser-first STEP/IGES to glTF/GLB/OBJ conversion on top of `opencascade.js`.
Includes assembly metadata extraction and reusable glTF utilities.

## What it does

- Loads OCCT WebAssembly in the browser.
- Reads STEP/IGES buffers into XCAF documents.
- Triangulates geometry with configurable settings.
- Writes glTF/GLB/OBJ buffers.
- Builds assembly metadata (BOM + node map).
- Provides utilities for mesh stats, name cleanup, and triangle explosion policies.

## Design goals

- Browser-first API with no Node.js filesystem dependencies.
- Preserve CAD metadata (names, colors, layers, materials) where OCCT supports it.
- Provide deterministic triangulation controls and a reusable triangle-explosion policy.
- Offer stable assembly metadata extraction (BOM + node map) for downstream mapping.
- Expose small, reusable glTF utilities (name cleanup, mesh stats, GLB patching).
- Keep the public surface minimal and stable for reuse across projects.

## Install

```bash
npm install opencascade-convert
```

This package pins a specific `opencascade.js` build. Do not override it unless you
revalidate conversions, because OCCT behavior (names, triangulation, metadata)
can vary between builds.

When bundling for the browser, make sure your bundler can load
`opencascade.js` `.wasm` assets (see ocjs.org for bundler guides).

## Quick start

```ts
import { createConverter } from 'opencascade-convert/browser';

const converter = await createConverter();
const docHandle = converter.readBuffer(new Uint8Array(fileBytes), 'step', {
  preserveNames: true,
  preserveColors: true,
  preserveLayers: true,
  preserveMaterials: true,
});

converter.triangulate(docHandle.get(), {
  linearDeflection: 1,
  angularDeflection: 0.5,
  parallel: true,
});

const result = converter.writeBuffer(docHandle, 'glb', {
  nameFormat: 'productOrInstance',
});

const { nodeMap, bom } = converter.createMetadataFromGlb(docHandle);
```

## API

Main entry: `opencascade-convert/browser`

Converter instance:
- `createConverter()`
- `converter.readBuffer(input, format, options)`
- `converter.triangulate(doc, options)`
- `converter.writeBuffer(docHandle, format, options)`
- `converter.createNodeMap(docHandle)`
- `converter.createBom(docHandle)`
- `converter.createMetadataFromGlb(docHandle, options)`

Core utilities:
- `summarizeGlbGeometry(glb)`
- `computeBoundsMeters(glb)`
- `maxDimension(bounds)`
- `buildPrettyNameOverridesFromGlb(glb)`
- `buildGltfNodeIndexByOcafEntry(glb)`
- `TRIANGLE_EXPLOSION_THRESHOLDS`
- `getTriangulationForAttempt(input, attemptIndex)`
- `isTriangleExplosion(meshStats, thresholds?)`
- `readInputUnitScaleToMeters(oc, docHandle)`
- `applyLengthUnitConversionToWriter(writer, scaleToMeters)`
- `unitNameFromScale(scaleToMeters)`
- `injectAssetExtrasIntoGlb(glb, extras)`

Types:
- `InputFormat`, `OutputFormat`
- `ConvertBufferResult`
- `BomExport`, `BomItem`, `BomOccurrence`, `NodeMap`

## Assembly metadata

`createNodeMap` and `createBom` provide stable IDs you can map to glTF nodes.

Example `nodeMap`:

```json
{
  "roots": ["0:1"],
  "nodes": {
    "0:1": {
      "id": "0:1",
      "labelEntry": "0:1",
      "name": "Gear Box",
      "kind": "assembly",
      "productId": "0:1",
      "productName": "Gear Box",
      "parentId": null,
      "children": ["0:1/0:1:2"],
      "path": ["0:1"]
    }
  }
}
```

Example `bom`:

```json
{
  "roots": ["0:1"],
  "items": [
    {
      "productId": "0:1:2",
      "productName": "Flat Washer",
      "kind": "part",
      "quantity": 4,
      "instances": [
        {
          "nodeId": "0:1/0:1:2:1",
          "instanceId": "0:1:2:1",
          "name": "Flat Washer",
          "path": ["0:1", "0:1:2:1"]
        }
      ]
    }
  ]
}
```

## Notes

- Names may fall back to OCCT instance IDs (e.g. `NAUO###`) when the source file lacks product names.
- For better names, export AP242 (or enable product/part names) in your CAD tool.
- Large assemblies can take time and memory during triangulation.

## Build

```bash
npm run build
```

## Tests

```bash
npm run test:unit
```

```bash
npm run test:integration
```

Coverage:

```bash
npm run test:coverage
```
