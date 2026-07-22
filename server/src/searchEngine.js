/* =========================================================
   SurveyToGo search engine (refactored from search.js)

   The original logic is preserved exactly:
     - SurveyToGo API endpoints
     - Request delay / rate limiting
     - Retry handling (429)
     - JSON and XML parsing
     - Keyword normalization
     - Matching logic (all keywords must be present)
     - Customer / project / survey / question extraction

   Differences from the original:
     - username / password / searchText / customerIds are parameters
     - A fresh Axios client is created per call using the supplied
       credentials (no global client with fixed credentials)
     - Results are RETURNED instead of written to files
     - Optional onProgress + isCancelled hooks for the web UI
========================================================= */

const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

/* =========================================================
   ثوابت الاتصال (نفس القيم الأصلية)
========================================================= */

const CONFIG = {
  baseUrl: "https://api.dooblo.net/newapi",

  // الحد الأقصى في SurveyToGo هو طلبان في الثانية
  delayBetweenRequests: 650,

  timeout: 120000,
};

/* =========================================================
   إنشاء عميل Axios لكل طلب باستخدام بيانات الدخول المستلمة
   لا يوجد عميل عام يحتوي على بيانات دخول ثابتة.
========================================================= */

function createApiClient(username, password) {
  return axios.create({
    baseURL: CONFIG.baseUrl,
    timeout: CONFIG.timeout,

    auth: {
      username,
      password,
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

async function requestApi(client, path, options = {}) {
  const {
    params = {},
    accept = "application/json",
    retries = 3,
  } = options;

  await delay(CONFIG.delayBetweenRequests);

  try {
    const response = await client.get(path, {
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
      await delay(2500);

      return requestApi(client, path, {
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
      ([key]) => key.toLowerCase() === possibleKey.toLowerCase()
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
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/*
 البحث عن جميع الكلمات، وليس الجملة مطابقة حرفيًا.

 مثال:
 "honor community"

 يجب أن يحتوي النص على:
 honor
 community
*/
function containsAllKeywords(text, searchText) {
  const normalizedText = normalizeText(text);

  const keywords = normalizeText(searchText).split(" ").filter(Boolean);

  return keywords.every((keyword) => normalizedText.includes(keyword));
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
      findMatches(item, searchText, `${path}[${index}]`, matches, visited);
    });

    return matches;
  }

  for (const [key, childValue] of Object.entries(value)) {
    findMatches(childValue, searchText, `${path}.${key}`, matches, visited);
  }

  return matches;
}

/* =========================================================
   تجربة عدة أشكال للـ Endpoint
========================================================= */

async function tryRequests(client, requests) {
  let lastError;

  for (const request of requests) {
    try {
      return await requestApi(client, request.path, {
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

async function getCustomers(client) {
  const response = await requestApi(client, "/Customers");

  return toArray(response);
}

/*
 الشكل الصحيح حسب Testbed:

 /CustomerProjects/{customerID}
*/
async function getCustomerProjects(client, customerId) {
  const encodedId = encodeURIComponent(customerId);

  const response = await tryRequests(client, [
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

async function getProjectSurveys(client, projectId) {
  const encodedId = encodeURIComponent(projectId);

  /*
   نجرب وضع Project ID داخل الرابط أولًا،
   ثم نجرب Query Parameter كخيار احتياطي.
  */

  const response = await tryRequests(client, [
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

async function getSurveyStructure(client, surveyId) {
  const encodedId = encodeURIComponent(surveyId);

  /*
   SimpleSurveyExport قد يدعم JSON أو XML حسب إصدار الـ API.
   نجرب كل الأشكال الممكنة تلقائيًا.
  */

  return tryRequests(client, [
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
    const key = [match.surveyId, normalizeText(match.matchedText)].join("|");

    if (!unique.has(key)) {
      unique.set(key, match);
    }
  }

  return [...unique.values()];
}

/* =========================================================
   جلب قائمة العملاء (id + name فقط)
========================================================= */

async function listCustomers({ username, password }) {
  const client = createApiClient(username, password);

  const customers = await getCustomers(client);

  return customers
    .map((customer, index) => {
      const id = getCustomerId(customer);

      return {
        id: id === undefined || id === null ? null : String(id),
        name: getName(customer, `Customer ${index + 1}`),
      };
    })
    .filter((customer) => customer.id !== null);
}

/* =========================================================
   البحث داخل العملاء المحددين فقط
========================================================= */

async function searchSelectedCustomers({
  username,
  password,
  searchText,
  customerIds,
  onProgress = () => {},
  onResult = () => {},
  isCancelled = () => false,
}) {
  const client = createApiClient(username, password);

  const results = [];
  const errors = [];

  // مفاتيح النتائج المبثوثة (نفس مفتاح إزالة التكرار) لضمان
  // أن ما يُبَثّ فوريًا مطابق تمامًا للمجموعة النهائية بلا تكرار.
  const emittedKeys = new Set();

  const selectedIds = new Set((customerIds || []).map((id) => String(id)));

  const allCustomers = await getCustomers(client);

  // نبحث فقط داخل العملاء المحددين
  const customers = allCustomers.filter((customer) => {
    const id = getCustomerId(customer);

    return id !== undefined && id !== null && selectedIds.has(String(id));
  });

  let cancelled = false;

  for (
    let customerIndex = 0;
    customerIndex < customers.length;
    customerIndex += 1
  ) {
    if (isCancelled()) {
      cancelled = true;
      break;
    }

    const customer = customers[customerIndex];

    const customerId = getCustomerId(customer);

    const customerName = getName(customer, `Customer ${customerIndex + 1}`);

    if (!customerId) {
      continue;
    }

    onProgress({
      phase: "customer",
      customerName,
      customerId: String(customerId),
      customerIndex: customerIndex + 1,
      customerTotal: customers.length,
    });

    let projects;

    try {
      projects = await getCustomerProjects(client, customerId);
    } catch (error) {
      const status = error.response?.status;

      errors.push({
        level: "customer",
        customerId: String(customerId),
        customerName,
        status: status ?? null,
        error: error.message,
      });

      continue;
    }

    for (
      let projectIndex = 0;
      projectIndex < projects.length;
      projectIndex += 1
    ) {
      if (isCancelled()) {
        cancelled = true;
        break;
      }

      const project = projects[projectIndex];

      const projectId = getProjectId(project);

      const projectName = getName(project, `Project ${projectIndex + 1}`);

      if (!projectId) {
        continue;
      }

      onProgress({
        phase: "project",
        customerName,
        customerId: String(customerId),
        customerIndex: customerIndex + 1,
        customerTotal: customers.length,
        projectName,
        projectId: String(projectId),
        projectIndex: projectIndex + 1,
        projectTotal: projects.length,
      });

      let surveys;

      try {
        surveys = await getProjectSurveys(client, projectId);
      } catch (error) {
        const status = error.response?.status;

        errors.push({
          level: "project",
          customerId: String(customerId),
          customerName,
          projectId: String(projectId),
          projectName,
          status: status ?? null,
          error: error.message,
        });

        continue;
      }

      for (
        let surveyIndex = 0;
        surveyIndex < surveys.length;
        surveyIndex += 1
      ) {
        if (isCancelled()) {
          cancelled = true;
          break;
        }

        const survey = surveys[surveyIndex];

        const surveyId = getSurveyId(survey);

        const surveyName = getName(survey, `Survey ${surveyIndex + 1}`);

        if (!surveyId) {
          continue;
        }

        onProgress({
          phase: "survey",
          customerName,
          customerId: String(customerId),
          customerIndex: customerIndex + 1,
          customerTotal: customers.length,
          projectName,
          projectId: String(projectId),
          projectIndex: projectIndex + 1,
          projectTotal: projects.length,
          surveyName,
          surveyId: String(surveyId),
          surveyIndex: surveyIndex + 1,
          surveyTotal: surveys.length,
        });

        try {
          const structure = await getSurveyStructure(client, surveyId);

          const matches = findMatches(structure, searchText);

          for (const match of matches) {
            const result = {
              customerId: String(customerId),
              customerName,
              projectId: String(projectId),
              projectName,
              surveyId: String(surveyId),
              surveyName,
              matchedText: match.text,
              structurePath: match.path,
            };

            results.push(result);

            // نبثّ كل نتيجة فريدة مباشرةً (نفس مفتاح removeDuplicateMatches)
            const key = [
              result.surveyId,
              normalizeText(result.matchedText),
            ].join("|");

            if (!emittedKeys.has(key)) {
              emittedKeys.add(key);
              onResult(result);
            }
          }
        } catch (error) {
          const status = error.response?.status;

          errors.push({
            level: "survey",
            customerId: String(customerId),
            customerName,
            projectId: String(projectId),
            projectName,
            surveyId: String(surveyId),
            surveyName,
            status: status ?? null,
            error: error.message,
          });
        }
      }

      if (cancelled) {
        break;
      }
    }

    if (cancelled) {
      break;
    }
  }

  return {
    results: removeDuplicateMatches(results),
    errors,
    cancelled,
  };
}

/* =========================================================
   خطوات مفردة (لتشغيل serverless مثل Netlify Functions)

   كل دالة تُنشئ عميل Axios من بيانات الدخول المستلمة وتنفّذ خطوة
   واحدة قصيرة تناسب مهلة الدوال بلا حالة. المنطق نفسه غير متغيّر
   (نفس المسارات، نفس التحليل، نفس المطابقة، نفس إزالة التكرار).
========================================================= */

async function listCustomerProjects({ username, password, customerId }) {
  const client = createApiClient(username, password);

  const projects = await getCustomerProjects(client, customerId);

  return projects
    .map((project, index) => {
      const id = getProjectId(project);

      return {
        id: id === undefined || id === null ? null : String(id),
        name: getName(project, `Project ${index + 1}`),
      };
    })
    .filter((project) => project.id !== null);
}

async function listProjectSurveys({ username, password, projectId }) {
  const client = createApiClient(username, password);

  const surveys = await getProjectSurveys(client, projectId);

  return surveys
    .map((survey, index) => {
      const id = getSurveyId(survey);

      return {
        id: id === undefined || id === null ? null : String(id),
        name: getName(survey, `Survey ${index + 1}`),
      };
    })
    .filter((survey) => survey.id !== null);
}

async function searchSurvey({ username, password, surveyId, searchText }) {
  const client = createApiClient(username, password);

  const structure = await getSurveyStructure(client, surveyId);

  const matches = findMatches(structure, searchText);

  // إزالة التكرار داخل الاستمارة الواحدة (نفس مفتاح removeDuplicateMatches)
  const seen = new Set();
  const unique = [];

  for (const match of matches) {
    const key = normalizeText(match.text);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        matchedText: match.text,
        structurePath: match.path,
      });
    }
  }

  return unique;
}

module.exports = {
  CONFIG,
  createApiClient,
  normalizeText,
  containsAllKeywords,
  findMatches,
  getCustomers,
  getCustomerProjects,
  getProjectSurveys,
  getSurveyStructure,
  getCustomerId,
  getName,
  listCustomers,
  listCustomerProjects,
  listProjectSurveys,
  searchSurvey,
  searchSelectedCustomers,
};
