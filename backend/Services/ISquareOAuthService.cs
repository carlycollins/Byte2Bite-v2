namespace backend.Services
{
    public record SquareOAuthToken(
        string AccessToken,
        string RefreshToken,
        string MerchantId,
        DateTimeOffset? ExpiresAt);

    public interface ISquareOAuthService
    {
        string CreateAuthorizationUrl(int restaurantId, Guid userId);
        (int RestaurantId, Guid UserId) ReadState(string state);
        Task<SquareOAuthToken> ExchangeCodeAsync(string code, CancellationToken cancellationToken = default);
        string FrontendReturnUrl { get; }
    }
}
