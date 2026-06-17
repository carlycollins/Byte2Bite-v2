using Square;

namespace backend.Services
{
    public class SquareClientFactory : ISquareClientFactory
    {
        private readonly IConfiguration _configuration;

        public SquareClientFactory(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public SquareClient Create(string accessToken)
        {
            var environment = _configuration["Square:Environment"] ?? "sandbox";

            return new SquareClient(
                token: accessToken,
                clientOptions: new ClientOptions
                {
                    BaseUrl = environment.Equals("production", StringComparison.OrdinalIgnoreCase)
                        ? SquareEnvironment.Production
                        : SquareEnvironment.Sandbox
                });
        }
    }
}
