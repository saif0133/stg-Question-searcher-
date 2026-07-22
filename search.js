const axios = require("axios");
const fs = require("fs");
const readline = require("readline");
const { XMLParser } = require("fast-xml-parser");

/* =========================================================
   الإعدادات
   لا توجد بيانات دخول مخزّنة في هذا الملف.
   يُدخل المستخدم Username و Password عند التشغيل،
   ويبقيان في الذاكرة فقط طوال مدة تشغيل البحث.
========================================================= */

const CONFIG = {
  baseUrl: "https://api.dooblo.net/newapi",

  // تُملأ من إدخال المستخدم عند التشغيل (تبقى في الذاكرة فقط)
  username: "",

  password: "",

  // الحد الأقصى في SurveyToGo هو طلبان في الثانية
  delayBetweenRequests: 650,

  timeout: 120000,
};

/* =========================================================
   إعداد الاتصال
   يُنشأ عميل Axios بعد إدخال بيانات الدخول، وباستخدامها مباشرةً.
========================================================= */

let api = null;

function createApiClient() {
  return axios.create({
    baseURL: CONFIG.baseUrl,
    timeout: CONFIG.timeout,

    auth: {
      username: CONFIG.username,
      password: CONFIG.password,
    },

    headers: {
      Accept: "application/json",
      "Accept-Charset": "utf-8",
    },

    responseType: "text",

    transformResponse: [
      function keepRawResponse(data) {
        return data;
      },
    ],
  });
}

/* =========================================================
   إدخال بيانات الدخول عند التشغيل (بلا تخزين)
   - Username يظهر أثناء الكتابة
   - Password مخفي أثناء الكتابة
   القيم تبقى في الذاكرة فقط ولا تُكتب في أي ملف أو متغيّر بيئة.
========================================================= */

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

async function promptCredentials() {
  const username = await askVisible("SurveyToGo Username (REST-API-KEY/username): ");
  const password = await askHidden("SurveyToGo Password: ");

  return { username, password };
}

/* =========================================================
   أدوات مساعدة
========================================================= */

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function parseResponse(data) {
  if (data === null || data === undefined) {
    return null;
  }

  if (typeof data !== "string") {
    return data;
  }

  const trimmed = data.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // ليست JSON
  }

  if (trimmed.startsWith("<")) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
      parseTagValue: false,
      parseAttributeValue: false,
    });

    try {
      return parser.parse(trimmed);
    } catch {
      // ليست XML صالحة
    }
  }

  return trimmed;
}

async function requestApi(path, options = {}) {
  const {
    params = {},
    accept = "application/json",
    retries = 3,
  } = options;

  await delay(CONFIG.delayBetweenRequests);

  try {
    const response = await api.get(path, {
      params,
      headers: {
        Accept: accept,
        "Accept-Charset": "utf-8",
      },
    });

    return parseResponse(response.data);
  } catch (error) {
    const status = error.response?.status;

    if (status === 429 && retries > 0) {
      console.log("Rate limit 429، إعادة المحاولة...");

      await delay(2500);

      return requestApi(path, {
        params,
        accept,
        retries: retries - 1,
      });
    }

    throw error;
  }
}

function toArray(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "object") {
    return [value];
  }

  /*
   معالجة أشكال مثل:

   {
     Customers: [...]
   }

   أو:

   {
     Customer: [...]
   }
  */

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      return child;
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const nested = toArray(child);

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [value];
}

function getFirstValue(object, possibleKeys) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  const entries = Object.entries(object);

  for (const possibleKey of possibleKeys) {
    const found = entries.find(
      ([key]) =>
        key.toLowerCase() === possibleKey.toLowerCase()
    );

    if (found) {
      return found[1];
    }
  }

  return undefined;
}

function getCustomerId(customer) {
  return getFirstValue(customer, [
    "CustomerID",
    "CustomerId",
    "customerID",
    "customerId",
    "ID",
    "Id",
    "id",
  ]);
}

