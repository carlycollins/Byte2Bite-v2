namespace backend.Services
{
    public record SquareOAuthToken(
        string AccessToken,
        string RefreshToken,
        string MerchantId,
        DateTimeOffset? ExpiresAt);

    public interface ISquareOAuthService
    {
        string CreateAuthorizationUrl(Guid userId, string? email = null);
        (Guid UserId, string? Email) ReadState(string state);
        Task<SquareOAuthToken> ExchangeCodeAsync(string code, CancellationToken cancellationToken = default);
        string FrontendReturnUrl { get; }
    }
}
