using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;

namespace backend.Services
{
    public class SquareOAuthService : ISquareOAuthService
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ITimeLimitedDataProtector _stateProtector;

        public SquareOAuthService(
            HttpClient httpClient,
            IConfiguration configuration,
            IDataProtectionProvider dataProtectionProvider)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _stateProtector = dataProtectionProvider
                .CreateProtector("Byte2Bite.SquareOAuth.State.v1")
                .ToTimeLimitedDataProtector();
        }

        public string FrontendReturnUrl => RequiredSetting("Square:FrontendReturnUrl");

        public string CreateAuthorizationUrl(Guid userId)
        {
            var state = _stateProtector.Protect(
                JsonSerializer.Serialize(new OAuthState(userId), JsonOptions),
                TimeSpan.FromMinutes(10));

            var query = new Dictionary<string, string?>
            {
                ["client_id"] = RequiredSetting("Square:ApplicationId"),
                ["scope"] = "ITEMS_READ ORDERS_READ MERCHANT_PROFILE_READ",
                ["state"] = state,
                ["redirect_uri"] = RequiredSetting("Square:OAuthRedirectUri")
            };

            return QueryHelpers.AddQueryString($"{OAuthBaseUrl}/authorize", query);
        }

        public Guid ReadState(string state)
        {
            var json = _stateProtector.Unprotect(state);
            var payload = JsonSerializer.Deserialize<OAuthState>(json, JsonOptions)
                ?? throw new InvalidOperationException("The Square authorization state is invalid.");
            return payload.UserId;
        }

        public async Task<SquareOAuthToken> ExchangeCodeAsync(
            string code,
            CancellationToken cancellationToken = default)
        {
            var request = new
            {
                client_id = RequiredSetting("Square:ApplicationId"),
                client_secret = RequiredSetting("Square:ApplicationSecret"),
                code,
                grant_type = "authorization_code",
                redirect_uri = RequiredSetting("Square:OAuthRedirectUri")
            };

            using var response = await _httpClient.PostAsJsonAsync(
                $"{OAuthBaseUrl}/token",
                request,
                JsonOptions,
                cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Square token exchange failed ({(int)response.StatusCode}).");
            }

            var token = JsonSerializer.Deserialize<ObtainTokenResponse>(body, JsonOptions)
                ?? throw new InvalidOperationException("Square returned an empty token response.");

            if (string.IsNullOrWhiteSpace(token.AccessToken) ||
                string.IsNullOrWhiteSpace(token.RefreshToken) ||
                string.IsNullOrWhiteSpace(token.MerchantId))
            {
                throw new InvalidOperationException("Square returned an incomplete token response.");
            }

            DateTimeOffset? expiresAt = null;
            if (DateTimeOffset.TryParse(token.ExpiresAt, out var parsedExpiration))
            {
                expiresAt = parsedExpiration;
            }

            return new SquareOAuthToken(
                token.AccessToken,
                token.RefreshToken,
                token.MerchantId,
                expiresAt);
        }

        private string OAuthBaseUrl =>
            (_configuration["Square:Environment"] ?? "sandbox")
                .Equals("production", StringComparison.OrdinalIgnoreCase)
                ? "https://connect.squareup.com/oauth2"
                : "https://connect.squareupsandbox.com/oauth2";

        private string RequiredSetting(string key)
        {
            var value = _configuration[key];
            return !string.IsNullOrWhiteSpace(value)
                ? value
                : throw new InvalidOperationException($"{key} is missing.");
        }

        private record OAuthState(Guid UserId);

        private sealed class ObtainTokenResponse
        {
            [JsonPropertyName("access_token")]
            public string AccessToken { get; init; } = string.Empty;

            [JsonPropertyName("refresh_token")]
            public string RefreshToken { get; init; } = string.Empty;

            [JsonPropertyName("merchant_id")]
            public string MerchantId { get; init; } = string.Empty;

            [JsonPropertyName("expires_at")]
            public string? ExpiresAt { get; init; }
        }
    }
}
