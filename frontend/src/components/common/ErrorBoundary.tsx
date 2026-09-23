import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../../i18n";
import { hardReload, resetAndReload } from "../../utils/recovery";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
  resetting: boolean;
  copied: boolean;
}

/**
 * Last line of defence against a blank page.
 *
 * React unmounts the entire tree when a render or lifecycle method throws and
 * nothing catches it, which leaves an empty `#root` — indistinguishable from a
 * broken deploy, and impossible to diagnose from a phone. Catching here keeps
 * the failure visible and gives the user a way out without reinstalling
 * anything.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    showDetails: false,
    resetting: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the full report in the console for anyone with a debugger attached.
    console.error("Asspp Web crashed while rendering", error, info);
  }

  componentDidMount(): void {
    // App applies the theme class in an effect; if it never got that far, match
    // the system preference so the report is not white-on-white.
    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    } catch {
      // matchMedia unavailable — stay light.
    }
  }

  private report(): string {
    const { error } = this.state;
    if (!error) {
      return "";
    }
    return [
      `message: ${error.message}`,
      `ua: ${navigator.userAgent}`,
      `url: ${window.location.href}`,
      "",
      error.stack ?? "(no stack)",
    ].join("\n");
  }

  private handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(this.report());
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard blocked (common without a user gesture on iOS) — the details
      // panel below is the fallback.
    }
  };

  private handleReset = async (): Promise<void> => {
    this.setState({ resetting: true });
    try {
      await resetAndReload();
    } catch {
      hardReload();
    }
  };

  render(): ReactNode {
    const { error, showDetails, resetting, copied } = this.state;

    if (!error) {
      return this.props.children;
    }

    const t = (key: string, fallback: string): string =>
      String(i18n.t(`crash.${key}`, { defaultValue: fallback }));

    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-gray-100 px-4 py-10 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <main className="w-full max-w-lg rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-8 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              />
            </svg>
          </div>

          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            {t("title", "Something went wrong")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {t(
              "desc",
              "The page could not start. If this happened after an update, clearing local data normally fixes it.",
            )}
          </p>

          <p className="mt-4 break-words rounded-2xl bg-gray-100 px-4 py-3 font-mono text-xs leading-5 text-red-700 dark:bg-gray-800 dark:text-red-400">
            {error.message || String(error)}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => hardReload()}
              disabled={resetting}
              className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-gray-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {t("reload", "Reload")}
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              disabled={resetting}
              className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {resetting
                ? t("resetting", "Clearing…")
                : t("reset", "Clear data & reload")}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showDetails
                ? t("hideDetails", "Hide details")
                : t("details", "Show details")}
            </button>
            {showDetails && (
              <button
                type="button"
                onClick={this.handleCopy}
                className="font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {copied ? "✓" : "Copy"}
              </button>
            )}
          </div>

          {showDetails && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-gray-100 p-4 font-mono text-[11px] leading-5 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {this.report()}
            </pre>
          )}
        </main>
      </div>
    );
  }
}
