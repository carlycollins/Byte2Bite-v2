namespace backend.Services
{
    public record SquareOAuthToken(
        string AccessToken,
        string RefreshToken,
        string MerchantId,
        DateTimeOffset? ExpiresAt);

    public interface ISquareOAuthService
    {
        string CreateAuthorizationUrl(Guid userId);
        Guid ReadState(string state);
        Task<SquareOAuthToken> ExchangeCodeAsync(string code, CancellationToken cancellationToken = default);
        string FrontendReturnUrl { get; }
    }
}
