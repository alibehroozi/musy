import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { Button, Typography } from "@moc/design-system";
/**
 * UI-33: empty Taste tab — no buckets yet. Drives users into Explore
 * so swipes can seed the auto-bucket builder. The 'Import from Spotify'
 * surface is rendered disabled with a 'Coming soon' caption — a
 * placeholder for the post-MVP integration.
 */
export function EmptyState() {
    const navigate = useNavigate();
    return (_jsxs("main", { className: "flex flex-col items-center justify-center min-h-full px-6 py-12 text-center", children: [_jsx("div", { "aria-hidden": true, className: "w-22 h-22 rounded-full bg-surface border border-border flex items-center justify-center text-4xl mb-6", style: { width: 88, height: 88 }, children: "\uD83C\uDFB5" }), _jsx(Typography, { variant: "h1", className: "mb-2 text-xl", children: "Build your Taste" }), _jsx(Typography, { variant: "body", className: "text-text-muted mb-8 max-w-[260px]", children: "Swipe in Explore to create your buckets \u2014 they'll appear here once we have enough signal." }), _jsxs("div", { className: "w-full max-w-[280px] flex flex-col gap-3", children: [_jsx(Button, { variant: "primary", size: "lg", onClick: () => navigate("/explore"), className: "w-full justify-center min-h-11", children: "Go to Explore \u2192" }), _jsx(Button, { variant: "ghost", size: "lg", disabled: true, "aria-disabled": "true", className: "w-full justify-center min-h-11 border border-border", children: "Import from Spotify" }), _jsx(Typography, { variant: "caption", className: "text-text-muted -mt-1", children: "Coming soon" })] })] }));
}