function getProjectId(project) {
  return getFirstValue(project, [
    "ProjectID",
    "ProjectId",
    "projectID",
    "projectId",
    "ID",
    "Id",
    "id",
  ]);
}

function getSurveyId(survey) {
  return getFirstValue(survey, [
    "SurveyID",
    "SurveyId",
    "surveyID",
    "surveyId",
    "ID",
    "Id",
    "id",
  ]);
}

function getName(item, fallback = "Unknown") {
  return (
    getFirstValue(item, [
      "Name",
      "name",
      "Title",
      "title",
      "CustomerName",
      "ProjectName",
      "SurveyName",
      "Description",
    ]) ?? fallback
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/*
 البحث عن جميع الكلمات، وليس الجملة مطابقة حرفيًا.

 مثال:
 node search.js "honor community"

 يجب أن يحتوي النص على:
 honor
 community
*/
function containsAllKeywords(text, searchText) {
  const normalizedText = normalizeText(text);

  const keywords = normalizeText(searchText)
    .split(" ")
    .filter(Boolean);

  return keywords.every((keyword) =>
    normalizedText.includes(keyword)
  );
}

/* =========================================================
   استخراج النصوص المطابقة
========================================================= */

function findMatches(
  value,
  searchText,
  path = "root",
  matches = [],
  visited = new WeakSet()
) {
  if (value === null || value === undefined) {
    return matches;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = String(value).trim();

    if (text && containsAllKeywords(text, searchText)) {
      matches.push({
        path,
        text,
      });
    }

    return matches;
  }

  if (typeof value !== "object") {
    return matches;
  }

  if (visited.has(value)) {
    return matches;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findMatches(
        item,
        searchText,
        `${path}[${index}]`,
        matches,
        visited
      );
    });

    return matches;
  }

  for (const [key, childValue] of Object.entries(value)) {
    findMatches(
      childValue,
      searchText,
      `${path}.${key}`,
      matches,
      visited
    );
  }

  return matches;
}

/* =========================================================
   تجربة عدة أشكال للـ Endpoint
========================================================= */

