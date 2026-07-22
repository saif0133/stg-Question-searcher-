/* =========================================================
   Fastify server

   - لا قاعدة بيانات
   - لا حسابات مستخدمين
   - لا جلسات / JWT
   - بيانات الدخول تُستخدم فقط للاتصال بـ SurveyToGo
   - تسجيل جسم الطلب معطّل حتى لا تُكتب كلمات المرور في السجلات
========================================================= */

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { registerRoutes } = require("./routes");

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";

function buildServer() {
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

  // نسمح للواجهة (Vite) بالوصول أثناء التطوير
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST"],
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  registerRoutes(app);

  return app;
}

async function start() {
  const app = buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`SurveyToGo search API listening on http://${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
