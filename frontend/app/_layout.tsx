import { View, Text, Pressable, Platform } from "react-native";
import { Slot, Link, Href, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import { RestaurantsService } from "../services/RestaurantService";
import { UserProfilesService } from "../services/UserProfileService";

type SquareSetupStatus =
  | { status: "connected" }
  | { status: "needs-square"; restaurantId: number }
  | { status: "setup-failed" };

function getRecoverySearchFromLocation(): string | null {
  if (typeof window === "undefined") return null;

  // Prefer query string if present
  let raw = window.location.search;
  if (raw && raw.length > 1) {
    return raw; // already starts with '?'
  }

  // Fallback to hash fragment: #access_token=...&type=recovery
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const hashWithoutHash = hash.substring(1); // remove '#'
    const params = new URLSearchParams(hashWithoutHash);
    const type = params.get("type");
    if (type === "recovery") {
      return `?${hashWithoutHash}`;
    }
  }

  return null;
}

function isRecoveryLink(): boolean {
  if (typeof window === "undefined") return false;

  // Look in search first
  const search = window.location.search;
  if (search && search.length > 1) {
    const params = new URLSearchParams(search);
    if (params.get("type") === "recovery") return true;
  }

  // Then look in hash
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const params = new URLSearchParams(hash.substring(1));
    if (params.get("type") === "recovery") return true;
  }

  return false;
}

