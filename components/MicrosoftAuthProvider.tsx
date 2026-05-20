"use client";

import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type IPublicClientApplication
} from "@azure/msal-browser";
import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { MicrosoftAuthConfig, MicrosoftAuthState } from "@/types/microsoftAuth";

interface MicrosoftAuthContextValue {
  configured: boolean;
  initializing: boolean;
  isAuthenticated: boolean;
  accountName: string;
  state: MicrosoftAuthState;
  message: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (options?: { interactive?: boolean }) => Promise<string>;
  refreshConfig: () => void;
}

interface MicrosoftConfigPayload {
  ok: boolean;
  data?: MicrosoftAuthConfig;
}

const defaultAuthContext: MicrosoftAuthContextValue = {
  configured: false,
  initializing: true,
  isAuthenticated: false,
  accountName: "",
  state: "CONFIG_MISSING",
  message: "Microsoft sign-in is not configured.",
  signIn: async () => undefined,
  signOut: async () => undefined,
  getAccessToken: async () => {
    throw new Error("Microsoft sign-in is required to access the configured SharePoint folder.");
  },
  refreshConfig: () => undefined
};

const MicrosoftAuthContext = createContext<MicrosoftAuthContextValue>(defaultAuthContext);

export function useMicrosoftAuth() {
  return useContext(MicrosoftAuthContext);
}

export function MicrosoftAuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<MicrosoftAuthConfig | null>(null);
  const [instance, setInstance] = useState<IPublicClientApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [configVersion, setConfigVersion] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      try {
        const response = await fetch("/api/auth/microsoft/config", { cache: "no-store" });
        const payload = (await response.json()) as MicrosoftConfigPayload;
        const nextConfig = payload.data || null;

        if (cancelled) {
          return;
        }

        setConfig(nextConfig);
        setMessage("");

        if (!nextConfig?.configured) {
          setInstance(null);
          return;
        }

        const nextInstance = new PublicClientApplication({
          auth: {
            clientId: nextConfig.clientId,
            authority: nextConfig.authority,
            redirectUri: nextConfig.redirectUri
          },
          cache: {
            cacheLocation: BrowserCacheLocation.SessionStorage
          },
          system: {
            loggerOptions: {
              piiLoggingEnabled: false
            }
          }
        });
        await nextInstance.initialize();

        if (!cancelled) {
          setInstance(nextInstance);
        }
      } catch {
        if (!cancelled) {
          setConfig(null);
          setInstance(null);
          setMessage("Microsoft sign-in configuration could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [configVersion]);

  const refreshConfig = useCallback(() => {
    setConfigVersion((current) => current + 1);
  }, []);

  if (!config?.configured || !instance) {
    const value: MicrosoftAuthContextValue = {
      ...defaultAuthContext,
      configured: Boolean(config?.configured),
      initializing: loading,
      state: config?.configured ? "SIGNED_OUT" : "CONFIG_MISSING",
      message:
        message ||
        (loading
          ? "Checking Microsoft sign-in."
          : "Microsoft sign-in is not configured. Add Tenant ID and Client ID in SharePoint Settings."),
      refreshConfig
    };

    return (
      <MicrosoftAuthContext.Provider value={value}>{children}</MicrosoftAuthContext.Provider>
    );
  }

  return (
    <MsalProvider instance={instance}>
      <MicrosoftAuthBridge config={config} initializing={loading} refreshConfig={refreshConfig}>
        {children}
      </MicrosoftAuthBridge>
    </MsalProvider>
  );
}

function MicrosoftAuthBridge({
  children,
  config,
  initializing,
  refreshConfig
}: {
  children: ReactNode;
  config: MicrosoftAuthConfig;
  initializing: boolean;
  refreshConfig: () => void;
}) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [authProblem, setAuthProblem] = useState<{
    state: MicrosoftAuthState;
    message: string;
  } | null>(null);

  const account = useMemo(() => getPreferredAccount(instance, accounts), [accounts, instance]);

  useEffect(() => {
    if (account) {
      instance.setActiveAccount(account);
    }
  }, [account, instance]);

  const tokenRequest = useMemo(
    () => ({
      scopes: config.scopes
    }),
    [config.scopes]
  );

  const signIn = useCallback(async () => {
    try {
      const result = await instance.loginPopup(tokenRequest);
      if (result.account) {
        instance.setActiveAccount(result.account);
      }
      setAuthProblem(null);
    } catch (error) {
      const nextState = getAuthFailureState(error);
      setAuthProblem({
        state: nextState,
        message: getAuthFailureMessage(error, nextState)
      });
      throw error;
    }
  }, [instance, tokenRequest]);

  const signOut = useCallback(async () => {
    const currentAccount = getPreferredAccount(instance, accounts);
    if (currentAccount) {
      await instance.logoutPopup({ account: currentAccount });
    }
    setAuthProblem(null);
  }, [accounts, instance]);

  const getAccessToken = useCallback(
    async (options?: { interactive?: boolean }) => {
      let currentAccount = getPreferredAccount(instance, accounts);

      if (!currentAccount && options?.interactive) {
        const result = await instance.loginPopup(tokenRequest);
        currentAccount = result.account || null;
        if (currentAccount) {
          instance.setActiveAccount(currentAccount);
        }
      }

      if (!currentAccount) {
        setAuthProblem(null);
        throw new Error("Microsoft sign-in is required to access the configured SharePoint folder.");
      }

      try {
        const result = await instance.acquireTokenSilent({
          ...tokenRequest,
          account: currentAccount
        });
        setAuthProblem(null);
        return result.accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError && options?.interactive) {
          const result = await instance.acquireTokenPopup({
            ...tokenRequest,
            account: currentAccount
          });
          setAuthProblem(null);
          return result.accessToken;
        }

        const nextState = getAuthFailureState(error);
        setAuthProblem({
          state: nextState,
          message: getAuthFailureMessage(error, nextState)
        });
        throw error;
      }
    },
    [accounts, instance, tokenRequest]
  );

  const state = authProblem?.state || (account ? "SIGNED_IN" : "SIGNED_OUT");
  const message =
    authProblem?.message ||
    (account
      ? "Microsoft signed in"
      : "Microsoft sign-in is required to access the configured SharePoint folder.");

  const value: MicrosoftAuthContextValue = {
    configured: true,
    initializing,
    isAuthenticated,
    accountName: account?.username || account?.name || "",
    state,
    message,
    signIn,
    signOut,
    getAccessToken,
    refreshConfig
  };

  return <MicrosoftAuthContext.Provider value={value}>{children}</MicrosoftAuthContext.Provider>;
}

function getPreferredAccount(
  instance: IPublicClientApplication,
  accounts: AccountInfo[]
): AccountInfo | null {
  return instance.getActiveAccount() || accounts[0] || null;
}

function getAuthFailureState(error: unknown): MicrosoftAuthState {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/access_denied|AADSTS65001|consent/i.test(message)) {
    return "ACCESS_DENIED";
  }

  return "SESSION_EXPIRED";
}

function getAuthFailureMessage(error: unknown, state: MicrosoftAuthState): string {
  if (state === "ACCESS_DENIED") {
    return "Access denied. Microsoft Graph permissions are required for this SharePoint folder.";
  }

  if (error instanceof Error && error.message) {
    return "Session expired. Please sign in with Microsoft again.";
  }

  return "Microsoft sign-in is required to access the configured SharePoint folder.";
}
