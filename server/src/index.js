/* =========================================================
   Fastify server (unified full-stack)

   One process serves BOTH:
     - the API routes under /api
     - the built React app in web/dist

   - لا قاعدة بيانات
   - لا حسابات مستخدمين
   - لا جلسات / JWT
   - بيانات الدخول تُستخدم فقط للاتصال بـ SurveyToGo
   - تسجيل جسم الطلب معطّل حتى لا تُكتب كلمات المرور في السجلات
========================================================= */

const path = require("path");
const fs = require("fs");
const Fastify = require("fastify");
const fastifyStatic = require("@fastify/static");
const { registerRoutes } = require("./routes");

// PORT/HOST هي إعدادات خادم فقط (وليست بيانات دخول).
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// نحلّ مسار web/dist اعتمادًا على موقع هذا الملف، لا على مجلد التشغيل.
// __dirname = server/src  ->  ../../web/dist
const DIST_DIR = path.resolve(__dirname, "../../web/dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");

async function buildServer() {
  const app = Fastify({
    // نحصر حجم الجسم لتجنّب الإفراط
    bodyLimit: 25 * 1024 * 1024,

    logger: {
      level: process.env.LOG_LEVEL || "info",

      // Fastify لا يسجّل جسم الطلب افتراضيًا.
      // نضيف طبقات حماية إضافية:
      //  - مُسلسِل يُخرج الميثود والمسار فقط (بلا رؤوس أو جسم)
      //  - إخفاء أي حقول حساسة إن ظهرت في السجل لأي سبب
      redact: {
        paths: [
          "req.body.password",
          "req.body.username",
          "req.headers.authorization",
        ],
        censor: "[redacted]",
      },

      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
          };
        },
      },
    },
  });

  /* ---------------------------------------------------------
     فحص الصحة (أعلى المستوى، وليس تحت /api)
     GET /health -> { "status": "ok" }
  --------------------------------------------------------- */
  app.get("/health", async () => ({ status: "ok" }));

  /* ---------------------------------------------------------
     مسارات الـ API — تُسجَّل قبل الواجهة الأمامية.
     (POST نفسها لا يلتقطها موزّع الملفات الثابتة الذي يخدم GET فقط.)
  --------------------------------------------------------- */
  registerRoutes(app);

  /* ---------------------------------------------------------
     خدمة الواجهة الأمامية المبنية (web/dist).

     في التطوير قد لا يكون web/dist موجودًا لأن Vite يخدم الواجهة
     ويمرّر /api و /health إلى هذا الخادم؛ عندها نخدم الـ API فقط.
  --------------------------------------------------------- */
  const hasBuild = fs.existsSync(INDEX_HTML);

  if (hasBuild) {
    await app.register(fastifyStatic, {
      root: DIST_DIR,
      // الملفات الموجودة تُخدم مباشرةً؛ الطلبات غير الموجودة تسقط إلى
      // معالج 404 أدناه لتطبيق آلية توجيه SPA.
    });

    // SPA fallback:
    //   GET غير مبدوء بـ /api وليس /health وليس ملفًا موجودًا -> index.html
    // ولا نُحوّل مسارات الـ API المفقودة إلى HTML.
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split("?")[0];

      const isApi = pathname.startsWith("/api");
      const isHealth = pathname === "/health";

      if (request.method === "GET" && !isApi && !isHealth) {
        return reply.type("text/html").sendFile("index.html");
      }

      return reply.code(404).send({
        error: "not_found",
        message: "Route not found.",
      });
    });
  } else {
    app.log.warn(
      `web/dist not found at ${DIST_DIR}. Serving API only (build the frontend with "npm run build" for production).`
    );
  }

  return app;
}

async function start() {
  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`SurveyToGo search app listening on http://${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
