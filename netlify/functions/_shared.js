/* =========================================================
   أدوات مشتركة لدوال Netlify

   - جميع بيانات الدخول تُستقبل داخل جسم POST فقط.
   - لا نُسجّل بيانات الدخول ولا جسم الطلب إطلاقًا.
   - نُعيد رسائل أخطاء آمنة بلا كشف تفاصيل الطلب.
========================================================= */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function ok(payload) {
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function fail(statusCode, error, message) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error, message }),
  };
}

function parseBody(event) {
  if (!event || !event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

// يقبل POST فقط؛ يعيد استجابة خطأ إن كان الميثود مختلفًا، وإلا null.
function ensurePost(event) {
  if (event.httpMethod !== "POST") {
    return fail(405, "method_not_allowed", "Use POST.");
  }
  return null;
}

// تحويل خطأ SurveyToGo إلى استجابة آمنة (نفس تصنيف الخادم الأصلي).
function mapSurveyToGoError(error) {
  const status = error && error.response ? error.response.status : undefined;

  if (status === 401 || status === 403) {
    return fail(
      401,
      "invalid_credentials",
      "Invalid SurveyToGo username or password."
    );
  }

  if (status === 429) {
    return fail(
      429,
      "rate_limited",
      "SurveyToGo is receiving too many requests. Please wait a moment and try again."
    );
  }

  if (status) {
    return fail(
      502,
      "surveytogo_error",
      "SurveyToGo could not complete the request. Please try again."
    );
  }

  return fail(
    503,
    "surveytogo_unreachable",
    "Unable to connect to SurveyToGo. Please try again."
  );
}

module.exports = { ok, fail, parseBody, ensurePost, mapSurveyToGoError };
