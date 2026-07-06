import { View, Text, Pressable, Platform } from "react-native";
import { Slot, Link, Href, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

  const getSquareSetupStatus = async (user: User): Promise<SquareSetupStatus> => {
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
          const squareSetupStatus = await getSquareSetupStatus(user);

          if (
            squareSetupStatus.status === "needs-square" &&
            (pathname !== "/square-setup" ||
              getCurrentRestaurantIdParam() !== squareSetupStatus.restaurantId)
          ) {
            router.replace({
              pathname: "/square-setup",
              params: { restaurantId: squareSetupStatus.restaurantId },
            });
          } else if (
            squareSetupStatus.status === "connected" &&
            (pathname === "/login" ||
              pathname === "/signup" ||
              pathname === "/verifyemail" ||
              pathname === "/square-setup")
          ) {
            router.replace("/");
          } else if (
            squareSetupStatus.status === "setup-failed" &&
            pathname !== "/login"
          ) {
            router.replace("/login");
          }
          setEmailPending(null);
        } else {
          setEmailPending(null);
          router.replace("/login");
        }
      } else {
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
            const squareSetupRestaurantId = user
              ? await getSquareSetupStatus(user)
              : { status: "connected" as const };
            setEmailPending(null);

            if (squareSetupRestaurantId.status === "needs-square") {
              router.replace({
                pathname: "/square-setup",
                params: { restaurantId: squareSetupRestaurantId.restaurantId },
              });
            } else if (squareSetupRestaurantId.status === "connected") {
              router.replace("/");
            } else if (pathname !== "/login") {
              router.replace("/login");
            }
          }
        }
        if (_event === "SIGNED_OUT") {
          setEmailPending(null);
          router.replace("/login");
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [pathname, router]);

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
        </View>
      </View>
    </View>
  );
}
