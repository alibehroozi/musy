import { useCallback, useState } from "react";
import type { SearchResult } from "@moc/contracts";
import { useAuthContext } from "../../contexts/AuthContext.js";
import { recordExplored, recordSaved } from "./api.js";

function makeSnapshot(result: SearchResult) {
  if (result.type === "track") {
    return {
      title: result.title,
      artist: result.artist,
      ...(result.artworkUrl !== undefined ? { coverUrl: result.artworkUrl } : {}),
      ...(result.duration !== undefined ? { durationSec: result.duration } : {}),
      kind: "track" as const,
    };
  }
  return {
    title: result.name,
    artist: "",
    ...(result.favicon !== undefined ? { coverUrl: result.favicon } : {}),
    kind: "station" as const,
  };
}

export interface UseInterestActionsReturn {
  modalOpen: boolean;
  openSignInModal: () => void;
  closeSignInModal: () => void;
  handleRowTap: (result: SearchResult) => void;
  handleSave: (result: SearchResult) => void;
}

export function useInterestActions(): UseInterestActionsReturn {
  const { state } = useAuthContext();
  const [modalOpen, setModalOpen] = useState(false);

  const openSignInModal = useCallback(() => setModalOpen(true), []);
  const closeSignInModal = useCallback(() => setModalOpen(false), []);

  const handleRowTap = useCallback(
    (result: SearchResult) => {
      if (state.status !== "authenticated") {
        setModalOpen(true);
        return;
      }
      void recordExplored({
        source: result.provider,
        externalId: result.providerId,
        snapshot: makeSnapshot(result),
      }).catch(() => {});
    },
    [state.status],
  );

  const handleSave = useCallback(
    (result: SearchResult) => {
      if (state.status !== "authenticated") {
        setModalOpen(true);
        return;
      }
      void recordSaved({
        source: result.provider,
        externalId: result.providerId,
        snapshot: makeSnapshot(result),
      }).catch(() => {});
    },
    [state.status],
  );

  return { modalOpen, openSignInModal, closeSignInModal, handleRowTap, handleSave };
}
