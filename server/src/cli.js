/* =========================================================
   واجهة سطر الأوامر (اختيارية)

   تحافظ على السلوك الأصلي: البحث ثم حفظ النتائج في ملفات.
   لكنها الآن تستخدم المحرك المُعاد هيكلته وتُدخل بيانات الدخول
   عند التشغيل بدلًا من أي قيم ثابتة.

   الاستخدام:
     node src/cli.js "influencer"
     node src/cli.js "honor community"

   يُطلب Username و Password عند التشغيل، ويبقيان في الذاكرة فقط
   طوال مدة البحث. لا تُقرأ من متغيّرات البيئة ولا من أي ملف،
   ولا تُخزَّن في أي مكان.
========================================================= */

const fs = require("fs");
const readline = require("readline");
const { listCustomers, searchSelectedCustomers } = require("./searchEngine");
const { buildCsv } = require("./csv");

function askVisible(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let muted = false;

    rl._writeToOutput = function writeToOutput(stringToWrite) {
      if (!muted) {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(query, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });

    // نكتم الإخراج بعد طباعة السؤال حتى لا تظهر كلمة المرور
    muted = true;
  });
}

async function main() {
  const searchText = process.argv.slice(2).join(" ").trim();

  if (!searchText) {
    console.log(`
طريقة الاستخدام:

  node src/cli.js "influencer"
  node src/cli.js "honor community"
`);
    process.exit(1);
  }

  // إدخال بيانات الدخول عند التشغيل — تبقى في الذاكرة فقط
  const username = await askVisible(
    "SurveyToGo Username (REST-API-KEY/username): "
  );
  const password = await askHidden("SurveyToGo Password: ");

  if (!username || !password) {
    console.error("\nيجب إدخال Username و Password.");
    process.exit(1);
  }

  // تحديد العملاء: جميع العملاء المتاحين لبيانات الدخول المُدخلة
  console.log("\nجلب قائمة العملاء...");
  const customers = await listCustomers({ username, password });
  const customerIds = customers.map((customer) => customer.id);
  console.log(`سيتم البحث داخل ${customerIds.length} عميل.`);

  const startedAt = new Date();

  const { results, errors } = await searchSelectedCustomers({
    username,
    password,
    searchText,
    customerIds,
    onProgress: (progress) => {
      if (progress.phase === "survey") {
        process.stdout.write(
          `  فحص: ${progress.customerName} / ${progress.projectName} / ${progress.surveyName}\n`
        );
      }
    },
  });

  const finishedAt = new Date();

  const output = {
    searchText,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalMatches: results.length,
    totalErrors: errors.length,
    results,
    errors,
  };

  fs.writeFileSync(
    "search-results.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );

  fs.writeFileSync("search-results.csv", buildCsv(results), "utf8");

  console.log("\n====================================");
  console.log(`عدد النتائج: ${results.length}`);
  console.log(`عدد الأخطاء: ${errors.length}`);
  console.log("====================================\n");

  console.log("تم حفظ النتائج في:");
  console.log("search-results.json");
  console.log("search-results.csv");
}

main().catch((error) => {
  console.error("\nحدث خطأ:");

  if (error.response?.status) {
    console.error(`HTTP Status: ${error.response.status}`);
  } else {
    console.error(error.message);
  }

  process.exit(1);
});
