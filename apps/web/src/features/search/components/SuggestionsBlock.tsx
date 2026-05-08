import { Button } from "@moc/design-system";

const SUGGESTIONS = ["Daft Punk", "Lo-fi beats", "BBC Radio 1", "Radiohead"] as const;

interface SuggestionsBlockProps {
  onSelect: (query: string) => void;
}

export function SuggestionsBlock({ onSelect }: SuggestionsBlockProps): JSX.Element {
  return (
    <div className="px-4 py-6" data-testid="suggestions-block">
      <p className="text-sm text-text-muted mb-3">Try searching for…</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button key={s} variant="ghost" size="sm" onClick={() => onSelect(s)}>
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
