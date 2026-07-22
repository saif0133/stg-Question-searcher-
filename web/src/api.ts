import type {
  ApiError,
  Credentials,
  Customer,
  SearchError,
  SearchOutcome,
  SearchProgress,
  SearchResult,
} from "./types";

/*
 A small typed error we can inspect in the UI.
 The message is safe to show to the user; it never contains credentials.
*/
export class SurveyApiError extends Error {
  code: string;
  status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

/*
 POST JSON to a same-origin /api endpoint and return the parsed JSON.
 On failure it throws a SurveyApiError carrying the HTTP status.
*/
async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new SurveyApiError(
      "network_error",
      "Unable to connect to the server. Please try again."
    );
  }

  if (!response.ok) {
    let data: Partial<ApiError> = {};
    try {
      data = (await response.json()) as ApiError;
    } catch {
      // no JSON body
    }
    throw new SurveyApiError(
      data.error || "request_failed",
      data.message || `Request failed (status ${response.status}).`,
      response.status
    );
  }

  return (await response.json()) as T;
}

/*
 POST /api/customers
 Verifies the SurveyToGo request can be completed and returns customers.
*/
export async function fetchCustomers(
  credentials: Credentials
): Promise<Customer[]> {
  const data = await postJson<{ customers: Customer[] }>(
    "/api/customers",
    credentials
  );
  return data.customers;
}

interface SearchHandlers {
  onProgress: (progress: SearchProgress) => void;
  signal: AbortSignal;
}

type NamedItem = { id: string; name: string };

function statusOf(error: unknown): number | null {
  return error instanceof SurveyApiError ? error.status : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/*
 Runs the whole search from the browser as a sequence of short requests:
 for each selected customer -> its projects -> each project's surveys ->
 search each survey. This keeps every backend call well within a serverless
 function's time limit (Netlify), while preserving the exact matching logic.

 Because each request already waits the SurveyToGo rate-limit delay before
 calling the API, awaiting them sequentially keeps us under 2 requests/second
 without any extra client-side delay.

 Progress is reported per customer/project/survey, cancellation is honoured
 between every step, and partial results are returned if cancelled.
*/
export async function executeSearch(
  credentials: Credentials,
  searchText: string,
  customers: Customer[],
  handlers: SearchHandlers
): Promise<SearchOutcome> {
  const { onProgress, signal } = handlers;

  const results: SearchResult[] = [];
  const errors: SearchError[] = [];
  const seen = new Set<string>();
  let cancelled = false;

  const stopIfCancelled = () => {
    if (signal.aborted) {
      cancelled = true;
      throw new DOMException("Aborted", "AbortError");
    }
  };

  try {
    for (let ci = 0; ci < customers.length; ci += 1) {
      stopIfCancelled();
      const customer = customers[ci];

      onProgress({
        phase: "customer",
        customerName: customer.name,
        customerIndex: ci + 1,
        customerTotal: customers.length,
      });

      let projects: NamedItem[];
      try {
        const data = await postJson<{ projects: NamedItem[] }>(
          "/api/projects",
          { ...credentials, customerId: customer.id },
          signal
        );
        projects = data.projects;
      } catch (error) {
        if (isAbortError(error)) throw error;
        errors.push({
          level: "customer",
          customerId: customer.id,
          customerName: customer.name,
          status: statusOf(error),
          error: messageOf(error),
        });
        continue;
      }

      for (let pi = 0; pi < projects.length; pi += 1) {
        stopIfCancelled();
        const project = projects[pi];

        onProgress({
          phase: "project",
          customerName: customer.name,
          customerIndex: ci + 1,
          customerTotal: customers.length,
          projectName: project.name,
          projectIndex: pi + 1,
          projectTotal: projects.length,
        });

        let surveys: NamedItem[];
        try {
          const data = await postJson<{ surveys: NamedItem[] }>(
            "/api/surveys",
            { ...credentials, projectId: project.id },
            signal
          );
          surveys = data.surveys;
        } catch (error) {
          if (isAbortError(error)) throw error;
          errors.push({
            level: "project",
            customerId: customer.id,
            customerName: customer.name,
            projectId: project.id,
            projectName: project.name,
            status: statusOf(error),
            error: messageOf(error),
          });
          continue;
        }

        for (let si = 0; si < surveys.length; si += 1) {
          stopIfCancelled();
          const survey = surveys[si];

          onProgress({
            phase: "survey",
            customerName: customer.name,
            customerIndex: ci + 1,
            customerTotal: customers.length,
            projectName: project.name,
            projectIndex: pi + 1,
            projectTotal: projects.length,
            surveyName: survey.name,
            surveyIndex: si + 1,
            surveyTotal: surveys.length,
          });

          try {
            const data = await postJson<{
              matches: { matchedText: string; structurePath: string }[];
            }>(
              "/api/search-survey",
              { ...credentials, surveyId: survey.id, searchText },
              signal
            );

            for (const match of data.matches) {
              const key = `${survey.id}|${match.matchedText.trim().toLowerCase()}`;
              if (seen.has(key)) continue;
              seen.add(key);

              results.push({
                customerId: customer.id,
                customerName: customer.name,
                projectId: project.id,
                projectName: project.name,
                surveyId: survey.id,
                surveyName: survey.name,
                matchedText: match.matchedText,
                structurePath: match.structurePath,
              });
            }
          } catch (error) {
            if (isAbortError(error)) throw error;
            errors.push({
              level: "survey",
              customerId: customer.id,
              customerName: customer.name,
              projectId: project.id,
              projectName: project.name,
              surveyId: survey.id,
              surveyName: survey.name,
              status: statusOf(error),
              error: messageOf(error),
            });
          }
        }
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      cancelled = true;
    } else {
      throw error;
    }
  }

  return {
    cancelled,
    totalMatches: results.length,
    totalErrors: errors.length,
    results,
    errors,
  };
}

/*
 POST /api/export
 Sends the current results and downloads a UTF-8 (BOM) CSV file.
*/
export async function exportCsv(results: SearchResult[]): Promise<void> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });

  if (!response.ok) {
    throw new SurveyApiError("export_failed", "Unable to export the results.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "survey-search-results.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
