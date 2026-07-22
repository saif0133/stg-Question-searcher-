import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card } from "./ui";
import { highlightKeywords } from "./highlight";
import { exportCsv, SurveyApiError } from "../api";
import type { SearchError, SearchResult } from "../types";

const PAGE_SIZE = 25;

export function ResultsTable({
  results,
  errors,
  searchText,
  cancelled,
}: {
  results: SearchResult[];
  errors: SearchError[];
  searchText: string;
  cancelled: boolean;
}) {
  const [within, setWithin] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const customers = useMemo(
    () => uniqueSorted(results.map((r) => r.customerName)),
    [results]
  );

  const projects = useMemo(
    () =>
      uniqueSorted(
        results
          .filter((r) => !customerFilter || r.customerName === customerFilter)
          .map((r) => r.projectName)
      ),
    [results, customerFilter]
  );

  const filtered = useMemo(() => {
    const q = within.trim().toLowerCase();

    return results.filter((r) => {
      if (customerFilter && r.customerName !== customerFilter) return false;
      if (projectFilter && r.projectName !== projectFilter) return false;
      if (q) {
        const haystack = `${r.matchedText} ${r.surveyName} ${r.projectName} ${r.customerName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [results, within, customerFilter, projectFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  function resetFilters() {
    setWithin("");
    setCustomerFilter("");
    setProjectFilter("");
    setPage(0);
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      await exportCsv(filtered);
    } catch (err) {
      setExportError(
        err instanceof SurveyApiError ? err.message : "Unable to export."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card
      title="Results"
      actions={
        <div className="row-gap">
          <Badge tone="accent">{results.length} total</Badge>
          {filtered.length !== results.length && (
            <Badge tone="muted">{filtered.length} shown</Badge>
          )}
          <Button
            variant="primary"
            onClick={handleExport}
            loading={exporting}
            disabled={filtered.length === 0}
          >
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="stack">
        {cancelled && (
          <Alert kind="info" title="Search cancelled">
            These are the partial results collected before the search was
            cancelled.
          </Alert>
        )}

        {errors.length > 0 && (
          <Alert kind="warning" title="Some items could not be searched">
            {errors.length} customer/project/survey request(s) failed. The
            search continued and the results below are from everything that
            succeeded.
          </Alert>
        )}

        {exportError && <Alert kind="error">{exportError}</Alert>}

        {results.length > 0 && (
          <div className="filters">
            <input
              className="field__input"
              type="search"
              placeholder="Search within results…"
              value={within}
              onChange={(e) => {
                setWithin(e.target.value);
                setPage(0);
              }}
              aria-label="Search within results"
            />

            <select
              className="field__input"
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setProjectFilter("");
                setPage(0);
              }}
              aria-label="Filter by customer"
            >
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="field__input"
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(0);
              }}
              aria-label="Filter by project"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {(within || customerFilter || projectFilter) && (
              <Button variant="ghost" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        )}

        {results.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No matches found</p>
            <p className="empty-state__text">
              No questions in the selected customers contained all of your search
              words. Try fewer or different keywords.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">Nothing matches your filters</p>
            <p className="empty-state__text">
              Adjust the search-within box or the filters above.
            </p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Project</th>
                    <th>Survey</th>
                    <th>Survey ID</th>
                    <th>Matched text</th>
                    <th>Structure path</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => (
                    <tr key={`${row.surveyId}-${index}`}>
                      <td>{row.customerName}</td>
                      <td>{row.projectName}</td>
                      <td>{row.surveyName}</td>
                      <td className="mono">{row.surveyId}</td>
                      <td className="matched">
                        {highlightKeywords(row.matchedText, searchText)}
                      </td>
                      <td className="mono path">{row.structurePath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="pagination">
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  Previous
                </Button>
                <span className="pagination__info">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={currentPage >= pageCount - 1}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
