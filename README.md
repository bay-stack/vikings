# Vikings football

The practice plan remains at `/`. The wristband builder is at `/playbook/`.

## Playbook builder

- Select a play, then click the right-hand preview to upload or replace its image. The X on that preview clears only the image; notes and number are retained, and Undo restores the image. Choose several files to put the first in the selected slot and the rest in empty slots, or drop files onto a play. PNG, JPEG, and WebP sources up to 20 MB are normalized to a maximum 1,200-pixel edge and 320 KB encoded size.
- Arrange 24 plays in three cards: Outside, Inside top, Inside bottom. Drag to swap or use the slot selector.
- Upload a full 1200 × 1200 Canva template: keep the diagram in the top 874 pixels and the Canva banner in the bottom 326. Square uploads automatically hide the bottom 326 pixels; only the diagram is fitted above the app banner, without stretching. Image format and overlay settings are handled automatically without editor controls. Canva artwork uses the full wristband width with no added side inset and meets the app banner directly; wider coach cells preserve the diagram proportions with space at the sides. Larger square exports use the same crop proportion. Other image shapes fit as whole diagrams. Existing saved images retain their original treatment.
- Edit each play's number, two banner text lines, and banner color. The printed wristband banner remains 0.2 inches tall. With line 2 filled, each text field stays on its own line; shorter labels print more clearly. Leaving line 2 empty retains the original automatic wrapping. Choose Auto fit or a per-play banner text size from 4.5–12 points; manual sizes apply to both word lines and scale up on the coach sheet. The preview and PDFs share measured text layout. Oversized text is flagged in the editor and must be reduced or shortened before PDF export. Text sizes save to the cloud and backups; older playbooks default to Auto fit. Each number and banner text input has its own full-width row.
- Download a one-page Letter wristband PDF: each card's cut rectangle is exactly 310.5 × 144 points, or 4.3125 × 2 inches. Print at Actual size / 100%; verify both 1-inch calibration marks with a ruler.
- Download a one-page Letter coach PDF with the same groups enlarged.
- Save named playbooks to the cloud. The private workspace link is the editing credential; keep it private. It is never included in PDFs or JSON backups.
- Export/import JSON backups. Offline drafts use a Vikings-specific IndexedDB database. Save conflicts preserve local edits and offer cloud reload or a new copy.

## Local development

Requires Node.js 20+.

```sh
npm ci
npm run dev
npm test
npm run build
```

Preview: `http://127.0.0.1:4173/playbook/`. The static build is in `dist/`; GitHub Pages can also serve the repository root directly. The PDF library is pinned in package-lock.json and vendored with its license so the editor has no CDN dependency.

## Cloud isolation

`supabase/migrations/202609080001_vikings_playbooks.sql` creates only Vikings objects; the follow-up Canva migration validates optional second-line and image-format fields while accepting old backups:

- `vikings_private.workspaces` stores SHA-256 hashes of privately provisioned 256-bit editing keys.
- `vikings_private.playbooks` stores each workspace's named playbooks and revisions.
- Three narrowly scoped public RPCs: `vikings_list`, `vikings_load`, `vikings_save`.

Both tables have RLS and no public/client table grants. Anon may execute only these credential-checking RPCs; creation requires an existing workspace key, with a maximum of 30 playbooks per workspace and an 8 MB payload limit. The public Supabase anon key is a client credential, not an editing key. This app does not use MRT staff, roles, authentication, tables, files, or storage buckets. Database infrastructure/quotas are shared.

Workspace provisioning is an administrator operation: generate 32 cryptographically random bytes, hex encode them, and insert only SHA-256 of that UTF-8 hex string into `vikings_private.workspaces.key_hash`. Give the coach `/playbook/#<64-character-key>` privately. The app appends a playbook UUID to links after opening a book. Do not commit the editing key. Losing all private links requires administrator recovery; backups contain plays but no account credentials.

`tests/cloud.sql` verifies RPC round trips, stale revision rejection, workspace isolation, input validation, and denied table access using disposable fixtures rolled back in one transaction. Run with an administrative SQL connection. The deployment already has the migration and one provisioned coach workspace.

## Validation

Node tests cover physical geometry, one-page Letter PDFs, no-scaling viewer preferences, image containment, reordering, import validation, and banner contrast. Generated PDFs were also parsed to verify three exact wristband cut rectangles and all 24 numbers, then rendered and visually inspected with portrait/landscape/wide fixtures. Canva fixtures additionally verify that both PDF formats hide every pixel of a magenta source banner while retaining the bottom edge of the diagram and both editable lines on all 24 plays. Cloud tests cover old payloads and both new optional fields. Printer output still depends on the print dialog; the on-paper calibration check is the final sizing check.

No automated browser interaction testing was requested or performed. Keep the private link on the final deployed origin; the local preview address is reachable only on the computer running the development server.
