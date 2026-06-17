import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RestaurantsService } from "@/services/RestaurantService";
import { UserProfilesService } from "@/services/UserProfileService";
import { supabase } from "@/services/supabaseClient";

export default function SquareSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const [restaurantId, setRestaurantId] = useState<number | null>(
    params.restaurantId ? Number(params.restaurantId) : null
  );
  const [merchantId, setMerchantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
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
    if (!restaurantId) {
      showAlert("Profile missing", "We could not find a restaurant for this account.");
      return;
    }

    if (!merchantId.trim() || !accessToken.trim()) {
      showAlert("Missing Information", "Please enter your Square merchant ID and access token.");
      return;
    }

    setLoading(true);

    try {
      const result = await RestaurantsService.connectSquare(restaurantId, {
        squareMerchantId: merchantId.trim(),
        squareAccessToken: accessToken.trim(),
      });

      showAlert(
        "Square Connected",
        `Your Square catalog is ready. Imported ${result.upserted} menu item${result.upserted === 1 ? "" : "s"}.`
      );
      router.replace("/");
    } catch (err: any) {
      console.error("Square connection failed:", err);
      showAlert("Square Connection Failed", err.message ?? "Please check your Square details.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Square</Text>
      <Text style={styles.subtitle}>
        Connect Square to import your catalog before continuing.
      </Text>

      <TextInput
        placeholder="Square Merchant ID"
        style={styles.input}
        value={merchantId}
        onChangeText={setMerchantId}
        autoCapitalize="none"
      />

      <TextInput
        placeholder="Square Access Token"
        style={styles.input}
        value={accessToken}
        onChangeText={setAccessToken}
        autoCapitalize="none"
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <Button title="Connect Square" onPress={handleConnectSquare} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    color: "#555",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
});
