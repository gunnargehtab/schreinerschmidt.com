// Review marks on page copy: a block carries `review: needs-review | placeholder` (+ optional `note`).
// Confirmed or absent means plain text. One helper for every page that renders <ReviewMark>.
import type { Status } from './content-schema';

export type ReviewMarkStatus = Exclude<Status, 'confirmed'>;

/** The mark for a bare review status; `undefined` when confirmed or absent. */
export const markOf = (review: Status | undefined): ReviewMarkStatus | undefined =>
  review === 'needs-review' || review === 'placeholder' ? review : undefined;

/** The mark for a copy block (`{ review?, note? }`); `undefined` when confirmed or absent. */
export const marked = (block: { review?: Status | undefined }): ReviewMarkStatus | undefined => markOf(block.review);
