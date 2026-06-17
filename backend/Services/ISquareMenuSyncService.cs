using System.Threading;
using System.Threading.Tasks;

namespace backend.Services
{
    public interface ISquareMenuSyncService
    {
        Task<int> ImportMenuItemsAsync(int restaurantId, string squareAccessToken, CancellationToken cancellationToken = default);
        Task<int> ImportMenuItemsForRestaurantAsync(int restaurantId, CancellationToken cancellationToken = default);
    }
}
