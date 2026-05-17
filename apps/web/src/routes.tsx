import { Routes, Route, Navigate } from "react-router-dom";
import { ExplorePage } from "./features/explore/ExplorePage.js";
import { TastePage } from "./features/taste/TastePage.js";
import { BucketDetailPage } from "./features/taste/BucketDetailPage.js";
import { SearchPage } from "./features/search/SearchPage.js";
import { AuthPopupComplete } from "./features/auth/AuthPopupComplete.js";

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/search" replace />} />
      <Route path="/auth/popup-complete" element={<AuthPopupComplete />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/taste" element={<TastePage />} />
      <Route path="/taste/buckets/:bucketId" element={<BucketDetailPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="*" element={<Navigate to="/search" replace />} />
    </Routes>
  );
}
