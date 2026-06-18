using System.Security.Claims;
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
        public async Task<IActionResult> Authorize(int restaurantId)
        {
            var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            if (!Guid.TryParse(subject, out var userId)) return Unauthorized();

            var profile = await _supabase.GetUserBySupabaseIdAsync(userId);
            if (profile == null || profile.Restaurant_Id != restaurantId) return Forbid();

            return Ok(new
            {
                authorizationUrl = _squareOAuth.CreateAuthorizationUrl(restaurantId, userId)
            });
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
                var (restaurantId, userId) = _squareOAuth.ReadState(state);
                var profile = await _supabase.GetUserBySupabaseIdAsync(userId);
                if (profile == null || profile.Restaurant_Id != restaurantId)
                {
                    return RedirectToFrontend("error", "This Square connection is no longer valid.");
                }

                var restaurant = await _supabase.GetRestaurantByIdAsync(restaurantId);
                if (restaurant == null)
                {
                    return RedirectToFrontend("error", "The restaurant could not be found.");
                }

                var token = await _squareOAuth.ExchangeCodeAsync(code, cancellationToken);
                var imported = await _squareMenuSync.ImportMenuItemsAsync(
                    restaurantId,
                    token.AccessToken,
                    cancellationToken);

                restaurant.SquareId = token.MerchantId;
                restaurant.SquareAccessToken = token.AccessToken;
                restaurant.SquareRefreshToken = token.RefreshToken;
                restaurant.SquareTokenExpiresAt = token.ExpiresAt;

                if (await _supabase.UpdateRestaurantAsync(restaurantId, restaurant) == null)
                {
                    throw new InvalidOperationException("Failed to save the Square connection.");
                }

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
    }
}
