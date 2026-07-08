using System.Security.Claims;
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
        private readonly ILogger<SquareOAuthController> _logger;

        public SquareOAuthController(
            ISupabaseService supabase,
            ISquareOAuthService squareOAuth,
            ISquareMenuSyncService squareMenuSync,
            ILogger<SquareOAuthController> logger)
        {
            _supabase = supabase;
            _squareOAuth = squareOAuth;
            _squareMenuSync = squareMenuSync;
            _logger = logger;
        }

        [Authorize]
        [HttpGet("authorize")]
        public IActionResult Authorize()
        {
            try
            {
                var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
                if (!Guid.TryParse(subject, out var userId)) return Unauthorized("Your session is no longer valid. Please sign in again.");

                return Ok(new
                {
                    authorizationUrl = _squareOAuth.CreateAuthorizationUrl(userId)
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
                var userId = _squareOAuth.ReadState(state);
                var profile = await EnsureProfileAsync(userId);

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

        private async Task<UserProfile> EnsureProfileAsync(Guid userId)
        {
            var profile = await _supabase.GetUserBySupabaseIdAsync(userId);
            if (profile != null) return profile;

            var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
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
    }
}
