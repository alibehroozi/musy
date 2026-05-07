import { Routes, Route, Navigate } from "react-router-dom";
import { ExplorePage } from "./features/explore/ExplorePage.js";
import { TastePage } from "./features/taste/TastePage.js";
import { SearchPage } from "./features/search/SearchPage.js";

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/search" replace />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/taste" element={<TastePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="*" element={<Navigate to="/search" replace />} />
    </Routes>
  );
}