function getCurrentRestaurantIdParam(): number | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("restaurantId");
  const parsed = value ? Number(value) : null;
  return parsed && parsed > 0 ? parsed : null;
}

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [squareSetupStatus, setSquareSetupStatus] =
    useState<SquareSetupStatus | null>(null);

  const getSquareSetupStatus = useCallback(async (user: User): Promise<SquareSetupStatus> => {
    try {
      const profile = await UserProfilesService.ensureUserProfileForUser(user);

      const restaurant = await RestaurantsService.getRestaurant(profile.restaurant_Id);
      return RestaurantsService.hasSquareConnection(restaurant)
        ? { status: "connected" }
        : { status: "needs-square", restaurantId: profile.restaurant_Id };
    } catch (err) {
      console.error("Unable to check Square setup status:", err);
      return { status: "setup-failed" };
    }
  }, []);

  const authRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/verifyemail" ||
    pathname === "/reset-password" ||
    pathname === "/square-setup";
  const squarePromptVisible =
    isAuthenticated === true &&
    !authRoute &&
    squareSetupStatus !== null &&
    squareSetupStatus.status !== "connected";

  const goToSquareSetup = () => {
    if (squareSetupStatus?.status === "needs-square") {
      router.replace({
        pathname: "/square-setup",
        params: { restaurantId: squareSetupStatus.restaurantId },
      });
      return;
    }

    router.replace("/square-setup");
  };

  useEffect(() => {
    if (Platform.OS === "web") {
      if (isRecoveryLink() && pathname !== "/reset-password") {
        const search = getRecoverySearchFromLocation() ?? "";
        router.replace(`/reset-password${search}` as any);
        return; // initAuth will run after route changes
      }
    }
    const initAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Supabase session error:", error.message);
        setIsAuthenticated(false);
        return;
      }

      const session = data.session;
      setIsAuthenticated(!!session);

      if (session) {
        if (pathname === "/reset-password") {
          setEmailPending(null);
          return;
        }
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (user && !user.email_confirmed_at) {
          setEmailPending(user.email ?? null);
          if (pathname !== "/verifyemail") {
            router.replace({
              pathname: "/verifyemail",
              params: { email: user.email },
            });
          }
        } else if (user) {
          const nextSquareSetupStatus = await getSquareSetupStatus(user);
          setSquareSetupStatus(nextSquareSetupStatus);

          if (
            nextSquareSetupStatus.status === "needs-square" &&
            pathname === "/square-setup" &&
            getCurrentRestaurantIdParam() !== nextSquareSetupStatus.restaurantId
          ) {
            router.replace({
              pathname: "/square-setup",
              params: { restaurantId: nextSquareSetupStatus.restaurantId },
            });
          } else if (
            nextSquareSetupStatus.status === "connected" &&
            (pathname === "/login" ||
              pathname === "/signup" ||
              pathname === "/verifyemail" ||
              pathname === "/square-setup")
          ) {
            router.replace("/");
          } else if (pathname === "/login" || pathname === "/signup") {
            router.replace("/");
          }
          setEmailPending(null);
        } else {
          setEmailPending(null);
          setSquareSetupStatus(null);
          router.replace("/login");
        }
      } else {
        setSquareSetupStatus(null);
        if (
          pathname !== "/login" &&
          pathname !== "/signup" &&
          pathname !== "/verifyemail" &&
          pathname !== "/square-setup" &&
          pathname !== "/reset-password"
        ) {
          router.replace("/login");
        }
      }
    };
    initAuth();

    // Listen to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setIsAuthenticated(!!session);
        if (!session) setSquareSetupStatus(null);

        if (_event === "SIGNED_IN") {
          if (Platform.OS === "web" && isRecoveryLink()) {
            const search = getRecoverySearchFromLocation() ?? "";
            router.replace(`/reset-password${search}` as any);
            setEmailPending(null);
            return;
          }
          if (pathname === "/reset-password") {
            setEmailPending(null);
            return;
          }
          const { data: userData } = await supabase.auth.getUser();
          const user = userData?.user;
          if (user && !user.email_confirmed_at) {
            setEmailPending(user.email ?? null);
            router.replace({
              pathname: "/verifyemail",
              params: { email: user.email },
            });
          } else {
            const nextSquareSetupStatus = user
              ? await getSquareSetupStatus(user)
              : { status: "connected" as const };
            setEmailPending(null);
            setSquareSetupStatus(nextSquareSetupStatus);

            if (nextSquareSetupStatus.status === "connected") {
              router.replace("/");
            } else if (pathname === "/login" || pathname === "/signup") {
              router.replace("/");
            }
          }
        }
        if (_event === "SIGNED_OUT") {
          setEmailPending(null);
          setSquareSetupStatus(null);
          router.replace("/login");
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [getSquareSetupStatus, pathname, router]);

  const showSidebar =
    pathname !== "/login" &&
    pathname !== "/signup" &&
    pathname !== "/verifyemail" &&
    pathname !== "/square-setup" &&
    pathname !== "/reset-password" &&
    isAuthenticated;

  const links = [
    { href: "/", label: "Home" },
    { href: "/ingredients", label: "Ingredients" },
    { href: "/menuitems", label: "Menu Items" },
    { href: "/transactions", label: "Transactions" },
  ];

  const handleLogout = async () => {
    // Clear local state immediately so UI updates even if network call fails
    setIsAuthenticated(false);
    setEmailPending(null);
    try {
      // Always clear local session so guards stop treating the user as logged-in
      await supabase.auth.signOut({ scope: "local" });
      // Best-effort revoke on the server (ignore errors so UI still routes away)
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) console.warn("Supabase logout (global) failed:", error.message);
    } catch (err) {
      console.error("Unexpected logout error:", err);
    }
    router.replace("/login");
  };

  return (
    <View style={{ flex: 1, minHeight: "100%" }}>
      {/* Top Bar */}
      <View
        style={{
          height: 75,
          backgroundColor: "white",
          borderBottomWidth: 1.5,
          borderBottomColor: "#ccc",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "bold", color: "black" }}>
          Byte2Bite
        </Text>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "black" }}>
            Restaurant Inventory Management Platform
          </Text>
        </View>
        {isAuthenticated && (
          <Pressable onPress={handleLogout} style={{ padding: 8 }}>
            <Text style={{ color: "red", fontWeight: "bold" }}>Logout</Text>
          </Pressable>
        )}
      </View>

      {/* Sidebar + Main Content */}
      <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
        {showSidebar && (
          <View style={{ width: 200, backgroundColor: "#f4f4f4", padding: 20 }}>
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link key={link.href} href={link.href as Href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    style={{ paddingVertical: 8 }}
                  >
                    {({ pressed }) => (
                      <Text
                        style={{
                          marginVertical: 7,
                          fontSize: 20,
                          fontWeight:
                            isActive || pressed ? "700" : "400",
                        }}
                      >
                        {link.label}
                      </Text>
                    )}
                  </Pressable>
                </Link>
              );
            })}
          </View>
        )}
        <View style={{ flex: 1, minHeight: 0, overflow: "scroll" }}>
          <Slot />
          {squarePromptVisible && (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(248, 250, 252, 0.96)",
                padding: 24,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 560,
                  alignItems: "center",
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: "#d1d5db",
                  borderRadius: 8,
                  paddingHorizontal: 36,
                  paddingVertical: 40,
                }}
              >
                <Text
                  style={{
                    color: "#2563eb",
                    fontSize: 12,
                    fontWeight: "700",
                    marginBottom: 12,
                  }}
                >
                  SQUARE SETUP
                </Text>
                <Text
                  style={{
                    color: "#111827",
                    fontSize: 28,
                    fontWeight: "700",
                    textAlign: "center",
                    marginBottom: 14,
                  }}
                >
                  Connect your Square account to continue
                </Text>
                <Text
                  style={{
                    color: "#4b5563",
                    fontSize: 16,
                    lineHeight: 24,
                    textAlign: "center",
                    marginBottom: 28,
                  }}
                >
                  Byte2Bite needs your Square catalog before this workspace is
                  ready. You will be redirected to Square to review and grant
                  access.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={goToSquareSetup}
                  style={{
                    minWidth: 190,
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#111827",
                    borderRadius: 6,
                    paddingHorizontal: 24,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    Connect Square
                  </Text>
                </Pressable>
                {squareSetupStatus.status === "setup-failed" && (
                  <Text
                    style={{
                      color: "#b45309",
                      fontSize: 13,
                      lineHeight: 19,
                      textAlign: "center",
                      marginTop: 18,
                    }}
                  >
                    We could not finish preparing this account yet. Check that
                    the backend is running, then try again.
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
