
import { isIframe } from "./utils.js";

export function setupIframeMessaging() {
  console.log("Setting up iframe messaging");
  if (isIframe) {
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleWindowError);

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);
  }
}

function extractPathWithLine(stack) {
  if (!stack) return null;

  const match = stack.match(/https?:\/\/[^\s)]+:(\d+):\d+/);
  if (!match) return null;

  const full = match[0];   // full URL + line + col
  const line = match[1];   // line number only

  let path = full.replace(/^https?:\/\/[^/]+\//, "");
  path = path.split("?")[0]; // remove ?t=timestamp

  return `${path}:${line}`; // final format
}

function onAppError({ title, details, componentName, originalError }) {
  if (originalError?.response?.status === 402) return;

  window.parent?.postMessage(
    {
      type: "app_error",
      error: {
        title: title?.toString(),
        details: details?.toString(),
        componentName: componentName?.toString(),
      },
    },
    "*"
  );
}

function handleUnhandledRejection(event) {
  const stack = event.reason?.stack;
  const shortPath = extractPathWithLine(stack);

  const functionName =
    stack?.match(/at\s+(\w+)\s+\(eval/)?.[1] || shortPath;

  const msg = functionName
    ? `Error in ${functionName}: ${event.reason?.toString()}`
    : event.reason?.toString();

  onAppError({
    title: msg,
    details: event.reason?.toString(),
    componentName: functionName,
    originalError: event.reason,
  });
}

function handleWindowError(event) {
  const stack = event.error?.stack;
  let functionName = stack?.match(/at\s+(\w+)\s+\(eval/)?.[1];

  if (functionName === "eval") functionName = null;

  const shortPath = extractPathWithLine(stack);
  if (!functionName && shortPath) {
    functionName = shortPath;
  }

  const msg = functionName
    ? `in ${functionName}: ${event.error?.toString()}`
    : event.error?.toString();

  onAppError({
    title: msg,
    details: event.error?.toString(),
    componentName: functionName,
    originalError: event.error,
  });
}
