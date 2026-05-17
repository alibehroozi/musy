import { jsx as _jsx } from "react/jsx-runtime";
import { BucketCard } from "./BucketCard.js";
/**
 * UI-34: 2-column mobile-first grid. Cards are passed in createdAt-desc
 * order from the page; this component is purely structural.
 */
export function BucketGrid({ buckets }) {
    return (_jsx("div", { role: "list", className: "grid grid-cols-2 gap-4", children: buckets.map((b) => (_jsx(BucketCard, { bucket: b }, b.id))) }));
}
