/* POST /api/customers
   يتحقق من إمكانية إتمام طلب SurveyToGo ويعيد قائمة العملاء. */

const { listCustomers } = require("../../server/src/searchEngine");
const { ok, fail, parseBody, ensurePost, mapSurveyToGoError } = require("./_shared");

exports.handler = async (event) => {
  const methodError = ensurePost(event);
  if (methodError) return methodError;

  const { username, password } = parseBody(event);

  if (!username || !password) {
    return fail(400, "missing_credentials", "Username and password are required.");
  }

  try {
    const customers = await listCustomers({ username, password });
    return ok({ customers });
  } catch (error) {
    return mapSurveyToGoError(error);
  }
};
