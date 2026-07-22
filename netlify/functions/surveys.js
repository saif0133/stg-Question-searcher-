/* POST /api/surveys
   يعيد استمارات مشروع واحد: { surveys: [{ id, name }] } */

const { listProjectSurveys } = require("../../server/src/searchEngine");
const { ok, fail, parseBody, ensurePost, mapSurveyToGoError } = require("./_shared");

exports.handler = async (event) => {
  const methodError = ensurePost(event);
  if (methodError) return methodError;

  const { username, password, projectId } = parseBody(event);

  if (!username || !password) {
    return fail(400, "missing_credentials", "Username and password are required.");
  }
  if (!projectId) {
    return fail(400, "missing_project", "projectId is required.");
  }

  try {
    const surveys = await listProjectSurveys({ username, password, projectId });
    return ok({ surveys });
  } catch (error) {
    return mapSurveyToGoError(error);
  }
};
