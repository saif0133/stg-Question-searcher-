/* =========================================================
   إنشاء ملف CSV
   نفس منطق الملف الأصلي، مع إضافة BOM حتى تظهر العربية
   بشكل صحيح في Excel.
========================================================= */

function escapeCsvValue(value) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(results) {
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

  const rows = (results || []).map((result) => [
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
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\r\n");

  // BOM لضمان قراءة Excel للترميز UTF-8 بشكل صحيح
  return `﻿${csv}`;
}

module.exports = { buildCsv };
