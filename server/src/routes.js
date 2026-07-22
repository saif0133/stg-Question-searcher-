/* =========================================================
   مسارات الـ API

   جميع بيانات الدخول تُستقبل داخل جسم الطلب (POST body) فقط،
   ولا تُسجَّل ولا تُعاد داخل رسائل الأخطاء.
========================================================= */

const { listCustomers, searchSelectedCustomers } = require("./searchEngine");
const { buildCsv } = require("./csv");

/*
 تحويل خطأ SurveyToGo إلى استجابة آمنة لا تكشف بيانات الطلب.
*/
function mapSurveyToGoError(error) {
  const status = error?.response?.status;

  // بيانات دخول غير صحيحة
  if (status === 401 || status === 403) {
    return {
      httpStatus: 401,
      body: {
        error: "invalid_credentials",
        message: "Invalid SurveyToGo username or password.",
      },
    };
  }

  // تجاوز حد المعدّل
  if (status === 429) {
    return {
      httpStatus: 429,
      body: {
        error: "rate_limited",
        message:
          "SurveyToGo is receiving too many requests. Please wait a moment and try again.",
      },
    };
  }

  // خطأ آخر من واجهة SurveyToGo — رسالة عامة آمنة (بلا كشف تفاصيل)
  if (status) {
    return {
      httpStatus: 502,
      body: {
        error: "surveytogo_error",
        message: "SurveyToGo could not complete the request. Please try again.",
      },
    };
  }

  // مشكلة اتصال / انقطاع / مهلة (لا يوجد رد HTTP)
  return {
    httpStatus: 503,
    body: {
      error: "surveytogo_unreachable",
      message: "Unable to connect to SurveyToGo. Please try again.",
    },
  };
}

function registerRoutes(app) {
  /* ---------------------------------------------------------
     POST /api/customers
     التحقق من إمكانية إتمام طلب SurveyToGo وإرجاع قائمة العملاء.
  --------------------------------------------------------- */
  app.post("/api/customers", async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.code(400).send({
        error: "missing_credentials",
        message: "Username and password are required.",
      });
    }

    try {
      const customers = await listCustomers({ username, password });

      return reply.send({ customers });
    } catch (error) {
      const mapped = mapSurveyToGoError(error);

      return reply.code(mapped.httpStatus).send(mapped.body);
    }
  });

  /* ---------------------------------------------------------
     POST /api/search
     بحث عادي (بدون بث) يُرجع النتيجة النهائية مطابقة للمواصفات.
  --------------------------------------------------------- */
  app.post("/api/search", async (request, reply) => {
    const validation = validateSearchBody(request.body);

    if (validation.error) {
      return reply.code(400).send(validation.error);
    }

    const { username, password, searchText, customerIds } = validation.value;

    try {
      const { results, errors } = await searchSelectedCustomers({
        username,
        password,
        searchText,
        customerIds,
      });

      return reply.send({
        totalMatches: results.length,
        totalErrors: errors.length,
        results,
        errors,
      });
    } catch (error) {
      const mapped = mapSurveyToGoError(error);

      return reply.code(mapped.httpStatus).send(mapped.body);
    }
  });

  /* ---------------------------------------------------------
     POST /api/search/stream
     نفس البحث لكن مع بث تقدّم العملية (NDJSON) ودعم الإلغاء.
     كل سطر هو كائن JSON مستقل:
       { "type": "progress", ... }
       { "type": "done", totalMatches, totalErrors, results, errors }
       { "type": "error", ... }
  --------------------------------------------------------- */
  app.post("/api/search/stream", async (request, reply) => {
    const validation = validateSearchBody(request.body);

    if (validation.error) {
      return reply.code(400).send(validation.error);
    }

    const { username, password, searchText, customerIds } = validation.value;

    // نتولّى دورة حياة الاستجابة بالكامل عبر reply.raw. نُخبر Fastify
    // بذلك (hijack) حتى لا يحاول إرسال استجابة أخرى بعد انتهاء المعالج،
    // وهو تحديدًا ما كان يقطع الاتصال قبل وصول حدث "done" ويظهر للمستخدم
    // رسالة "Search stream ended unexpectedly".
    reply.hijack();

    const res = reply.raw;

    // اكتشاف قطع الاتصال من طرف المتصفح لإيقاف البحث بأمان
    let clientClosed = false;
    const markClosed = () => {
      clientClosed = true;
    };
    res.on("close", markClosed);
    request.raw.on("aborted", markClosed);

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // كتابة سطر NDJSON واحد بأمان: لا نكتب على اتصال مُغلق أو مُدمَّر،
    // ونبتلع أي خطأ كتابة (مثل EPIPE) بدل أن يُسقط العملية.
    const writeEvent = (payload) => {
      if (clientClosed || res.writableEnded || res.destroyed) {
        return false;
      }
      try {
        return res.write(`${JSON.stringify(payload)}\n`);
      } catch {
        clientClosed = true;
        return false;
      }
    };

    const endStream = () => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.end();
        } catch {
          /* الاتصال مُغلق مسبقًا */
        }
      }
    };

    try {
      const { results, errors, cancelled } = await searchSelectedCustomers({
        username,
        password,
        searchText,
        customerIds,
        onProgress: (progress) => writeEvent({ type: "progress", ...progress }),
        onResult: (result) => writeEvent({ type: "result", result }),
        isCancelled: () => clientClosed,
      });

      // كل بحث ناجح يُنهى دائمًا بحدث "done" نهائي.
      // النتائج نفسها وصلت عبر أحداث "result"، لذا لا نكرّرها هنا.
      writeEvent({
        type: "done",
        cancelled,
        totalMatches: results.length,
        totalErrors: errors.length,
        errors,
      });
    } catch (error) {
      const mapped = mapSurveyToGoError(error);

      // تسجيل آمن: رمز الحالة ونوع الخطأ فقط — بلا Username/Password/جسم الطلب
      request.log.error(
        { status: error?.response?.status ?? null, type: mapped.body.error },
        "search stream failed"
      );

      writeEvent({
        type: "error",
        error: mapped.body.error,
        message: mapped.body.message,
      });
    } finally {
      endStream();
    }
  });

  /* ---------------------------------------------------------
     POST /api/export
     يستقبل النتائج الحالية ويعيد ملف CSV قابل للتنزيل (UTF-8 + BOM).
  --------------------------------------------------------- */
  app.post("/api/export", async (request, reply) => {
    const { results } = request.body || {};

    if (!Array.isArray(results)) {
      return reply.code(400).send({
        error: "invalid_results",
        message: "results must be an array.",
      });
    }

    const csv = buildCsv(results);

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="survey-search-results.csv"'
      )
      .send(csv);
  });
}

/*
 التحقق من صحة جسم طلب البحث.
*/
function validateSearchBody(body) {
  const { username, password, searchText, customerIds } = body || {};

  if (!username) {
    return { error: fieldError("Username is required.") };
  }

  if (!password) {
    return { error: fieldError("Password is required.") };
  }

  if (!searchText || !String(searchText).trim()) {
    return { error: fieldError("Search text is required.") };
  }

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return { error: fieldError("At least one customer must be selected.") };
  }

  return {
    value: {
      username,
      password,
      searchText: String(searchText).trim(),
      customerIds,
    },
  };
}

function fieldError(message) {
  return { error: "validation_error", message };
}

module.exports = { registerRoutes };
