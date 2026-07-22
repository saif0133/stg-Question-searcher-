export interface Credentials {
  username: string;
  password: string;
}

export interface Customer {
  id: string;
  name: string;
}

export interface SearchResult {
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  surveyId: string;
  surveyName: string;
  matchedText: string;
  structurePath: string;
}

export interface SearchError {
  level: "customer" | "project" | "survey";
  customerId?: string;
  customerName?: string;
  projectId?: string;
  projectName?: string;
  surveyId?: string;
  surveyName?: string;
  status: number | null;
  error: string;
}

export interface SearchProgress {
  phase: "customer" | "project" | "survey";
  customerName?: string;
  customerIndex?: number;
  customerTotal?: number;
  projectName?: string;
  projectIndex?: number;
  projectTotal?: number;
  surveyName?: string;
  surveyIndex?: number;
  surveyTotal?: number;
}

export interface SearchOutcome {
  cancelled: boolean;
  totalMatches: number;
  totalErrors: number;
  results: SearchResult[];
  errors: SearchError[];
}

export interface ApiError {
  error: string;
  message: string;
}