async function tryRequests(requests) {
  let lastError;

  for (const request of requests) {
    try {
      return await requestApi(request.path, {
        params: request.params,
        accept: request.accept,
      });
    } catch (error) {
      lastError = error;

      const status = error.response?.status;

      /*
       نستمر فقط إذا كان شكل الرابط غير صحيح أو نوع الإخراج غير مدعوم.
      */
      if (
        status !== 400 &&
        status !== 404 &&
        status !== 405 &&
        status !== 406 &&
        status !== 415
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}

/* =========================================================
   عمليات SurveyToGo
========================================================= */

async function getCustomers() {
  const response = await requestApi("/Customers");

  return toArray(response);
}

/*
 الشكل الصحيح حسب Testbed:

 /CustomerProjects/{customerID}
*/
async function getCustomerProjects(customerId) {
  const encodedId = encodeURIComponent(customerId);

  const response = await tryRequests([
    {
      path: `/CustomerProjects/${encodedId}`,
      accept: "application/json",
    },
    {
      path: "/CustomerProjects",
      params: {
        customerID: customerId,
      },
      accept: "application/json",
    },
  ]);

  return toArray(response);
}

async function getProjectSurveys(projectId) {
  const encodedId = encodeURIComponent(projectId);

  /*
   نجرب وضع Project ID داخل الرابط أولًا،
   ثم نجرب Query Parameter كخيار احتياطي.
  */

  const response = await tryRequests([
    {
      path: `/ProjectSurveys/${encodedId}`,
      accept: "application/json",
    },
    {
      path: "/ProjectSurveys",
      params: {
        projectID: projectId,
      },
      accept: "application/json",
    },
    {
      path: "/ProjectSurveys",
      params: {
        projectId,
      },
      accept: "application/json",
    },
  ]);

  return toArray(response);
}

async function getSurveyStructure(surveyId) {
  const encodedId = encodeURIComponent(surveyId);

  /*
   SimpleSurveyExport قد يدعم JSON أو XML حسب إصدار الـ API.
   نجرب كل الأشكال الممكنة تلقائيًا.
  */

  return tryRequests([
    {
      path: `/SimpleSurveyExport/${encodedId}`,
      accept: "application/json",
    },
    {
      path: `/SimpleSurveyExport/${encodedId}`,
      accept: "text/xml",
    },
    {
      path: "/SimpleSurveyExport",
      params: {
        surveyID: surveyId,
      },
      accept: "application/json",
    },
    {
      path: "/SimpleSurveyExport",
      params: {
        surveyID: surveyId,
      },
      accept: "text/xml",
    },
    {
      path: "/SimpleSurveyExport",
      params: {
        surveyId,
      },
      accept: "application/json",
    },
    {
      path: "/SimpleSurveyExport",
      params: {
        surveyId,
      },
      accept: "text/xml",
    },
  ]);
}

/* =========================================================
   إزالة النتائج المكررة
========================================================= */

function removeDuplicateMatches(matches) {
  const unique = new Map();

  for (const match of matches) {
    const key = [
      match.surveyId,
      normalizeText(match.matchedText),
    ].join("|");

    if (!unique.has(key)) {
      unique.set(key, match);
    }
  }

  return [...unique.values()];
}

/* =========================================================
   البحث في جميع المشاريع والاستمارات
========================================================= */

async function searchAllSurveys(searchText) {
  const results = [];
  const errors = [];

  console.log("\nبدء الاتصال بـ SurveyToGo...");
  console.log(`البحث عن: "${searchText}"\n`);

  const customers = await getCustomers();

  console.log(`عدد العملاء: ${customers.length}\n`);

  for (
    let customerIndex = 0;
    customerIndex < customers.length;
    customerIndex += 1
  ) {
    const customer = customers[customerIndex];

    const customerId = getCustomerId(customer);

    const customerName = getName(
      customer,
      `Customer ${customerIndex + 1}`
    );

    if (!customerId) {
      console.log(
        `تجاوز عميل بدون ID: ${customerName}`
      );

      continue;
    }

    console.log(
      `[${customerIndex + 1}/${customers.length}] Customer: ${customerName}`
    );

    let projects;

    try {
      projects = await getCustomerProjects(customerId);
    } catch (error) {
      const status = error.response?.status;

      console.log(
        `  فشل جلب المشاريع: ${status ?? error.message}`
      );

      errors.push({
        level: "customer",
        customerId,
        customerName,
        status: status ?? null,
        error: error.message,
        response:
          error.response?.data ?? null,
      });

      continue;
    }

    console.log(`  عدد المشاريع: ${projects.length}`);

    for (
      let projectIndex = 0;
      projectIndex < projects.length;
      projectIndex += 1
    ) {
      const project = projects[projectIndex];

      const projectId = getProjectId(project);

      const projectName = getName(
        project,
        `Project ${projectIndex + 1}`
      );

      if (!projectId) {
        console.log(
          `  تجاوز مشروع بدون ID: ${projectName}`
        );

        continue;
      }

      console.log(
        `  [${projectIndex + 1}/${projects.length}] Project: ${projectName}`
      );

      let surveys;

      try {
        surveys = await getProjectSurveys(projectId);
      } catch (error) {
        const status = error.response?.status;

        console.log(
          `    فشل جلب الاستمارات: ${status ?? error.message}`
        );

        errors.push({
          level: "project",
          customerId,
          customerName,
          projectId,
          projectName,
          status: status ?? null,
          error: error.message,
          response:
            error.response?.data ?? null,
        });

        continue;
      }

      console.log(`    عدد الاستمارات: ${surveys.length}`);

      for (
        let surveyIndex = 0;
        surveyIndex < surveys.length;
        surveyIndex += 1
      ) {
        const survey = surveys[surveyIndex];

        const surveyId = getSurveyId(survey);

        const surveyName = getName(
          survey,
          `Survey ${surveyIndex + 1}`
        );

        if (!surveyId) {
          console.log(
            `    تجاوز استمارة بدون ID: ${surveyName}`
          );

          continue;
        }

        process.stdout.write(
          `    [${surveyIndex + 1}/${surveys.length}] فحص: ${surveyName} ... `
        );

        try {
          const structure =
            await getSurveyStructure(surveyId);

          const matches = findMatches(
            structure,
            searchText
          );

          if (matches.length === 0) {
            console.log("لا يوجد");
            continue;
          }

          console.log(`وجد ${matches.length}`);

          for (const match of matches) {
            results.push({
              customerId,
              customerName,
              projectId,
              projectName,
              surveyId,
              surveyName,
              matchedText: match.text,
              structurePath: match.path,
            });
          }
        } catch (error) {
          const status = error.response?.status;

          console.log(
            `فشل: ${status ?? error.message}`
          );

          errors.push({
            level: "survey",
            customerId,
            customerName,
            projectId,
            projectName,
            surveyId,
            surveyName,
            status: status ?? null,
            error: error.message,
            response:
              error.response?.data ?? null,
          });
        }
      }
    }

    console.log("");
  }

  return {
    results: removeDuplicateMatches(results),
    errors,
  };
}

/* =========================================================
   إنشاء ملف CSV
========================================================= */

function escapeCsvValue(value) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

function saveResultsAsCsv(results) {
  const headers = [
    "Customer Name",
    "Customer ID",
    "Project Name",
    "Project ID",
    "Survey Name",
    "Survey ID",
    "Matched Text",
    "Structure Path",
  ];

  const rows = results.map((result) => [
    result.customerName,
    result.customerId,
    result.projectName,
    result.projectId,
    result.surveyName,
    result.surveyId,
    result.matchedText,
    result.structurePath,
  ]);

  const csv = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) =>
      row.map(escapeCsvValue).join(",")
    ),
  ].join("\n");

  /*
   إضافة BOM حتى تظهر العربية بشكل صحيح في Excel.
  */
  fs.writeFileSync(
    "search-results.csv",
    `\uFEFF${csv}`,
    "utf8"
  );
}

