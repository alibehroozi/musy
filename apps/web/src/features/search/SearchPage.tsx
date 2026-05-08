import { type KeyboardEvent, useCallback } from "react";
import { Input, Button } from "@moc/design-system";
import { useSearch } from "./useSearch.js";
import { SuggestionsBlock } from "./components/SuggestionsBlock.js";
import { ResultsSkeleton } from "./components/ResultsSkeleton.js";
import { ResultsList } from "./components/ResultsList.js";

export function SearchPage(): JSX.Element {
  const { query, setQuery, state, submit, submitWithQuery, retry, clear } = useSearch();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") submit();
    },
    [submit],
  );

  return (
    <main className="flex flex-col h-full">
      {/* Sticky search input */}
      <div className="sticky top-0 z-10 bg-bg px-4 pt-4 pb-3 border-b border-border">
        <Input
          variant="search"
          size="lg"
          placeholder="Search tracks, artists, stations…"
          value={query}
          label="Search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onClear={clear}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {state.status === "idle" && <SuggestionsBlock onSelect={submitWithQuery} />}

        {state.status === "loading" && <ResultsSkeleton />}

        {state.status === "success" && <ResultsList data={state.data} />}

        {state.status === "error" && (
          <div className="px-4 py-8 text-center space-y-3">
            <p className="text-text">Couldn&apos;t search right now. Try again.</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
