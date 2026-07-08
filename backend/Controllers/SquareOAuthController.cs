using System.Net.Http.Headers;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/square/oauth")]
    public class SquareOAuthController : ControllerBase
    {
        private readonly ISupabaseService _supabase;
        private readonly ISquareOAuthService _squareOAuth;
        private readonly ISquareMenuSyncService _squareMenuSync;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SquareOAuthController> _logger;

        public SquareOAuthController(
            ISupabaseService supabase,
            ISquareOAuthService squareOAuth,
            ISquareMenuSyncService squareMenuSync,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<SquareOAuthController> logger)
        {
            _supabase = supabase;
            _squareOAuth = squareOAuth;
            _squareMenuSync = squareMenuSync;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        [AllowAnonymous]
        [HttpGet("authorize")]
        public async Task<IActionResult> Authorize(CancellationToken cancellationToken)
        {
            try
            {
                var authenticatedUser = await GetAuthenticatedSupabaseUserAsync(cancellationToken);
                if (authenticatedUser is null)
                {
                    return Unauthorized("Your session is no longer valid. Please sign in again.");
                }

                return Ok(new
                {
                    authorizationUrl = _squareOAuth.CreateAuthorizationUrl(
                        authenticatedUser.Value.UserId,
                        authenticatedUser.Value.Email)
                });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogError(ex, "Square OAuth authorization could not start.");
                return StatusCode(500, "Square OAuth is not configured. Check Square:ApplicationId and Square:OAuthRedirectUri.");
            }
        }

        [AllowAnonymous]
        [HttpGet("callback")]
        public async Task<IActionResult> Callback(
            [FromQuery] string? code,
            [FromQuery] string? state,
            [FromQuery] string? error,
            CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(error))
            {
                return RedirectToFrontend("error", "Square authorization was not completed.");
            }

            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
            {
                return RedirectToFrontend("error", "Square returned an incomplete authorization response.");
            }

            try
            {
                var (userId, email) = _squareOAuth.ReadState(state);
                var profile = await EnsureProfileAsync(userId, email);

                var token = await _squareOAuth.ExchangeCodeAsync(code, cancellationToken);
                var restaurant = profile.Restaurant_Id.HasValue
                    ? await _supabase.GetRestaurantByIdAsync(profile.Restaurant_Id.Value)
                    : null;

                if (restaurant == null)
                {
                    restaurant = await _supabase.CreateRestaurantAsync(new Restaurant
                    {
                        Name = RestaurantName(profile, token.MerchantId),
                        ZipCode = string.Empty,
                        SquareId = token.MerchantId,
                        SquareAccessToken = token.AccessToken,
                        SquareRefreshToken = token.RefreshToken,
                        SquareTokenExpiresAt = token.ExpiresAt
                    }) ?? throw new InvalidOperationException("Failed to create the restaurant.");

                    profile.Restaurant_Id = restaurant.Id;
                    if (await _supabase.UpdateUserAsync(profile.Id, profile) == null)
                    {
                        throw new InvalidOperationException("Failed to link the profile to the restaurant.");
                    }
                }
                else
                {
                    restaurant.SquareId = token.MerchantId;
                    restaurant.SquareAccessToken = token.AccessToken;
                    restaurant.SquareRefreshToken = token.RefreshToken;
                    restaurant.SquareTokenExpiresAt = token.ExpiresAt;

                    if (await _supabase.UpdateRestaurantAsync(restaurant.Id, restaurant) == null)
                    {
                        throw new InvalidOperationException("Failed to save the Square connection.");
                    }
                }

                var imported = await _squareMenuSync.ImportMenuItemsAsync(
                    restaurant.Id,
                    token.AccessToken,
                    cancellationToken);

                return RedirectToFrontend("connected", null, imported);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Square OAuth callback failed.");
                return RedirectToFrontend("error", "We could not connect Square. Please try again.");
            }
        }

        private RedirectResult RedirectToFrontend(string status, string? message, int? imported = null)
        {
            var query = new Dictionary<string, string?> { ["square"] = status };
            if (!string.IsNullOrWhiteSpace(message)) query["message"] = message;
            if (imported.HasValue) query["imported"] = imported.Value.ToString();
            return Redirect(QueryHelpers.AddQueryString(_squareOAuth.FrontendReturnUrl, query));
        }

        private async Task<UserProfile> EnsureProfileAsync(Guid userId, string? email)
        {
            var profile = await _supabase.GetUserBySupabaseIdAsync(userId);
            if (profile != null) return profile;

            return await _supabase.CreateUserAsync(new UserProfile
            {
                supabaseId = userId,
                Email = email,
                FullName = email,
                CreatedOn = DateTime.UtcNow
            }) ?? throw new InvalidOperationException("Failed to create the user profile.");
        }

        private static string RestaurantName(UserProfile profile, string merchantId)
        {
            if (!string.IsNullOrWhiteSpace(profile.FullName))
            {
                return $"{profile.FullName}'s Restaurant";
            }

            if (!string.IsNullOrWhiteSpace(profile.Email))
            {
                return $"{profile.Email}'s Restaurant";
            }

            return $"Square Merchant {merchantId}";
        }

        private async Task<(Guid UserId, string? Email)?> GetAuthenticatedSupabaseUserAsync(
            CancellationToken cancellationToken)
        {
            var authorization = Request.Headers.Authorization.ToString();
            if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var accessToken = authorization["Bearer ".Length..].Trim();
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return null;
            }

            var supabaseUrl = _configuration["Supabase:Url"]?.TrimEnd('/');
            var supabaseAnonKey = _configuration["Supabase:AnonKey"];
            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(supabaseAnonKey))
            {
                throw new InvalidOperationException("Supabase OAuth validation settings are missing.");
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{supabaseUrl}/auth/v1/user");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.Add("apikey", supabaseAnonKey);

            using var response = await _httpClientFactory
                .CreateClient()
                .SendAsync(request, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Supabase rejected the Square OAuth bearer token with status {StatusCode}.",
                    (int)response.StatusCode);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = json.RootElement;
            var id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
            var email = root.TryGetProperty("email", out var emailElement) ? emailElement.GetString() : null;

            return Guid.TryParse(id, out var userId)
                ? (userId, email)
                : null;
        }
    }
}
