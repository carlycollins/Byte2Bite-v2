// services/RestaurantsService.ts
import { supabase } from "./supabaseClient";
export interface Restaurant {
  id: number;
  name: string;
  zip: string;
  zipCode?: string;
  squareId: string;
  squareConnected: boolean;
}

const API_URL = "http://localhost:5038/api/Restaurants";
const SQUARE_OAUTH_URL = "http://localhost:5038/api/square/oauth";

async function getAllRestaurants(): Promise<Restaurant[]> {
  const res = await fetch(API_URL, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to fetch Restaurants");
  return res.json();
}

async function getRestaurant(id: number): Promise<Restaurant> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Restaurant ${id} not found`);
  return res.json();
}

async function addRestaurant(Restaurant: Restaurant): Promise<Restaurant> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Restaurant),
  });
  if (!res.ok) throw new Error("Failed to add Restaurant");
  return res.json();
}

async function updateRestaurant(
  id: number,
  Restaurant: Restaurant
): Promise<Restaurant> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Restaurant),
  });
  if (!res.ok) throw new Error("Failed to update Restaurant");
  return res.json();
}

async function getSquareAuthorizationUrl(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const res = await fetch(`${SQUARE_OAUTH_URL}/authorize`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to start Square authorization");
  }

  const body = await res.json();
  return body.authorizationUrl;
}

function hasSquareConnection(restaurant?: Restaurant | null): boolean {
  return restaurant?.squareConnected === true;
}

async function deleteRestaurant(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete Restaurant ${id}`);
}

export const RestaurantsService = {
  getAllRestaurants,
  getRestaurant,
  addRestaurant,
  updateRestaurant,
  getSquareAuthorizationUrl,
  hasSquareConnection,
  deleteRestaurant,
};
