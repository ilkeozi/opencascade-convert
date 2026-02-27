# opencascade-convert

[![Docs](https://img.shields.io/badge/docs-API-blue)](https://ilkeozi.github.io/opencascade-convert/)
[![CI](https://github.com/ilkeozi/opencascade-convert/actions/workflows/ci.yml/badge.svg)](https://github.com/ilkeozi/opencascade-convert/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ilkeozi/opencascade-convert/branch/main/graph/badge.svg)](https://codecov.io/gh/ilkeozi/opencascade-convert)

Browser-first STEP/IGES to glTF/GLB/OBJ conversion on top of `opencascade.js`.
Includes assembly metadata extraction and reusable glTF utilities.

## What it does

- Convert STEP/IGES files in the browser to glTF/GLB/OBJ.
- Extract assembly metadata (BOM + node map) for mapping CAD parts to glTF nodes.
- Provide small glTF utilities for stats, name cleanup, and GLB patching.
- Offer triangulation controls and retry-based safeguards to prevent mesh “triangle explosions.”
- Expose mesh stats so you can balance fidelity and performance for Three.js exports.

## Install

```bash
npm install opencascade-convert
```

This package pins a specific `opencascade.js` build. Do not override it unless you
revalidate conversions, because OCCT behavior (names, triangulation, metadata)
can vary between builds.

When bundling for the browser, make sure your bundler can load
`opencascade.js` `.wasm` assets (see ocjs.org for bundler guides).

## Quick start (simple)

Use the high-level helper when you want a single call that returns GLB + metadata.

```ts
import { createConverter, convertCadBufferToGlbWithMetadata } from 'opencascade-convert/browser';

const converter = await createConverter();

const { glb, metadata, patchedGlb } = convertCadBufferToGlbWithMetadata(
  converter,
  new Uint8Array(fileBytes),
  {
    inputFormat: 'step',
    schemaVersion: 'my-app@1',
    embedMetadataKey: 'myApp',
    validateNodeMap: true,
    validateMesh: true,
  }
);
```

## Advanced example (manual control)

Use the lower-level API when you need custom triangulation attempts, thresholds, or unit overrides.

```ts
import {
  createConverter,
  convertDocumentToGlbWithRetries,
  TRIANGLE_EXPLOSION_THRESHOLDS,
} from 'opencascade-convert/browser';

const converter = await createConverter();
const docHandle = converter.readBuffer(new Uint8Array(fileBytes), 'step', {
  preserveNames: true,
  preserveColors: true,
  preserveLayers: true,
  preserveMaterials: true,
});

const { glb, meshStats, conversionWarnings } = convertDocumentToGlbWithRetries(
  converter,
  docHandle,
  {
    triangulate: {
      linearDeflection: 0.5,
      angularDeflection: 0.35,
      parallel: true,
    },
    attempts: 4,
    triangleExplosionThresholds: {
      ...TRIANGLE_EXPLOSION_THRESHOLDS,
      MAX_TRIANGLES: 2_000_000,
    },
  }
);
```

## API

Main entry: `opencascade-convert/browser`

Converter instance:
- `createConverter()`
- `converter.readBuffer(input, format, options)`
- `converter.triangulate(doc, options)`
- `converter.writeBuffer(docHandle, format, options)`
- `converter.createMetadataFromGlb(docHandle, options)`

High-level helpers:
- `convertDocumentToGlbWithRetries(converter, docHandle, options)`
- `convertCadBufferToGlbWithMetadata(converter, input, options)`

Full API reference:

- https://ilkeozi.github.io/opencascade-convert/

## Assembly metadata

There are two schema families:

- Raw schemas from `createNodeMap` and `createBom`.
- Mapped schemas inside `convertCadBufferToGlbWithMetadata().metadata`, which add glTF indices.

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

Example `mappedNodeMap` (from `metadata.nodeMap`):

```json
{
  "roots": ["0:1"],
  "nodes": {
    "0:1": {
      "id": "0:1",
      "name": "Gear Box",
      "productId": "0:1",
      "parentId": null,
      "childrenIds": ["0:1/0:1:2"],
      "gltfNodeIndex": 0,
      "gltfMeshIndex": 0
    }
  }
}
```

Example `bomSummary` (from `metadata.bom`):

```json
[
  {
    "name": "Flat Washer",
    "quantity": 4,
    "productId": "0:1:2",
    "kind": "part"
  }
]
```

Example `metadata` (from `convertCadBufferToGlbWithMetadata`):

```json
{
  "schemaVersion": "my-app@1",
  "meshStats": {
    "triangles": 12,
    "meshCount": 1,
    "nodeCount": 1,
    "primitiveCount": 1,
    "nodesWithMeshCount": 1,
    "primitivesWithPositionCount": 1
  },
  "conversionWarnings": [],
  "assemblyTree": [
    {
      "id": "0:1",
      "name": "Gear Box",
      "children": []
    }
  ],
  "nodeMap": {
    "roots": ["0:1"],
    "nodes": {
      "0:1": {
        "id": "0:1",
        "name": "Gear Box",
        "productId": "0:1",
        "parentId": null,
        "childrenIds": [],
        "gltfNodeIndex": 0,
        "gltfMeshIndex": 0
      }
    }
  },
  "bom": [
    {
      "name": "Gear Box",
      "quantity": 1,
      "productId": "0:1",
      "kind": "assembly"
    }
  ],
  "units": {
    "inputLengthUnit": "mm",
    "inputUnitSource": "override",
    "outputLengthUnit": "m",
    "scaleToMeters": 0.001
  },
  "boundsMeters": {
    "min": [0, 0, 0],
    "max": [1, 1, 1]
  }
}
```

## Notes

- Names may fall back to OCCT instance IDs (e.g. `NAUO###`) when the source file lacks product names.
- For better names, export AP242 (or enable product/part names) in your CAD tool.
- Large assemblies can take time and memory during triangulation.

## Docs

Hosted API docs:

- https://ilkeozi.github.io/opencascade-convert/

Generate locally:

```bash
npm run docs:api
```

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