/* =========================================================
   التشغيل
========================================================= */

async function main() {
  const searchText = process.argv
    .slice(2)
    .join(" ")
    .trim();

  if (!searchText) {
    console.log(`
طريقة الاستخدام:

node search.js "influencer"

node search.js "Gain honor"

node search.js "honor community"
`);

    process.exit(1);
  }

  // إدخال بيانات الدخول عند التشغيل — تبقى في الذاكرة فقط
  const credentials = await promptCredentials();

  CONFIG.username = credentials.username;
  CONFIG.password = credentials.password;

  if (!CONFIG.username || !CONFIG.password) {
    console.error("\nيجب إدخال Username و Password.");
    process.exit(1);
  }

  // يُنشأ عميل Axios باستخدام بيانات الدخول المُدخلة مباشرةً
  api = createApiClient();

  const startedAt = new Date();

  const { results, errors } =
    await searchAllSurveys(searchText);

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

  saveResultsAsCsv(results);

  console.log("\n====================================");
  console.log(`عدد النتائج: ${results.length}`);
  console.log(`عدد الأخطاء: ${errors.length}`);
  console.log("====================================\n");

  if (results.length > 0) {
    console.table(
      results.map((result) => ({
        Customer: result.customerName,
        Project: result.projectName,
        Survey: result.surveyName,
        Text: result.matchedText.slice(0, 150),
      }))
    );
  } else {
    console.log("لم يتم العثور على نتائج.");
  }

  console.log("\nتم حفظ النتائج في:");
  console.log("search-results.json");
  console.log("search-results.csv");
}

main().catch((error) => {
  console.error("\nحدث خطأ:");

  if (error.response?.status) {
    console.error(
      `HTTP Status: ${error.response.status}`
    );
  }

  if (error.response?.data) {
    console.error(error.response.data);
  } else {
    console.error(error.message);
  }

  process.exit(1);
});