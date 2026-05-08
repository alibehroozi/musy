import { type KeyboardEvent, useCallback } from "react";
import { Input, Button } from "@moc/design-system";
import { useSearch } from "./useSearch.js";
import { useHistory } from "./useHistory.js";
import { useInterestActions } from "./useInterestActions.js";
import { SuggestionsBlock } from "./components/SuggestionsBlock.js";
import { HistoryList, HistorySkeleton } from "./components/HistoryList.js";
import { ResultsSkeleton } from "./components/ResultsSkeleton.js";
import { ResultsList } from "./components/ResultsList.js";
import { SignInModal } from "./components/SignInModal.js";

export function SearchPage(): JSX.Element {
  const { query, setQuery, state, submit, submitWithQuery, retry, clear } = useSearch();
  const { entries, hasMore, isLoading: isHistoryLoading, loadMore, refresh } = useHistory();
  const { modalOpen, closeSignInModal, handleRowTap, handleSave } = useInterestActions();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        submit();
        refresh();
      }
    },
    [submit, refresh],
  );

  const handleClear = useCallback(() => {
    clear();
    refresh();
  }, [clear, refresh]);

  const isIdle = state.status === "idle" && query === "";
  const showHistorySkeleton = isIdle && isHistoryLoading;
  const showHistory = isIdle && !isHistoryLoading && entries.length > 0;
  const showSuggestions = isIdle && !isHistoryLoading && entries.length === 0;

  return (
    <main className="flex flex-col h-full">
      {/* Sticky search input */}
      <div className="sticky top-0 z-10 bg-bg px-3 pt-4 pb-3 border-b border-border">
        <Input
          variant="search"
          size="lg"
          placeholder="Search tracks, artists, stations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onClear={handleClear}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {showHistorySkeleton && <HistorySkeleton />}

        {showHistory && (
          <HistoryList
            entries={entries}
            hasMore={hasMore}
            onSelect={submitWithQuery}
            onLoadMore={loadMore}
          />
        )}

        {showSuggestions && <SuggestionsBlock onSelect={submitWithQuery} />}

        {state.status === "loading" && <ResultsSkeleton />}

        {state.status === "success" && (
          <ResultsList data={state.data} onRowTap={handleRowTap} onSave={handleSave} />
        )}

        {state.status === "error" && (
          <div className="px-4 py-8 text-center space-y-3">
            <p className="text-text">Couldn&apos;t search right now. Try again.</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Sign-in modal (for anonymous users attempting interactions) */}
      <SignInModal open={modalOpen} onClose={closeSignInModal} />
    </main>
  );
}
