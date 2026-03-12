# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-12

### Added
- Required `physical` metadata in both raw and mapped metadata outputs:
  - `BomItem.physical`
  - `BomSummaryItem.physical`
  - `AssemblyNode.physical`
  - `ConvertedNode.physical`
- New shared `PhysicalProps` type: `{ surfaceArea: number | null; volume: number | null }`.
- Per-part physical property computation from OCCT B-Rep (`BRepGProp`) with:
  - unit conversion to output units (meters-based),
  - cached computation by product id,
  - `volume` normalization with absolute value.
- New conversion warning: `physical/unavailable` when part physical values cannot be computed.
- Extended unit tests for physical metadata computation, fallback behavior, and coverage paths.

### Changed
- `OpenCascadeConverter.createNodeMap` and `OpenCascadeConverter.createBom` now accept an optional `unitScaleToMeters` option for deterministic physical-value scaling.

### Breaking
- `physical` fields are required in BOM and node-map contracts (values are nullable but fields are always present).

## [0.1.2] - 2026-02-28

### Changed
- Version bump to `0.1.2`.

## [0.1.1] - 2026-02-28

### Added
- Simplified conversion flows.
- API documentation generation and published API docs.
- Test and CI workflow improvements.
- Prepublish build check.

### Changed
- Version bump to `0.1.1`.

[0.2.0]: https://github.com/ilkeozi/opencascade-convert/compare/v0.1.2...feature/physical-metadata
[0.1.2]: https://github.com/ilkeozi/opencascade-convert/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ilkeozi/opencascade-convert/releases/tag/v0.1.1
