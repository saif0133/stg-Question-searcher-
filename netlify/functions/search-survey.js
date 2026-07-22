/* POST /api/search-survey
   يبحث داخل استمارة واحدة ويعيد النصوص المطابقة:
   { matches: [{ matchedText, structurePath }] } */

const { searchSurvey } = require("../../server/src/searchEngine");
const { ok, fail, parseBody, ensurePost, mapSurveyToGoError } = require("./_shared");

exports.handler = async (event) => {
  const methodError = ensurePost(event);
  if (methodError) return methodError;

  const { username, password, surveyId, searchText } = parseBody(event);

  if (!username || !password) {
    return fail(400, "missing_credentials", "Username and password are required.");
  }
  if (!surveyId) {
    return fail(400, "missing_survey", "surveyId is required.");
  }
  if (!searchText || !String(searchText).trim()) {
    return fail(400, "missing_search_text", "searchText is required.");
  }

  try {
    const matches = await searchSurvey({
      username,
      password,
      surveyId,
      searchText: String(searchText).trim(),
    });
    return ok({ matches });
  } catch (error) {
    return mapSurveyToGoError(error);
  }
};
