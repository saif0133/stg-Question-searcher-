import { useRef, useState } from "react";
import { CredentialsForm } from "./components/CredentialsForm";
import { CustomerSelect } from "./components/CustomerSelect";
import { SearchPanel } from "./components/SearchPanel";
import { ResultsTable } from "./components/ResultsTable";
import { Button } from "./components/ui";
import { streamSearch, SurveyApiError } from "./api";
import type {
  Credentials,
  Customer,
  SearchError,
  SearchProgress,
  SearchResult,
} from "./types";

interface SearchState {
  ran: boolean;
  results: SearchResult[];
  errors: SearchError[];
  cancelled: boolean;
  searchTextUsed: string;
}

const EMPTY_SEARCH: SearchState = {
  ran: false,
  results: [],
  errors: [],
  cancelled: false,
  searchTextUsed: "",
};

export function App() {
  // Credentials live only in memory, for the lifetime of the page.
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);

  const abortRef = useRef<AbortController | null>(null);

  function handleVerified(creds: Credentials, list: Customer[]) {
    setCredentials(creds);
    setCustomers(list);
  }

  async function runSearch() {
    if (!credentials) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setSearchError(null);
    setProgress(null);

    const searchTextUsed = searchText.trim();

    try {
      const outcome = await streamSearch(
        credentials,
        searchTextUsed,
        [...selectedIds],
        {
          onProgress: setProgress,
          signal: controller.signal,
        }
      );

      setSearch({
        ran: true,
        results: outcome.results,
        errors: outcome.errors,
        cancelled: outcome.cancelled,
        searchTextUsed,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Cancelled by the user; keep whatever was already shown.
        setSearch((prev) => ({ ...prev, cancelled: prev.ran }));
      } else if (err instanceof SurveyApiError) {
        setSearchError(err.message);
      } else {
        setSearchError("The search failed. Please try again.");
      }
    } finally {
      setSearching(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function cancelSearch() {
    abortRef.current?.abort();
  }

  function handleReset() {
    // Clear credentials and all state from memory.
    abortRef.current?.abort();
    setCredentials(null);
    setCustomers([]);
    setSelectedIds(new Set());
    setSearchText("");
    setSearching(false);
    setProgress(null);
    setSearchError(null);
    setSearch(EMPTY_SEARCH);
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden>
            ⌕
          </span>
          <div>
            <h1 className="app__title">SurveyToGo Question Search</h1>
            <p className="app__tagline">
              Find questions across customers, projects and surveys
            </p>
          </div>
        </div>
        {credentials && (
          <Button variant="secondary" onClick={handleReset}>
            Reset
          </Button>
        )}
      </header>

      <main className="app__main">
        {!credentials ? (
          <CredentialsForm onVerified={handleVerified} />
        ) : (
          <div className="stack-lg">
            <CustomerSelect
              customers={customers}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              disabled={searching}
            />

            <SearchPanel
              searchText={searchText}
              onSearchTextChange={setSearchText}
              onSearch={runSearch}
              onCancel={cancelSearch}
              searching={searching}
              progress={progress}
              selectedCount={selectedIds.size}
              error={searchError}
            />

            {search.ran && (
              <ResultsTable
                results={search.results}
                errors={search.errors}
                searchText={search.searchTextUsed}
                cancelled={search.cancelled}
              />
            )}
          </div>
        )}
      </main>

      <footer className="app__footer">
        Credentials are kept only in memory and are used solely to call the
        SurveyToGo API. Nothing is stored.
      </footer>
    </div>
  );
}
