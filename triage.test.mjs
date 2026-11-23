import test from "node:test";
import assert from "node:assert/strict";
import { triage, parseBody } from "./server.mjs";

const REVIEW = { status: "manual_review", topic: null, draft: null };

test("ошибка модели → manual_review", async () => {
  assert.deepEqual(await triage("текст [error]"), REVIEW);
});

test("таймаут модели → manual_review", async () => {
  assert.deepEqual(await triage("текст [timeout]"), REVIEW);
});

test("не-JSON ответ модели → manual_review", async () => {
  assert.deepEqual(await triage("текст [bad-json]"), REVIEW);
});

test("невалидная тема → manual_review", async () => {
  assert.deepEqual(await triage("текст [bad-topic]"), REVIEW);
});

test("пустой черновик → manual_review", async () => {
  assert.deepEqual(await triage("текст [empty-draft]"), REVIEW);
});

test("корректный ввод → ready", async () => {
  assert.deepEqual(await triage("доставка задерживается"), {
    status: "ready",
    topic: "delivery",
    draft: "Спасибо за обращение. Уточним детали заявки.",
  });
});

test("невалидный ввод отклоняется", () => {
  assert.equal(parseBody("{broken").ok, false);
  assert.equal(parseBody('{"text": ""}').ok, false);
  assert.equal(parseBody('{"text": "   "}').ok, false);
  assert.equal(parseBody("{}").ok, false);
  assert.equal(parseBody('{"text": 5}').ok, false);
  assert.equal(parseBody('{"text": "ok"}').ok, true);
});
