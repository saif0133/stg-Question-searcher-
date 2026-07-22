import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field } from "./ui";
import { fetchCustomers, SurveyApiError } from "../api";
import type { Credentials, Customer } from "../types";

export function CredentialsForm({
  onVerified,
}: {
  onVerified: (credentials: Credentials, customers: Customer[]) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Please enter both your SurveyToGo username and password.");
      return;
    }

    setLoading(true);

    const credentials: Credentials = { username: username.trim(), password };

    try {
      const customers = await fetchCustomers(credentials);
      onVerified(credentials, customers);
    } catch (err) {
      if (err instanceof SurveyApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-narrow">
      <Card
        title="SurveyToGo credentials"
        subtitle="Enter your own SurveyToGo REST API username and password. They are used only to make requests to SurveyToGo and are never stored."
      >
        <form className="stack" onSubmit={handleSubmit} autoComplete="off">
          <Field
            label="SurveyToGo username"
            name="stg-username"
            placeholder="REST-API-KEY/username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          <Field
            label="SurveyToGo password"
            name="stg-password"
            type={showPassword ? "text" : "password"}
            placeholder="Your SurveyToGo password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            trailing={
              <button
                type="button"
                className="link-button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            }
          />

          {error && <Alert kind="error">{error}</Alert>}

          <div className="row-end">
            <Button type="submit" variant="primary" loading={loading}>
              {loading ? "Verifying…" : "Continue"}
            </Button>
          </div>

          <p className="fineprint">
            This only verifies that a SurveyToGo request can be completed. It is
            not an application login, and no account is created.
          </p>
        </form>
      </Card>
    </div>
  );
}
