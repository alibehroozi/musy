import { useCallback, useState } from "react";
import { recordExplored, recordSaved } from "@moc/web-core";
import type {
  ExploredEventRequest,
  SavedEventRequest,
  SongSnapshot,
  ProviderName,
} from "@moc/contracts";
import { useAuth } from "../../hooks/useAuth.js";

interface RowIdentity {
  source: ProviderName;
  externalId: string;
  snapshot: SongSnapshot;
}

interface InterestActions {
  /** Visible state of the sign-in modal. */
  signInOpen: boolean;
  closeSignIn: () => void;
  /** Tap-anywhere-on-row handler. */
  onExplore: (row: RowIdentity) => void;
  /** Tap-on-add-button handler. */
  onSave: (row: RowIdentity) => void;
}

/**
 * Centralizes the dispatch logic: anonymous → open modal; authed →
 * fire-and-forget POST. Keeps row components dumb.
 *
 * Per the spec: transient network failures are silently dropped (no
 * toast, no rollback). We catch and ignore here so the optimistic UI
 * state stays.
 */
export function useInterestActions(): InterestActions {
  const { state } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  const isAuthed = state.status === "authenticated";

  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  const onExplore = useCallback(
    (row: RowIdentity) => {
      if (!isAuthed) {
        setSignInOpen(true);
        return;
      }
      const body: ExploredEventRequest = {
        source: row.source,
        externalId: row.externalId,
        snapshot: row.snapshot,
      };
      void recordExplored(body).catch(() => {
        // Silently drop — analytics-style call.
      });
    },
    [isAuthed],
  );

  const onSave = useCallback(
    (row: RowIdentity) => {
      if (!isAuthed) {
        setSignInOpen(true);
        return;
      }
      const body: SavedEventRequest = {
        source: row.source,
        externalId: row.externalId,
        snapshot: row.snapshot,
      };
      void recordSaved(body).catch(() => {
        // Silently drop.
      });
    },
    [isAuthed],
  );

  return { signInOpen, closeSignIn, onExplore, onSave };
}
