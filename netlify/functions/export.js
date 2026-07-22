/* POST /api/export
   يستقبل النتائج الحالية ويعيد ملف CSV قابل للتنزيل (UTF-8 + BOM).
   نُرمّز الجسم بـ base64 حتى تُحفظ بايتات BOM كما هي وتظهر العربية في Excel. */

const { buildCsv } = require("../../server/src/csv");
const { fail, parseBody, ensurePost } = require("./_shared");

exports.handler = async (event) => {
  const methodError = ensurePost(event);
  if (methodError) return methodError;

  const { results } = parseBody(event);

  if (!Array.isArray(results)) {
    return fail(400, "invalid_results", "results must be an array.");
  }

  const csv = buildCsv(results);
  const buffer = Buffer.from(csv, "utf8");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="survey-search-results.csv"',
    },
    body: buffer.toString("base64"),
    isBase64Encoded: true,
  };
};
