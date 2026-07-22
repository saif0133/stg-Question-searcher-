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
 The NDJSON events the backend streams from POST /api/search/stream.
 Each line of the response is exactly one of these objects.
*/
type StreamEvent =
  | ({ type: "progress" } & SearchProgress)
  | { type: "result"; result: SearchResult }
  | {
      type: "done";
      cancelled: boolean;
      totalMatches: number;
      totalErrors: number;
      errors: SearchError[];
    }
  | { type: "error"; error: string; message: string };

/*
 A small typed error we can inspect in the UI.
 The message is safe to show to the user; it never contains credentials.
*/
export class SurveyApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function readApiError(response: Response): Promise<never> {
  let body: Partial<ApiError> = {};

  try {
    body = (await response.json()) as ApiError;
  } catch {
    // response had no JSON body
  }

  if (response.status === 401 || response.status === 403) {
    throw new SurveyApiError(
      body.error || "invalid_credentials",
      body.message || "Invalid SurveyToGo username or password."
    );
  }

  throw new SurveyApiError(
    body.error || "request_failed",
    body.message || `Request failed (status ${response.status}).`
  );
}

/*
 POST /api/customers
 Verifies the SurveyToGo request can be completed and returns customers.
*/
export async function fetchCustomers(
  credentials: Credentials
): Promise<Customer[]> {
  let response: Response;

  try {
    response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new SurveyApiError(
      "network_error",
      "Unable to connect to the server. Please try again."
    );
  }

  if (!response.ok) {
    await readApiError(response);
  }

  const data = (await response.json()) as { customers: Customer[] };
  return data.customers;
}

interface StreamHandlers {
  onProgress: (progress: SearchProgress) => void;
  signal: AbortSignal;
}

/*
 POST /api/search/stream
 Streams NDJSON progress lines, then resolves with the final outcome.
 Credentials travel only inside the POST body.
*/
export async function streamSearch(
  credentials: Credentials,
  searchText: string,
  customerIds: string[],
  handlers: StreamHandlers
): Promise<SearchOutcome> {
  let response: Response;

  try {
    response = await fetch("/api/search/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...credentials,
        searchText,
        customerIds,
      }),
      signal: handlers.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new SurveyApiError(
      "network_error",
      "Unable to connect to the server. Please try again."
    );
  }

  if (!response.ok) {
    await readApiError(response);
  }

  if (!response.body) {
    throw new SurveyApiError("stream_error", "The server returned no data.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  // Results arrive incrementally as "result" events; the "done" event
  // carries the final totals, non-fatal errors, and cancel flag.
  const collectedResults: SearchResult[] = [];
  let doneEvent: {
    cancelled: boolean;
    totalMatches: number;
    totalErrors: number;
    errors: SearchError[];
  } | null = null;
  let streamError: SurveyApiError | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // A partial/truncated line (e.g. a dropped connection) is ignored so it
    // cannot crash the reader; a missing terminal event is handled below.
    let payload: StreamEvent;
    try {
      payload = JSON.parse(trimmed) as StreamEvent;
    } catch {
      return;
    }

    switch (payload.type) {
      case "progress":
        handlers.onProgress(payload);
        break;
      case "result":
        collectedResults.push(payload.result);
        break;
      case "done":
        doneEvent = {
          cancelled: payload.cancelled,
          totalMatches: payload.totalMatches,
          totalErrors: payload.totalErrors,
          errors: payload.errors,
        };
        break;
      case "error":
        streamError = new SurveyApiError(payload.error, payload.message);
        break;
      default:
        break;
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // A chunk may contain several lines, or split a single line across reads;
    // we only process a line once its trailing "\n" has arrived.
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  // Flush any complete final line that arrived without a trailing newline.
  buffer += decoder.decode();
  if (buffer.trim()) {
    handleLine(buffer);
  }

  // An explicit error event always wins.
  if (streamError) {
    throw streamError;
  }

  // Only when the connection closed with neither a "done" nor an "error".
  if (!doneEvent) {
    throw new SurveyApiError("stream_error", "Search stream ended unexpectedly.");
  }

  const finished: {
    cancelled: boolean;
    totalMatches: number;
    totalErrors: number;
    errors: SearchError[];
  } = doneEvent;

  const outcome: SearchOutcome = {
    cancelled: finished.cancelled,
    totalMatches: finished.totalMatches,
    totalErrors: finished.totalErrors,
    results: collectedResults,
    errors: finished.errors,
  };

  return outcome;
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
