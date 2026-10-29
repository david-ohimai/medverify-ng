# Reference photos — genuine packs

The AI compares every scanned pack with these photos (task `compare_pack`). One folder per product, named by its NAFDAC number; files named by the side of the pack they show:

```
reference/
├── A4-1234/
│   ├── front-1.jpg
│   └── back-1.jpg
└── X9-0001/          ← fictional demo product (drawn by npm run demo-images)
    └── front-1.jpg
```

- **Only genuine packs.** Bought from a reputable pharmacy, or confirmed with the manufacturer. A fake used as a reference makes every fake look genuine.
- Names: `front`, `back` or `other`, optionally followed by `-anything` (`front-1.jpg`, `back-blister.jpg`). JPEG, PNG, WebP or HEIC, at least 480 px on the short side.
- Good light, plain background, the whole side in frame, no glare across the text. Straight-on is best; the scans will be at an angle, the reference shouldn't be.
- The product must be in the registry CSVs, or the folder is skipped (demo folders are skipped under `--no-demo`).
- `npm run seed` loads them: each photo is re-encoded to 1024 px with its metadata stripped and stored in `reference_images`. Deleting a file and re-seeding removes it from the database.
- Two references per product are sent with each comparison (one per side first), so the best front and back photos matter more than many photos.
