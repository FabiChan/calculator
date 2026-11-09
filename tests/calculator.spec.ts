import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:8080";

// Keep server-owned history isolated between tests.
test.beforeEach(async ({ request }) => {
  const response = await request.delete(`${apiBaseUrl}/api/v1/history/clear`);
  expect(response.ok()).toBeTruthy();
});

// Ensure enabled keypad buttons show the pointer cursor on hover.
test("shows a hand cursor when hovering an enabled keypad button", async ({
  page,
}) => {
  await page.goto("/");
  const digitButton = page.getByRole("button", { name: "7", exact: true });

  await digitButton.hover();

  await expect(digitButton).toHaveCSS("cursor", "pointer");
});

// Verify keypad input calls Go and renders the returned result and history.
test("calculates through the Go API and shows server history", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const calculationRequest = page.waitForRequest(
    (apiRequest) =>
      apiRequest.url().endsWith("/api/v1/calculate") &&
      apiRequest.method() === "POST",
  );

  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "×", exact: true }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "=", exact: true }).click();

  const sentRequest = await calculationRequest;
  expect(sentRequest.postDataJSON()).toEqual({ a: 8, b: 5, op: "×" });
  await expect(
    page.locator("main").getByText("40", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("main").getByText("= 40", { exact: true }),
  ).toBeVisible();

  const historyResponse = await request.get(`${apiBaseUrl}/api/v1/history`);
  expect(await historyResponse.json()).toMatchObject([
    { expression: "8 × 5", result: "40" },
  ]);
});

// Verify a rejected calculation appears once in the calculator display.
test("shows a single division-by-zero error in the calculator display", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "÷", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "=", exact: true }).click();

  await expect(
    page.locator("main").getByText("Zero Division!", { exact: true }),
  ).toHaveCount(1);
});

// Verify the clear control deletes history from the backend, not just the UI.
test("clears server history from the UI", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "6", exact: true }).click();
  await page.getByRole("button", { name: "+", exact: true }).click();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "=", exact: true }).click();

  await expect(
    page.locator("main").getByText("= 13", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear Log History" }).click();
  await expect(page.getByText("No past calculations")).toBeVisible();

  const historyResponse = await request.get(`${apiBaseUrl}/api/v1/history`);
  expect(await historyResponse.json()).toEqual([]);
});
