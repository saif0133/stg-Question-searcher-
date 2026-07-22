import { type FormEvent } from "react";
import { Alert, Button, Card, Spinner } from "./ui";
import type { SearchProgress } from "../types";

function progressLabel(progress: SearchProgress | null): string {
  if (!progress) return "Starting…";

  const parts: string[] = [];

  if (progress.customerName) {
    parts.push(
      `Customer ${progress.customerIndex}/${progress.customerTotal}: ${progress.customerName}`
    );
  }
  if (progress.phase !== "customer" && progress.projectName) {
    parts.push(`Project: ${progress.projectName}`);
  }
  if (progress.phase === "survey" && progress.surveyName) {
    parts.push(
      `Survey ${progress.surveyIndex}/${progress.surveyTotal}: ${progress.surveyName}`
    );
  }

  return parts.join("  •  ");
}

export function SearchPanel({
  searchText,
  onSearchTextChange,
  onSearch,
  onCancel,
  searching,
  progress,
  selectedCount,
  error,
}: {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSearch: () => void;
  onCancel: () => void;
  searching: boolean;
  progress: SearchProgress | null;
  selectedCount: number;
  error: string | null;
}) {
  const canSearch = selectedCount > 0 && searchText.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSearch && !searching) onSearch();
  }

  return (
    <Card
      title="Question search"
      subtitle="Enter a keyword, several keywords, a phrase, or a full question. All words you enter must appear in the matched text, in any order."
    >
      <form className="stack" onSubmit={handleSubmit}>
        <div className="row-between search-bar">
          <input
            className="field__input"
            type="text"
            placeholder="e.g. favorite social media influencer"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            disabled={searching}
            aria-label="Search text"
          />
          {searching ? (
            <Button type="button" variant="danger" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={!canSearch}
              title={
                selectedCount === 0
                  ? "Select at least one customer first"
                  : undefined
              }
            >
              Search
            </Button>
          )}
        </div>

        {selectedCount === 0 && !searching && (
          <p className="fineprint">
            Select at least one customer above to enable search.
          </p>
        )}

        {searching && (
          <div className="progress" aria-live="polite">
            <Spinner small />
            <span className="progress__text">{progressLabel(progress)}</span>
          </div>
        )}

        {error && <Alert kind="error">{error}</Alert>}
      </form>
    </Card>
  );
}
