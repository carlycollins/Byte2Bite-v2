import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RestaurantsService } from "@/services/RestaurantService";
import { UserProfilesService } from "@/services/UserProfileService";
import { supabase } from "@/services/supabaseClient";

type SetupParams = {
  restaurantId?: string;
  square?: string;
  message?: string;
  imported?: string;
};

export default function SquareSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<SetupParams>();
  const restaurantIdParam = params.restaurantId
    ? Number(params.restaurantId)
    : null;
  const [restaurantId, setRestaurantId] = useState<number | null>(
    restaurantIdParam && restaurantIdParam > 0 ? restaurantIdParam : null
  );
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    if (params.square === "error") {
      showAlert("Square connection failed", params.message ?? "Please try again.");
    }
  }, [params.message, params.square]);

  useEffect(() => {
    const loadRestaurantId = async () => {
      if (restaurantId) {
        setCheckingProfile(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        router.replace("/login");
        return;
      }

      const profile = await UserProfilesService.getUserProfileBySupabaseId(userId);
      if (!profile?.restaurant_Id) {
        showAlert("Profile missing", "We could not find a restaurant for this account.");
        router.replace("/login");
        return;
      }

      setRestaurantId(profile.restaurant_Id);
      setCheckingProfile(false);
    };

    loadRestaurantId();
  }, [restaurantId, router]);

  const handleConnectSquare = async () => {
    if (!restaurantId) return;
    setLoading(true);

    try {
      const authorizationUrl = await RestaurantsService.getSquareAuthorizationUrl(
        restaurantId
      );

      if (Platform.OS === "web") {
        window.location.assign(authorizationUrl);
      } else {
        await Linking.openURL(authorizationUrl);
        setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      showAlert(
        "Could not open Square",
        err.message ?? "Please try again in a moment."
      );
    }
  };

  if (checkingProfile) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>SQUARE SETUP</Text>
        <Text style={styles.title}>Connect your Square account to continue</Text>
        <Text style={styles.subtitle}>
          You will be redirected to Square to sign in, review the requested
          permissions, and approve access. Byte2Bite will then build your menu from
          your Square catalog.
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={handleConnectSquare}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Connect Square</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          Byte2Bite requests read access to your catalog, orders, and merchant profile.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  panel: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 36,
    paddingVertical: 40,
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  subtitle: {
    color: "#4b5563",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 28,
  },
  button: {
    minWidth: 190,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    borderRadius: 6,
    paddingHorizontal: 24,
  },
  buttonPressed: {
    backgroundColor: "#374151",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  note: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 18,
  },
});
