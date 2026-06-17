using Square;

namespace backend.Services
{
    public interface ISquareClientFactory
    {
        SquareClient Create(string accessToken);
    }
}
