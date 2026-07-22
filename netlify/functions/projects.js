/* POST /api/projects
   يعيد مشاريع عميل واحد: { projects: [{ id, name }] } */

const { listCustomerProjects } = require("../../server/src/searchEngine");
const { ok, fail, parseBody, ensurePost, mapSurveyToGoError } = require("./_shared");

exports.handler = async (event) => {
  const methodError = ensurePost(event);
  if (methodError) return methodError;

  const { username, password, customerId } = parseBody(event);

  if (!username || !password) {
    return fail(400, "missing_credentials", "Username and password are required.");
  }
  if (!customerId) {
    return fail(400, "missing_customer", "customerId is required.");
  }

  try {
    const projects = await listCustomerProjects({ username, password, customerId });
    return ok({ projects });
  } catch (error) {
    return mapSurveyToGoError(error);
  }
};
