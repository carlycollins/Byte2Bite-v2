// services/RestaurantsService.ts
export interface Restaurant {
  id: number;
  name: string;
  zip: string;
  zipCode?: string;
  squareId: string;
  squareAccessToken: string;
}

export interface SquareConnectionResult {
  restaurantId: number;
  squareMerchantId: string;
  upserted: number;
}

const API_URL = "http://localhost:5038/api/Restaurants";

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

async function connectSquare(
  id: number,
  payload: { squareMerchantId: string; squareAccessToken: string }
): Promise<SquareConnectionResult> {
  const res = await fetch(`${API_URL}/${id}/square/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to connect Square");
  }

  return res.json();
}

function hasSquareConnection(restaurant?: Restaurant | null): boolean {
  return !!restaurant?.squareId?.trim() && !!restaurant?.squareAccessToken?.trim();
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
  connectSquare,
  hasSquareConnection,
  deleteRestaurant,
};
